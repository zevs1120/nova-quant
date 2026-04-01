"""Data sync — converts Nova Quant OHLCV (SQLite) into Qlib binary format.

Qlib needs data in a specific binary columnar format under ~/.qlib/qlib_data/.
This module reads from Nova Quant's SQLite database and writes Qlib-compatible
CSV files, then calls Qlib's dump_bin utility to convert them.

Run manually:  POST /api/data/sync
Run via cron:  python -m bridge.data_sync
"""

from __future__ import annotations

import csv
import re
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from bridge.config import settings


class SyncRequest(BaseModel):
    force: bool = Field(False, description="Force full re-sync even if data exists")
    symbols: list[str] | None = Field(
        None,
        description="Specific symbols to sync.  None = all active assets.",
    )


class SyncResult(BaseModel):
    status: str
    symbols_synced: int
    rows_exported: int
    elapsed_ms: int
    qlib_data_dir: str
    notes: list[str]


def _csv_staging_dir() -> Path:
    p = Path(settings.qlib_provider_uri).parent / "_csv_staging"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _qlib_target_dir() -> Path:
    p = Path(settings.qlib_provider_uri)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _read_ohlcv_from_sqlite(
    db_path: str,
    symbols: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Read OHLCV data from Nova Quant's SQLite database.

    Returns {symbol: [{date, open, high, low, close, volume, factor, change}, ...]}
    grouped by symbol.
    """
    if not Path(db_path).exists():
        raise FileNotFoundError(f"Nova Quant database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Discover the OHLCV table — Nova Quant may use different names
    tables = [
        row[0]
        for row in cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    ]

    ohlcv_table = None
    for candidate in ("ohlcv", "market_ohlcv", "candles", "bars", "price_history"):
        if candidate in tables:
            ohlcv_table = candidate
            break

    if ohlcv_table is None:
        conn.close()
        return {}

    if not re.match(r"^[a-zA-Z0-9_]+$", ohlcv_table):
        raise ValueError(f"Invalid table name: {ohlcv_table}")

    # Read columns to adapt to actual schema
    col_info = cursor.execute(f"PRAGMA table_info({ohlcv_table})").fetchall()
    col_names = {row["name"].lower() for row in col_info}

    # Build query — validate all column identifiers against safe pattern
    _COL_RE = re.compile(r"^[a-zA-Z0-9_]+$")

    def _safe_col(name: str) -> str:
        if not _COL_RE.match(name):
            raise ValueError(f"Invalid column name: {name}")
        return name

    symbol_col = _safe_col("symbol" if "symbol" in col_names else "asset_id")
    date_col = _safe_col(
        next(
            (c for c in ("date", "ts_open", "timestamp", "dt") if c in col_names),
            "date",
        )
    )
    open_col = _safe_col("open" if "open" in col_names else "open_price")
    high_col = _safe_col("high" if "high" in col_names else "high_price")
    low_col = _safe_col("low" if "low" in col_names else "low_price")
    close_col = _safe_col("close" if "close" in col_names else "close_price")
    volume_col = _safe_col("volume" if "volume" in col_names else "vol")

    query = f"""
        SELECT
            {symbol_col} as symbol,
            {date_col} as date,
            {open_col} as open,
            {high_col} as high,
            {low_col} as low,
            {close_col} as close,
            {volume_col} as volume
        FROM {ohlcv_table}
    """
    if symbols:
        placeholders = ", ".join("?" * len(symbols))
        query += f" WHERE {symbol_col} IN ({placeholders})"
        rows = cursor.execute(query, symbols).fetchall()
    else:
        rows = cursor.execute(query).fetchall()

    conn.close()

    # Group by symbol
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        sym = str(row["symbol"]).upper()
        if sym not in grouped:
            grouped[sym] = []

        # Normalize date — could be epoch ms, ISO string, or date string
        raw_date = row["date"]
        if isinstance(raw_date, (int, float)) and raw_date > 1_000_000_000_000:
            # Epoch ms → YYYY-MM-DD
            from datetime import datetime, timezone

            raw_date = datetime.fromtimestamp(
                raw_date / 1000, tz=timezone.utc
            ).strftime("%Y-%m-%d")
        elif isinstance(raw_date, (int, float)):
            from datetime import datetime, timezone

            raw_date = datetime.fromtimestamp(raw_date, tz=timezone.utc).strftime(
                "%Y-%m-%d"
            )
        else:
            raw_date = str(raw_date)[:10]

        grouped[sym].append(
            {
                "date": raw_date,
                "open": float(row["open"] or 0),
                "high": float(row["high"] or 0),
                "low": float(row["low"] or 0),
                "close": float(row["close"] or 0),
                "volume": float(row["volume"] or 0),
                "factor": 1.0,  # No adjustment factor available
                "change": 0.0,
            }
        )

    return grouped


def _write_csvs(grouped: dict[str, list[dict[str, Any]]], staging_dir: Path) -> int:
    """Write per-symbol CSV files in Qlib's expected format."""
    total_rows = 0

    for symbol, rows in grouped.items():
        rows.sort(key=lambda r: r["date"])
        csv_path = staging_dir / f"{symbol}.csv"

        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "date",
                    "open",
                    "high",
                    "low",
                    "close",
                    "volume",
                    "factor",
                    "change",
                ],
            )
            writer.writeheader()
            writer.writerows(rows)
            total_rows += len(rows)

    return total_rows


def _run_dump_bin(csv_dir: Path, target_dir: Path) -> str:
    """Execute Qlib's dump_bin script to convert CSVs into binary format."""
    try:
        # Check if scripts/dump_bin.py exists (downloaded from Qlib repo)
        script_path = Path("scripts/dump_bin.py")
        if not script_path.exists():
            return "dump_bin.py not found in scripts/. Run: curl -sSL https://raw.githubusercontent.com/microsoft/qlib/main/scripts/dump_bin.py > scripts/dump_bin.py"

        result = subprocess.run(
            [
                "python",
                str(script_path),
                "dump_all",
                "--data_path",
                str(csv_dir),
                "--qlib_dir",
                str(target_dir),
                "--include_fields",
                "open,high,low,close,volume,factor,change",
                "--date_field_name",
                "date",
                "--symbol_field_name",
                "symbol",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            return f"dump_bin returned code {result.returncode}: {result.stderr[:500]}"

        return "ok"
    except FileNotFoundError:
        return "dump_bin not available — CSV data staged but not converted"
    except subprocess.TimeoutExpired:
        return "dump_bin timed out after 300s"
    except Exception as e:
        return f"dump_bin error: {e}"


def run_sync(req: SyncRequest | None = None) -> SyncResult:
    """Main sync entry point."""
    t0 = time.time()
    req = req or SyncRequest()
    notes: list[str] = []

    # 1. Read from SQLite
    try:
        grouped = _read_ohlcv_from_sqlite(settings.nova_quant_db, req.symbols)
    except FileNotFoundError as e:
        return SyncResult(
            status="error",
            symbols_synced=0,
            rows_exported=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            qlib_data_dir=settings.qlib_provider_uri,
            notes=[str(e)],
        )

    if not grouped:
        notes.append("No OHLCV data found in Nova Quant database")
        return SyncResult(
            status="no_data",
            symbols_synced=0,
            rows_exported=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            qlib_data_dir=settings.qlib_provider_uri,
            notes=notes,
        )

    # 2. Write CSVs
    staging_dir = _csv_staging_dir()
    total_rows = _write_csvs(grouped, staging_dir)
    notes.append(f"Exported {len(grouped)} symbols, {total_rows} rows to CSV staging")

    # 3. Convert to Qlib binary
    target_dir = _qlib_target_dir()
    dump_result = _run_dump_bin(staging_dir, target_dir)
    sync_status = "ok"
    if dump_result != "ok":
        sync_status = "partial"
        notes.append(f"Binary conversion failed: {dump_result}")
        notes.append(
            "You can manually convert with: "
            "python scripts/dump_bin.py dump_all "
            f"--data_path {staging_dir} --qlib_dir {target_dir}"
        )

    elapsed_ms = int((time.time() - t0) * 1000)
    return SyncResult(
        status=sync_status,
        symbols_synced=len(grouped),
        rows_exported=total_rows,
        elapsed_ms=elapsed_ms,
        qlib_data_dir=str(target_dir),
        notes=notes,
    )


# ── CLI entry point ─────────────────────────────────────────

if __name__ == "__main__":
    print("[data-sync] Starting Nova Quant → Qlib data sync...")
    result = run_sync()
    print(f"[data-sync] Done: {result.model_dump_json(indent=2)}")

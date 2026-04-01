"""Data sync — converts Nova Quant OHLCV (Postgres) into Qlib binary format.

Qlib needs data in a specific binary columnar format under ~/.qlib/qlib_data/.
This module reads from Nova Quant's Postgres database and writes Qlib-compatible
CSV files, then calls Qlib's dump_bin utility to convert them.

Run manually:  POST /api/data/sync
Run via cron:  python -m bridge.data_sync
"""

from __future__ import annotations

import csv
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from psycopg import connect
from psycopg.rows import dict_row

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


def _normalize_date(raw_date: Any) -> str:
    if isinstance(raw_date, (int, float)) and raw_date > 1_000_000_000_000:
        return datetime.fromtimestamp(raw_date / 1000, tz=timezone.utc).strftime(
            "%Y-%m-%d"
        )
    if isinstance(raw_date, (int, float)):
        return datetime.fromtimestamp(raw_date, tz=timezone.utc).strftime("%Y-%m-%d")
    return str(raw_date)[:10]


def _read_ohlcv_from_postgres(
    database_url: str,
    symbols: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Read OHLCV data from Nova Quant's Postgres database.

    Returns {symbol: [{date, open, high, low, close, volume, factor, change}, ...]}
    grouped by symbol.
    """
    if not database_url.strip():
        raise ValueError("QLIB_BRIDGE_NOVA_QUANT_DATABASE_URL is required")

    with connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cursor:
            rows = cursor.execute(
                """
                SELECT
                  a.symbol AS symbol,
                  o.ts_open AS date,
                  o.open AS open,
                  o.high AS high,
                  o.low AS low,
                  o.close AS close,
                  o.volume AS volume
                FROM novaquant_data.ohlcv AS o
                JOIN novaquant_data.assets AS a
                  ON a.asset_id = o.asset_id
                WHERE o.timeframe = '1d'
                  AND (
                    %(symbols)s::text[] IS NULL
                    OR cardinality(%(symbols)s::text[]) = 0
                    OR a.symbol = ANY(%(symbols)s::text[])
                  )
                ORDER BY a.symbol ASC, o.ts_open ASC
                """,
                {"symbols": symbols or None},
            ).fetchall()

    if not rows:
        return {}

    # Group by symbol
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        sym = str(row["symbol"]).upper()
        if sym not in grouped:
            grouped[sym] = []
        grouped[sym].append(
            {
                "date": _normalize_date(row["date"]),
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

    # 1. Read from Postgres
    try:
        grouped = _read_ohlcv_from_postgres(
            settings.nova_quant_database_url,
            req.symbols,
        )
    except ValueError as e:
        return SyncResult(
            status="error",
            symbols_synced=0,
            rows_exported=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            qlib_data_dir=settings.qlib_provider_uri,
            notes=[str(e)],
        )

    if not grouped:
        notes.append("No OHLCV data found in Nova Quant Postgres")
        return SyncResult(
            status="no_data",
            symbols_synced=0,
            rows_exported=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            qlib_data_dir=settings.qlib_provider_uri,
            notes=notes,
        )

    # 2. Write CSVs (clean stale staging first)
    staging_dir = _csv_staging_dir()
    for old_csv in staging_dir.glob("*.csv"):
        old_csv.unlink()
    total_rows = _write_csvs(grouped, staging_dir)
    notes.append(f"Exported {len(grouped)} symbols, {total_rows} rows to CSV staging")

    # 3. Clean stale Qlib binary data before re-dump
    target_dir = _qlib_target_dir()
    import shutil

    for subdir in ("features", "instruments", "calendars"):
        stale = target_dir / subdir
        if stale.exists():
            shutil.rmtree(stale)

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

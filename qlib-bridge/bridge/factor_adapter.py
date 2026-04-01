"""Factor computation adapter — wraps Qlib's Alpha158/Alpha360 factor engine.

Translates between Nova Quant's factor request format and Qlib's DataHandler API,
returning a clean JSON structure that factorMeasurements.ts can consume.
"""

from __future__ import annotations

import time
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, Field

from bridge.config import settings


# ── Request / Response schemas ──────────────────────────────


class FactorRequest(BaseModel):
    symbols: list[str] = Field(
        ...,
        description="List of stock symbols (e.g. ['AAPL', 'MSFT'])",
        max_length=50,
    )
    factor_set: Literal["Alpha158", "Alpha360"] = "Alpha158"
    start_date: str = Field(
        ...,
        description="Start date in YYYY-MM-DD format",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    end_date: str = Field(
        ...,
        description="End date in YYYY-MM-DD format",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    include_label: bool = Field(
        False,
        description="Whether to include forward return labels",
    )


class FactorResultRow(BaseModel):
    symbol: str
    date: str
    factors: dict[str, float | None]


class FactorComputeResult(BaseModel):
    status: str
    factor_set: str
    factor_count: int
    row_count: int
    symbols_used: list[str]
    date_range: dict[str, str]
    elapsed_ms: int
    rows: list[FactorResultRow]


# ── Available factor sets ───────────────────────────────────

_FACTOR_SETS = {
    "Alpha158": {
        "id": "Alpha158",
        "factor_count": 158,
        "description": "158 hand-crafted technical factors covering price, volume, "
        "volatility, and correlation patterns. Standard benchmark in Qlib.",
        "categories": [
            "KBAR (6 factors) — candlestick body ratios",
            "KLEN (6 factors) — high-low range ratios",
            "KMID (6 factors) — mid-price ratios",
            "KUP/KLOW (12 factors) — upper/lower shadow ratios",
            "KSFT (6 factors) — shift-based features",
            "OPEN/HIGH/LOW/CLOSE/VWAP (5×6 factors) — rolling windows",
            "ROC (6 factors) — rate of change",
            "MA (6 factors) — moving average ratios",
            "STD (6 factors) — rolling std",
            "BETA (6 factors) — rolling beta",
            "RSQR (6 factors) — rolling R-squared",
            "RESI (6 factors) — rolling residual",
            "MAX/MIN (12 factors) — rolling max/min",
            "QTLU/QTLD (12 factors) — quantile features",
            "RANK (6 factors) — cross-sectional rank",
            "RSV (6 factors) — relative strength value",
            "IMAX/IMIN (12 factors) — argmax/argmin",
            "IMXD (6 factors) — argmax-argmin diff",
            "CORR/CORD (12 factors) — rolling correlation",
            "CNTP/CNTN/CNTD (18 factors) — positive/negative return days",
            "SUMP/SUMN/SUMD (18 factors) — positive/negative return sums",
            "VMA/VSTD (12 factors) — volume moving avg/std",
            "WVMA (6 factors) — weighted volume MA",
            "VSUMP/VSUMN/VSUMD (18 factors) — volume sum features",
        ],
    },
    "Alpha360": {
        "id": "Alpha360",
        "factor_count": 360,
        "description": "360 factors — raw OHLCV values over multiple lookback windows. "
        "Less hand-crafted, more suitable for deep learning models.",
        "categories": [
            "OPEN (60 factors) — 60 days of normalized open prices",
            "HIGH (60 factors) — 60 days of normalized high prices",
            "LOW (60 factors) — 60 days of normalized low prices",
            "CLOSE (60 factors) — 60 days of normalized close prices",
            "VWAP (60 factors) — 60 days of normalized VWAP",
            "VOLUME (60 factors) — 60 days of normalized volume",
        ],
    },
}


def list_available_factor_sets() -> list[dict[str, Any]]:
    return list(_FACTOR_SETS.values())


# ── Core computation ────────────────────────────────────────


def _safe_float(v: Any) -> float | None:
    """Convert numpy/pandas values to JSON-safe float."""
    if v is None:
        return None
    try:
        f = float(v)
        if np.isfinite(f):
            return round(f, 8)
        return None
    except (TypeError, ValueError):
        return None


def compute_factors(req: FactorRequest) -> FactorComputeResult:
    """Compute factors using Qlib's built-in DataHandler (Alpha158 / Alpha360)."""
    t0 = time.time()

    # Enforce resource limits
    symbols = req.symbols[: settings.max_universe_size]

    # --- Import Qlib handler ---
    from qlib.contrib.data.handler import Alpha158, Alpha360

    HandlerCls = Alpha158 if req.factor_set == "Alpha158" else Alpha360

    # --- Build handler ---
    handler = HandlerCls(
        instruments=symbols,
        start_time=req.start_date,
        end_time=req.end_date,
        fit_start_time=req.start_date,
        fit_end_time=req.end_date,
        infer_processors=[],
        learn_processors=[],
    )

    # --- Fetch data ---
    df = handler.fetch(col_set="feature")

    if req.include_label:
        try:
            label_df = handler.fetch(col_set="label")
            df = df.join(label_df, how="left")
        except Exception:
            pass  # Labels may not be available

    # --- Convert to JSON-serialisable rows ---
    factor_names = list(df.columns)
    rows: list[FactorResultRow] = []
    symbols_seen: set[str] = set()

    for (dt, symbol), values in df.iterrows():
        symbols_seen.add(str(symbol))
        rows.append(
            FactorResultRow(
                symbol=str(symbol),
                date=str(dt.date()) if hasattr(dt, "date") else str(dt),
                factors={col: _safe_float(values[col]) for col in factor_names},
            )
        )

    elapsed_ms = int((time.time() - t0) * 1000)

    return FactorComputeResult(
        status="ok",
        factor_set=req.factor_set,
        factor_count=len(factor_names),
        row_count=len(rows),
        symbols_used=sorted(symbols_seen),
        date_range={"start": req.start_date, "end": req.end_date},
        elapsed_ms=elapsed_ms,
        rows=rows,
    )

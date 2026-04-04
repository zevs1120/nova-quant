"""Native Backtest Adapter — runs Qlib's internal simulation engine.

This uses the data-handler -> strategy -> executor pipeline to compute 
standard quant metrics like Sharpe Ratio, annualized return, etc.
"""

from __future__ import annotations

import time
import pandas as pd
import numpy as np
from typing import Any, Literal
from pydantic import BaseModel, Field

# --- Qlib Core ---
import qlib
from qlib.contrib.data.handler import Alpha158, Alpha360
from qlib.contrib.strategy import TopkDropoutStrategy
from qlib.backtest import backtest as bt_fn
from qlib.backtest.executor import SimulatorExecutor


class BacktestRequest(BaseModel):
    symbols: list[str] = Field(..., max_length=100)
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    factor_set: Literal["Alpha158", "Alpha360"] = "Alpha158"
    benchmark: str = Field("spy", description="Benchmark symbol (e.g. spy, qqq)")
    topk: int = 3
    n_drop: int = 1


class BacktestMetrics(BaseModel):
    sharpe: float
    annualized_return: float
    max_drawdown: float
    avg_daily_return: float
    trading_days: int


class BacktestResult(BaseModel):
    status: str
    metrics: BacktestMetrics | None
    elapsed_ms: int
    notes: list[str]


def run_native_backtest(req: BacktestRequest) -> BacktestResult:
    """Executes the Qlib native backtest pipeline."""
    t0 = time.time()
    notes = []
    
    try:
        # 1. Fetch data for features (needed for the signal proxy)
        HandlerCls = Alpha158 if req.factor_set == "Alpha158" else Alpha360
        hd = HandlerCls(
            instruments=req.symbols,
            start_time=req.start_date,
            end_time=req.end_date,
        )
        df_features = hd.fetch(col_set="feature")
        
        if df_features.empty:
            return BacktestResult(
                status="no_data",
                metrics=None,
                elapsed_ms=int((time.time() - t0) * 1000),
                notes=["No feature data found for the given range/symbols"],
            )

        # 2. Mock Signal (using raw ROCP5 or similar as a proxy)
        signal_col = [c for c in df_features.columns if "ROCP5" in str(c)]
        if not signal_col:
            signal_col = [df_features.columns[0]]
            notes.append(f"ROCP5 not found, falling back to {signal_col[0]} for signal")
        
        pred_df = df_features[signal_col[0]].to_frame("score")

        # 3. Strategy & Executor
        strategy = TopkDropoutStrategy(
            topk=req.topk,
            n_drop=req.n_drop,
            signal=pred_df,
        )
        
        # Use our newly supported native benchmarks
        executor = SimulatorExecutor(
            time_per_step="day",
            generate_report=True,
            account_config={"benchmark_config": {"benchmark": req.benchmark.upper()}}
        )

        # 4. Run Qlib Engine
        report_df, positions = bt_fn(
            start_time=req.start_date,
            end_time=req.end_date,
            strategy=strategy,
            executor=executor
        )

        if report_df.empty:
            return BacktestResult(
                status="empty_report",
                metrics=None,
                elapsed_ms=int((time.time() - t0) * 1000),
                notes=["Strategy generated no trades or report is empty"],
            )

        # 5. Extract Metrics (using geometric returns for accuracy)
        daily_ret = report_df["return"]
        avg_ret = daily_ret.mean()
        std_ret = daily_ret.std()
        
        # Accurate geometric max drawdown
        cumulative = (1 + daily_ret).cumprod()
        rolling_max = cumulative.cummax()
        drawdown = (cumulative - rolling_max) / rolling_max
        max_dd = float(drawdown.min())

        sharpe = (avg_ret / std_ret) * np.sqrt(252) if std_ret > 0 else 0.0
        ann_ret = avg_ret * 252

        metrics = BacktestMetrics(
            sharpe=round(float(sharpe), 4),
            annualized_return=round(float(ann_ret), 4),
            max_drawdown=round(float(max_dd), 4),
            avg_daily_return=round(float(avg_ret), 4),
            trading_days=len(report_df)
        )

        return BacktestResult(
            status="ok",
            metrics=metrics,
            elapsed_ms=int((time.time() - t0) * 1000),
            notes=notes
        )

    except Exception as e:
        import traceback
        return BacktestResult(
            status="error",
            metrics=None,
            elapsed_ms=int((time.time() - t0) * 1000),
            notes=[f"Exception: {str(e)}", traceback.format_exc()[-500:]]
        )

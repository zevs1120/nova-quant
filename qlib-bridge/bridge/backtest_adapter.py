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
from qlib.config import C
from qlib.contrib.data.handler import Alpha158, Alpha360
from qlib.contrib.strategy import TopkDropoutStrategy
from qlib.backtest import backtest as bt_fn
from qlib.backtest.executor import SimulatorExecutor

from bridge.config import settings


class BacktestRequest(BaseModel):
    symbols: list[str] = Field(..., max_length=100)
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    factor_set: Literal["Alpha158", "Alpha360"] = "Alpha158"
    benchmark: str | None = Field(None, description="Benchmark symbol (e.g. spy, qqq)")
    topk: int = 3
    n_drop: int = 1


class BacktestMetrics(BaseModel):
    sharpe: float
    annualized_return: float | None
    max_drawdown: float
    avg_daily_return: float | None
    trading_days: int


class BacktestResult(BaseModel):
    status: str
    metrics: BacktestMetrics | None
    elapsed_ms: int
    notes: list[str]


def run_native_backtest(req: BacktestRequest) -> BacktestResult:
    """Executes the Qlib native backtest pipeline with robust parsing."""
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

        # 2. Mock Signal (using raw ROCP5 or similar as a proxy for v2)
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
        
        # 🛠️ DYNAMIC BENCHMARK OVERRIDE
        # Force Qlib to use our requested benchmark, avoiding hardcoded library defaults
        benchmark_name = (req.benchmark or settings.default_benchmark).lower()
        C.benchmark = benchmark_name.upper()
        
        executor = SimulatorExecutor(
            time_per_step="day",
            generate_report=True,
            account_config={"benchmark_config": {"benchmark": benchmark_name}}
        )

        # 4. Run Qlib Engine
        # Explicitly pass benchmark to override the library's hardcoded 'SH000300' default
        result_bt = bt_fn(
            start_time=req.start_date,
            end_time=req.end_date,
            strategy=strategy,
            executor=executor,
            benchmark=benchmark_name.upper()
        )

        # 🛠️ RECURSIVE SEARCH FOR THE REPORT DATAFRAME
        # Qlib versions vary wildy in return types (tuples of dicts, nested dicts, etc.)
        def find_report_df(obj, visited=None):
            if visited is None: visited = set()
            if id(obj) in visited: return None
            visited.add(id(obj))
            
            if isinstance(obj, pd.DataFrame):
                # Backtest reports usually have 'value' or 'pa' or 'return'
                if any(c in obj.columns for c in ["value", "return", "pa", "ret"]):
                    return obj
            if isinstance(obj, dict):
                for v in obj.values():
                    res = find_report_df(v, visited)
                    if res is not None: return res
            if isinstance(obj, (list, tuple)):
                for v in obj:
                    res = find_report_df(v, visited)
                    if res is not None: return res
            return None

        report_df = find_report_df(result_bt)

        if report_df is None:
            return BacktestResult(
                status="parse_error",
                metrics=None,
                elapsed_ms=int((time.time() - t0) * 1000),
                notes=[f"Could not find report DataFrame in Qlib output. Type: {type(result_bt)}"],
            )

        # 5. Extract Metrics (using account value for accuracy)
        report_df = report_df.sort_index()
        
        if "value" in report_df.columns:
            daily_ret = report_df["value"].pct_change().replace([np.inf, -np.inf], np.nan).fillna(0)
        else:
            # Fallback to column detection
            ret_col = None
            for col in ["return", "ret", "pa"]:
                if col in report_df.columns:
                    ret_col = col
                    break
            if ret_col is None:
                ret_col = report_df.columns[0]
            daily_ret = report_df[ret_col].replace([np.inf, -np.inf], np.nan).fillna(0)

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
            annualized_return=round(float(ann_ret), 4) if not np.isnan(ann_ret) else None,
            max_drawdown=round(float(max_dd), 4),
            avg_daily_return=round(float(avg_ret), 4) if not np.isnan(avg_ret) else None,
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

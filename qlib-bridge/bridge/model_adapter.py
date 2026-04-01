"""Model inference adapter — loads pre-trained Qlib models and returns predictions.

Models are trained offline (e.g. on a Mac or Colab) and deployed as pickle files
to the `models/` directory.  This adapter handles loading and inference only —
no training happens on the 2 GB EC2.
"""

from __future__ import annotations

import pickle
import time
from pathlib import Path
from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from bridge.config import settings


# ── Request / Response schemas ──────────────────────────────


class ModelPredictRequest(BaseModel):
    model_name: str = Field(
        ...,
        description="Name of the pre-trained model file (without extension), "
        "e.g. 'lightgbm_alpha158'",
    )
    symbols: list[str] = Field(
        ...,
        description="Symbols to predict for",
        max_length=50,
    )
    predict_date: str = Field(
        ...,
        description="The date to predict (YYYY-MM-DD).  Factors up to this date "
        "will be used as input.",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    factor_set: str = "Alpha158"
    lookback_days: int = Field(
        60,
        description="How many days of factor history to feed the model",
        ge=5,
        le=365,
    )


class PredictionRow(BaseModel):
    symbol: str
    score: float
    rank: int


class ModelPredictResult(BaseModel):
    status: str
    model_name: str
    predict_date: str
    prediction_count: int
    elapsed_ms: int
    predictions: list[PredictionRow]


# ── Model discovery ─────────────────────────────────────────

_MODEL_EXTENSIONS = (".pkl", ".pickle", ".joblib")


def _model_dir() -> Path:
    p = Path(settings.model_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def list_available_models() -> list[dict[str, Any]]:
    """List all model files found in the models/ directory."""
    models: list[dict[str, Any]] = []
    model_dir = _model_dir()

    for f in sorted(model_dir.iterdir()):
        if f.suffix in _MODEL_EXTENSIONS and f.is_file():
            models.append(
                {
                    "name": f.stem,
                    "file": f.name,
                    "size_kb": round(f.stat().st_size / 1024, 1),
                }
            )

    if not models:
        models.append(
            {
                "name": "(none)",
                "file": None,
                "size_kb": 0,
                "note": "No pre-trained models found.  Train a model locally and "
                "place the .pkl file in qlib-bridge/models/",
            }
        )

    return models


# ── Model loading (cached) ──────────────────────────────────

_model_cache: dict[str, Any] = {}


def _load_model(name: str) -> Any:
    if name in _model_cache:
        return _model_cache[name]

    model_dir = _model_dir()
    candidates = [model_dir / f"{name}{ext}" for ext in _MODEL_EXTENSIONS]
    path = next((c for c in candidates if c.exists()), None)

    if path is None:
        raise FileNotFoundError(
            f"Model '{name}' not found.  Looked in {model_dir} for "
            f"{[c.name for c in candidates]}"
        )

    with open(path, "rb") as f:
        model = pickle.load(f)

    _model_cache[name] = model
    print(
        f"[qlib-bridge] Loaded model: {path.name} ({path.stat().st_size / 1024:.1f} KB)"
    )
    return model


# ── Inference ───────────────────────────────────────────────


def _safe_float(v: Any) -> float:
    try:
        f = float(v)
        return round(f, 8) if np.isfinite(f) else 0.0
    except (TypeError, ValueError):
        return 0.0


def predict(req: ModelPredictRequest) -> ModelPredictResult:
    """Load a pre-trained model, compute factors, run inference, and return ranking."""
    t0 = time.time()

    # 1. Load model
    model = _load_model(req.model_name)

    # 2. Compute features via Qlib
    from bridge.factor_adapter import compute_factors, FactorRequest

    end_date = req.predict_date
    # Build a rough start date for factor lookback
    from datetime import datetime, timedelta

    dt = datetime.strptime(req.predict_date, "%Y-%m-%d")
    start_date = (dt - timedelta(days=req.lookback_days)).strftime("%Y-%m-%d")

    factor_result = compute_factors(
        FactorRequest(
            symbols=req.symbols,
            factor_set=req.factor_set,
            start_date=start_date,
            end_date=end_date,
        )
    )

    if not factor_result.rows:
        return ModelPredictResult(
            status="no_data",
            model_name=req.model_name,
            predict_date=req.predict_date,
            prediction_count=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            predictions=[],
        )

    # 3. Build feature matrix for the latest date
    latest_date = max(r.date for r in factor_result.rows)
    latest_rows = [r for r in factor_result.rows if r.date == latest_date]

    if not latest_rows:
        return ModelPredictResult(
            status="no_data",
            model_name=req.model_name,
            predict_date=req.predict_date,
            prediction_count=0,
            elapsed_ms=int((time.time() - t0) * 1000),
            predictions=[],
        )

    factor_names = sorted(latest_rows[0].factors.keys())
    symbols = [r.symbol for r in latest_rows]
    X = np.array(
        [[r.factors.get(f, 0.0) or 0.0 for f in factor_names] for r in latest_rows],
        dtype=np.float64,
    )
    # Replace NaN with 0 for safety
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    # 4. Run inference
    if hasattr(model, "predict"):
        scores = model.predict(X)
    elif callable(model):
        scores = model(X)
    else:
        raise TypeError(
            f"Model type {type(model)} does not support .predict() or __call__"
        )

    scores = [_safe_float(s) for s in scores]

    # 5. Build ranked output
    ranked = sorted(
        zip(symbols, scores),
        key=lambda x: x[1],
        reverse=True,
    )
    predictions = [
        PredictionRow(symbol=sym, score=score, rank=i + 1)
        for i, (sym, score) in enumerate(ranked)
    ]

    elapsed_ms = int((time.time() - t0) * 1000)
    return ModelPredictResult(
        status="ok",
        model_name=req.model_name,
        predict_date=req.predict_date,
        prediction_count=len(predictions),
        elapsed_ms=elapsed_ms,
        predictions=predictions,
    )

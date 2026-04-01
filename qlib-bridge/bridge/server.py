"""FastAPI server — the bridge between Nova Quant (TypeScript) and Qlib (Python).

All endpoints return JSON that Nova Quant's signalEngine / factorMeasurements
can consume directly.  The server is intentionally stateless between requests;
Qlib is initialised once at startup.
"""

from __future__ import annotations

import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from bridge import __version__
from bridge.config import settings
from bridge.factor_adapter import (
    compute_factors,
    list_available_factor_sets,
    FactorRequest,
)
from bridge.model_adapter import (
    predict,
    list_available_models,
    ModelPredictRequest,
)
from bridge.data_sync import run_sync, SyncRequest, SyncResult

# ── Qlib init ───────────────────────────────────────────────

_qlib_ready = False


def _init_qlib() -> None:
    """Lazy-init Qlib with the configured provider URI."""
    global _qlib_ready
    if _qlib_ready:
        return
    try:
        import qlib
        from qlib.config import REG_US, REG_CN

        region = REG_CN if settings.qlib_region.lower() in ("cn", "china") else REG_US
        qlib.init(provider_uri=settings.qlib_provider_uri, region=region)
        _qlib_ready = True
        print(f"[qlib-bridge] Qlib initialised — provider={settings.qlib_provider_uri}")
    except Exception as exc:
        print(f"[qlib-bridge] Qlib init failed (data may not be prepared yet): {exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown hooks."""
    _init_qlib()
    yield


# ── App ─────────────────────────────────────────────────────

app = FastAPI(
    title="Nova Qlib Bridge",
    version=__version__,
    lifespan=lifespan,
)


# ── Health / Status ─────────────────────────────────────────


class StatusResponse(BaseModel):
    status: str
    version: str
    qlib_ready: bool
    provider_uri: str
    region: str
    max_universe_size: int
    uptime_seconds: float


_start_time = time.time()


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/status", response_model=StatusResponse)
async def status():
    return StatusResponse(
        status="running",
        version=__version__,
        qlib_ready=_qlib_ready,
        provider_uri=settings.qlib_provider_uri,
        region=settings.qlib_region,
        max_universe_size=settings.max_universe_size,
        uptime_seconds=round(time.time() - _start_time, 1),
    )


# ── Factor Computation ──────────────────────────────────────


@app.get("/api/factors/sets")
async def factor_sets():
    """List available factor sets (Alpha158, Alpha360, etc.)."""
    return list_available_factor_sets()


@app.post("/api/factors/compute")
async def compute_factors_endpoint(req: FactorRequest):
    """Compute Qlib factors for the given symbols and date range."""
    if not _qlib_ready:
        raise HTTPException(503, "Qlib is not initialised — run data sync first")
    try:
        result = compute_factors(req)
        return result
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(500, f"Factor computation failed: {exc}")


# ── Model Prediction ────────────────────────────────────────


@app.get("/api/models")
async def models():
    """List available pre-trained models."""
    return list_available_models()


@app.post("/api/models/predict")
async def predict_endpoint(req: ModelPredictRequest):
    """Run inference on a pre-trained model and return ranked predictions."""
    if not _qlib_ready:
        raise HTTPException(503, "Qlib is not initialised — run data sync first")
    try:
        result = predict(req)
        return result
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(500, f"Model prediction failed: {exc}")


# ── Data Sync ───────────────────────────────────────────────


@app.post("/api/data/sync", response_model=SyncResult)
async def sync_data(req: SyncRequest | None = None):
    """Sync OHLCV data from Nova Quant Postgres into Qlib binary format."""
    try:
        result = run_sync(req or SyncRequest())
        if result.status == "ok":
            _init_qlib()  # Re-init after fresh data
        return result
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(500, f"Data sync failed: {exc}")

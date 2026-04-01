# Nova Qlib Bridge

Python sidecar service that connects **Nova Quant** (TypeScript) to **Microsoft Qlib** (Python).

## What It Does

- **Factor Computation**: Exposes Qlib's Alpha158/Alpha360 factor engines via REST API
- **Model Inference**: Loads pre-trained ML models and returns ranked predictions
- **Data Sync**: Converts Nova Quant's SQLite OHLCV data into Qlib binary format

## Architecture

```
Nova Quant (TypeScript)
    ↕ HTTP (localhost:8788)
Qlib Bridge (Python FastAPI)     ← This service
    ↕ Qlib SDK
Qlib Core + Data (~/.qlib/)
```

Nova Quant's interfaces are **unchanged** — the bridge is purely additive.

## Quick Start

```bash
# From the nova-quant root
cd qlib-bridge

# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (uv handles venv + lock automatically)
uv sync

# Sync data from Nova Quant → Qlib format
uv run python -m bridge.data_sync

# Start the bridge server
uv run python -m bridge
# → Server running at http://127.0.0.1:8788
```

## API Endpoints

| Method | Path                   | Description                        |
| ------ | ---------------------- | ---------------------------------- |
| GET    | `/api/health`          | Health check                       |
| GET    | `/api/status`          | Service status + Qlib readiness    |
| GET    | `/api/factors/sets`    | List available factor sets         |
| POST   | `/api/factors/compute` | Compute factors for symbols        |
| GET    | `/api/models`          | List available pre-trained models  |
| POST   | `/api/models/predict`  | Run model inference                |
| POST   | `/api/data/sync`       | Sync Nova Quant data → Qlib format |

### Example: Compute Factors

```bash
curl -X POST http://localhost:8788/api/factors/compute \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "MSFT", "GOOGL"],
    "factor_set": "Alpha158",
    "start_date": "2024-01-01",
    "end_date": "2025-03-31"
  }'
```

## Configuration

All settings are overridable via env vars prefixed `QLIB_BRIDGE_`:

| Variable                        | Default                   | Description                            |
| ------------------------------- | ------------------------- | -------------------------------------- |
| `QLIB_BRIDGE_PORT`              | 8788                      | Server port                            |
| `QLIB_BRIDGE_HOST`              | 127.0.0.1                 | Server host                            |
| `QLIB_BRIDGE_QLIB_PROVIDER_URI` | ~/.qlib/qlib_data/us_data | Qlib data directory                    |
| `QLIB_BRIDGE_QLIB_REGION`       | us                        | Region (us / cn)                       |
| `QLIB_BRIDGE_NOVA_QUANT_DB`     | ../data/quant.db          | Nova Quant SQLite path                 |
| `QLIB_BRIDGE_MAX_UNIVERSE_SIZE` | 50                        | Max symbols per request (2GB RAM safe) |

## Pre-trained Models

Train models locally and place `.pkl` files in `qlib-bridge/models/`:

```bash
# On your Mac — train a LightGBM model
cd qlib-bridge
python scripts/train_lightgbm.py  # (to be created)

# The output model.pkl goes to models/lightgbm_alpha158.pkl
# Then deploy to EC2: scp models/*.pkl ec2:/opt/nova-quant/qlib-bridge/models/
```

## Deployment (EC2)

```bash
# Install uv on EC2
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
cd /opt/nova-quant/qlib-bridge && uv sync

# Install the systemd service
sudo cp deployment/nova-qlib-bridge.service /etc/systemd/system/
sudo systemctl enable nova-qlib-bridge
sudo systemctl start nova-qlib-bridge
```

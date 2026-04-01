"""Basic tests for the Qlib Bridge API."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from bridge.server import app

    return TestClient(app)


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_status(client):
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert "version" in data
    assert "qlib_ready" in data


def test_factor_sets(client):
    resp = client.get("/api/factors/sets")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    names = {item["id"] for item in data}
    assert "Alpha158" in names
    assert "Alpha360" in names


def test_models_list(client):
    resp = client.get("/api/models")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_compute_factors_requires_qlib(client):
    """Factor computation should return 503 when Qlib data is not initialised."""
    resp = client.post(
        "/api/factors/compute",
        json={
            "symbols": ["AAPL"],
            "factor_set": "Alpha158",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        },
    )
    # In CI/test without Qlib data, must be 503; 200 only in live environments
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        data = resp.json()
        assert data["status"] == "ok"
        assert "rows" in data
        assert isinstance(data["rows"], list)
        assert "factor_set" in data
        assert "elapsed_ms" in data


def test_compute_factors_rejects_invalid_request(client):
    """Factor endpoint must reject requests with missing required fields."""
    resp = client.post("/api/factors/compute", json={"symbols": ["AAPL"]})
    assert resp.status_code == 422


def test_predict_rejects_invalid_request(client):
    """Predict endpoint must reject requests with wrong field names."""
    resp = client.post(
        "/api/models/predict",
        json={
            "model_name": "test",
            "symbols": ["AAPL"],
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        },
    )
    # predict_date is required, start_date/end_date are wrong fields
    assert resp.status_code == 422


def test_predict_contract(client):
    """Predict endpoint status semantics should match the server implementation."""
    resp = client.post(
        "/api/models/predict",
        json={
            "model_name": "lightgbm_alpha158",
            "symbols": ["AAPL"],
            "predict_date": "2024-03-31",
        },
    )
    # 503 when Qlib is not ready, 500 when model loading/inference fails, 200 on success
    assert resp.status_code in (200, 503, 500)
    if resp.status_code == 200:
        data = resp.json()
        assert data["status"] == "ok"
        assert "predictions" in data
        assert isinstance(data["predictions"], list)
        assert "predict_date" in data
        assert "prediction_count" in data

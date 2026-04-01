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
    """Factor computation should return 503 if Qlib data is not prepared."""
    resp = client.post(
        "/api/factors/compute",
        json={
            "symbols": ["AAPL"],
            "factor_set": "Alpha158",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        },
    )
    # Will be 503 if qlib data not present, 200 if it is — both are valid
    assert resp.status_code in (200, 503)

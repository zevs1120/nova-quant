import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import pandas as pd
import numpy as np

# Import the app but we'll mock the internal qlib calls
from bridge.server import app

client = TestClient(app)

@pytest.fixture
def mock_qlib_components():
    # Patch at the point of use in backtest_adapter
    with patch("bridge.backtest_adapter.Alpha158") as mock_handler, \
         patch("bridge.backtest_adapter.bt_fn") as mock_bt, \
         patch("bridge.backtest_adapter.SimulatorExecutor") as mock_executor, \
         patch("bridge.server._qlib_ready", True):
        
        # Mock Alpha158 data fetch
        # Qlib features DF has MultiIndex [datetime, instrument]
        dates = pd.to_datetime(["2024-01-01", "2024-01-02"])
        instruments = ["AAPL", "MSFT"]
        index = pd.MultiIndex.from_product([dates, instruments], names=["datetime", "instrument"])
        
        # Ensure we have the necessary columns for the adapter logic (ROCP5 or KMID)
        mock_df = pd.DataFrame(
            np.random.randn(4, 2), 
            index=index, 
            columns=["FEATURE_1", "ROCP5"]
        )
        mock_handler.return_value.fetch.return_value = mock_df
        
        # Mock backtest report
        # The adapter calculates metrics from this report
        report_df = pd.DataFrame({
            "return": [0.01, -0.005],
            "cost": [0.001, 0.001],
            "bench": [0.005, 0.002]
        }, index=dates)
        mock_bt.return_value = (report_df, {})
        
        yield {
            "handler": mock_handler,
            "bt": mock_bt,
            "executor": mock_executor
        }

def test_native_backtest_endpoint_success(mock_qlib_components):
    """Test the native backtest API with successful mocks."""
    payload = {
        "symbols": ["AAPL", "MSFT"],
        "start_date": "2024-01-01",
        "end_date": "2024-03-31",
        "benchmark": "spy",
        "topk": 1
    }
    
    response = client.post("/api/v2/backtest/native", json=payload)
    
    # If it fails with 'error', the response JSON will contain notes with the traceback
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok", f"Expected ok but got error. Notes: {data.get('notes')}"
    assert "metrics" in data
    assert data["metrics"]["sharpe"] is not None
    assert data["metrics"]["trading_days"] == 2
    
    # Verify internal calls
    mock_qlib_components["handler"].assert_called_once()
    mock_qlib_components["bt"].assert_called_once()

def test_native_backtest_no_data(mock_qlib_components):
    """Test behavior when no data is returned."""
    mock_qlib_components["handler"].return_value.fetch.return_value = pd.DataFrame()
    
    payload = {
        "symbols": ["AAPL"],
        "start_date": "2024-01-01",
        "end_date": "2024-01-02"
    }
    
    response = client.post("/api/v2/backtest/native", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "no_data"

def test_native_backtest_not_ready():
    """Test error when Qlib is not initialized."""
    with patch("bridge.server._qlib_ready", False):
        response = client.post("/api/v2/backtest/native", json={
            "symbols": ["AAPL"], "start_date": "2024-01-01", "end_date": "2024-01-02"
        })
        assert response.status_code == 503
        assert "run data sync first" in response.json()["detail"]

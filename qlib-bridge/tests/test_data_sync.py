import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
import csv
import shutil
from bridge.data_sync import _read_ohlcv_from_postgres, _write_csvs, run_sync, SyncRequest

def test_change_calculation_logic():
    """Test that price change is calculated correctly between rows."""
    # Mock data from DB (raw rows as returned by psycopg)
    mock_rows = [
        {"symbol": "AAPL", "date": 1704067200000, "close": 100.0, "open": 99, "high": 101, "low": 98, "volume": 1000},
        {"symbol": "AAPL", "date": 1704153600000, "close": 110.0, "open": 101, "high": 111, "low": 100, "volume": 1100},
        {"symbol": "AAPL", "date": 1704240000000, "close": 104.5, "open": 110, "high": 112, "low": 104, "volume": 1200},
    ]
    
    with patch("bridge.data_sync.connect") as mock_connect:
        mock_conn = mock_connect.return_value.__enter__.return_value
        mock_cursor = mock_conn.cursor.return_value.__enter__.return_value
        # Ensure fetchall returns the mock rows directly
        mock_cursor.fetchall.return_value = mock_rows
        # Also mock execute to return the cursor itself for chaining
        mock_cursor.execute.return_value = mock_cursor
        
        result = _read_ohlcv_from_postgres("mock_url")
        
        # Result keys are converted to UPPER by the adapter
        assert "AAPL" in result
        aapl_data = result["AAPL"]
        assert len(aapl_data) == 3
        # First row change should be 0.0
        assert aapl_data[0]["change"] == 0.0
        # Second row: (110 - 100) / 100 = 0.1
        assert pytest.approx(aapl_data[1]["change"]) == 0.1
        # Third row: (104.5 - 110) / 110 = -0.05
        assert pytest.approx(aapl_data[2]["change"]) == -0.05

def test_instrument_file_generation(tmp_path):
    """Test that all.txt and benchmark files are generated correctly."""
    grouped_data = {
        "AAPL": [{"date": "2024-01-01", "close": 100, "open": 99, "high": 101, "low": 98, "volume": 10, "factor": 1, "change": 0}],
        "SPY": [{"date": "2024-01-01", "close": 400, "open": 399, "high": 401, "low": 398, "volume": 10, "factor": 1, "change": 0}],
    }
    
    with patch("bridge.data_sync._qlib_target_dir", return_value=tmp_path):
        staging_dir = tmp_path / "staging"
        staging_dir.mkdir(parents=True, exist_ok=True) # Ensure staging exists
        
        _write_csvs(grouped_data, staging_dir)
        
        inst_dir = tmp_path / "instruments"
        assert (inst_dir / "all.txt").exists()
        assert (inst_dir / "spy.txt").exists()
        
        # Check all.txt content
        with open(inst_dir / "all.txt") as f:
            content = f.read()
            assert "AAPL\t2024-01-01\t2024-01-01" in content
            assert "SPY\t2024-01-01\t2024-01-01" in content

def test_run_sync_preserves_instruments(tmp_path):
    """Verify that instruments directory is NOT deleted during run_sync."""
    qlib_dir = tmp_path / "qlib_data"
    inst_dir = qlib_dir / "instruments"
    inst_dir.mkdir(parents=True)
    (inst_dir / "keep_me.txt").write_text("data")
    
    staging_dir = tmp_path / "staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    
    # Mock settings and internal calls
    with patch("bridge.data_sync.settings") as mock_settings, \
         patch("bridge.data_sync._qlib_target_dir", return_value=qlib_dir), \
         patch("bridge.data_sync._csv_staging_dir", return_value=staging_dir), \
         patch("bridge.data_sync._read_ohlcv_from_postgres", return_value={
             "TEST": [{
                 "date": "2024-01-01",
                 "open": 1.0,
                 "high": 1.1,
                 "low": 0.9,
                 "close": 1.0,
                 "volume": 100,
                 "factor": 1.0,
                 "change": 0.0
             }]
         }), \
         patch("bridge.data_sync._run_dump_bin", return_value="ok"):
        
        mock_settings.qlib_provider_uri = str(qlib_dir)
        
        run_sync(SyncRequest())
        
        # The instruments directory should still exist
        assert inst_dir.exists()
        assert (inst_dir / "keep_me.txt").exists()

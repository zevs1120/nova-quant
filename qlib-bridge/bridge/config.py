"""Centralized configuration loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings


_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
_NOVA_QUANT_ROOT = _BRIDGE_ROOT.parent


class Settings(BaseSettings):
    """All tunables live here.  Overridable via env vars prefixed QLIB_BRIDGE_."""

    # ── server ──────────────────────────────────────────────
    host: str = "127.0.0.1"
    port: int = 8788
    debug: bool = False

    # ── qlib ────────────────────────────────────────────────
    qlib_provider_uri: str = str(Path.home() / ".qlib" / "qlib_data" / "us_data")
    qlib_region: str = "us"

    # ── nova quant data source ──────────────────────────────
    nova_quant_database_url: str = ""

    # ── model storage ───────────────────────────────────────
    model_dir: str = str(_BRIDGE_ROOT / "models")

    # ── resource limits (2 GB EC2 friendly) ─────────────────
    max_universe_size: int = 50
    max_lookback_days: int = 750

    model_config = {
        "env_prefix": "QLIB_BRIDGE_",
        "env_file": str(_BRIDGE_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

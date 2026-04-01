"""Entry point: python -m bridge"""

import uvicorn

from bridge.config import settings


def main() -> None:
    uvicorn.run(
        "bridge.server:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    main()

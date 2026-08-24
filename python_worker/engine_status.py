"""Machine-readable readiness status for frontend/control-plane use."""
from __future__ import annotations

import os


def readiness() -> dict[str, object]:
    live = os.getenv("LIVE_ARBITRAGE", "false").lower() == "true"
    signer = bool(os.getenv("DEX_SIGNER_REF"))
    configured = [
        name for name in (
            "MEXC", "GATE", "BINANCE", "KRAKEN", "OKX", "BYBIT",
            "COINBASE", "KUCOIN", "BITFINEX", "LBANK",
        )
        if os.getenv(f"{name}_API_KEY") and os.getenv(f"{name}_API_SECRET")
    ]
    return {
        "scanner": "READY" if configured else "WAITING_FOR_VENUE_CREDENTIALS",
        "live_execution": "ARMABLE" if live else "DISABLED",
        "private_key_signing": "EXTERNAL_SIGNER_READY" if signer else "WAITING_FOR_SIGNER_REF",
        "configured_cex_count": len(configured),
        "live_arbitrage": live,
        "raw_private_key_supported": False,
    }

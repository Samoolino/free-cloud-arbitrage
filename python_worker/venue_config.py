"""Declarative multi-venue configuration for the arbitrage engine.

The engine treats CEXs and DEX wallets as separate liquidity venues. Secrets
remain outside git and are injected through the environment/secret manager.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Venue:
    name: str
    kind: str  # cex | dex
    enabled: bool
    symbols: tuple[str, ...]


VENUES = (
    Venue("binance", "cex", bool(os.getenv("BINANCE_API_KEY")), ("BTC/USDT", "ETH/USDT")),
    Venue("kraken", "cex", bool(os.getenv("KRAKEN_API_KEY")), ("BTC/USDT", "ETH/USDT")),
    Venue("uniswap", "dex", bool(os.getenv("DEX_RPC_URL")), ("BTC/USDT", "ETH/USDT")),
)


def enabled_venues() -> tuple[Venue, ...]:
    return tuple(v for v in VENUES if v.enabled)


def require_supported_symbol(symbol: str) -> None:
    if not any(symbol in v.symbols for v in enabled_venues()):
        raise ValueError(f"No enabled venue supports {symbol}")

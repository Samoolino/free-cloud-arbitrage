"""Venue health checks used before an adapter may be armed."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VenueHealth:
    venue: str
    public_market_data: bool
    authenticated: bool
    balance_checked: bool
    status: str
    reason: str


async def check_venue(venue: str, exchange: Any, symbol: str) -> VenueHealth:
    try:
        await exchange.load_markets()
        if symbol not in exchange.markets:
            return VenueHealth(venue, False, False, False, "DISABLED", f"symbol unavailable: {symbol}")
        await exchange.fetch_order_book(symbol, limit=5)
        auth = bool(getattr(exchange, "apiKey", None) and getattr(exchange, "secret", None))
        balance_ok = False
        if auth and exchange.has.get("fetchBalance"):
            try:
                await exchange.fetch_balance()
                balance_ok = True
            except Exception:
                balance_ok = False
        return VenueHealth(venue, True, auth, balance_ok, "READY" if auth and balance_ok else "DATA_ONLY", "")
    except Exception as exc:
        return VenueHealth(venue, False, False, False, "ERROR", str(exc))

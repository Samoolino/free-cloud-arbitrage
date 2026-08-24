"""Live multi-venue market-data and opportunity engine.

Execution is deliberately separated behind an adapter boundary. This worker
can discover live opportunities across configured CEXs and DEX Gateway, but
will not sign a wallet transaction or submit an order merely because a spread
exists. The risk/execution layer must validate depth, balances, fees, gas,
quote age and capital reservation first.
"""
from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Any

import ccxt.async_support as ccxt
from dotenv import load_dotenv

from opportunity_engine import find_candidate

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(WORKER_ROOT, ".env"))

SYMBOLS = tuple(s.strip() for s in os.getenv("SCANNER_MARKETS", "BTC/USDT,ETH/USDT").split(",") if s.strip())
MIN_NET_PNL = float(os.getenv("SCANNER_MIN_NET_PNL_USD", "1"))
MAX_QUOTE_AGE_MS = int(os.getenv("SCANNER_MAX_QUOTE_AGE_MS", "500"))
MAX_NOTIONAL = float(os.getenv("SCANNER_MAX_NOTIONAL_USD", "1000"))
SCAN_INTERVAL = float(os.getenv("SCANNER_SCAN_INTERVAL_MS", "250")) / 1000
LIVE_ARBITRAGE = os.getenv("LIVE_ARBITRAGE", "false").lower() == "true"

CEXES = {
    "mexc": "MEXC",
    "gate": "GATE",
    "binance": "BINANCE",
    "kraken": "KRAKEN",
    "okx": "OKX",
    "bybit": "BYBIT",
    "coinbase": "COINBASE",
    "kucoin": "KUCOIN",
    "bitfinex": "BITFINEX",
    "lbank": "LBANK",
}


@dataclass
class Ticker:
    venue: str
    symbol: str
    bid: float
    ask: float
    timestamp_ms: int


async def make_exchange(exchange_id: str):
    cls = getattr(ccxt, exchange_id)
    prefix = CEXES[exchange_id]
    key = os.getenv(f"{prefix}_API_KEY")
    secret = os.getenv(f"{prefix}_API_SECRET")
    password = os.getenv(f"{prefix}_PASSWORD")
    config: dict[str, Any] = {"enableRateLimit": True}
    if key and secret:
        config.update({"apiKey": key, "secret": secret})
        if password:
            config["password"] = password
    return cls(config)


async def fetch_tickers(exchanges: dict[str, Any], symbol: str) -> list[Ticker]:
    async def one(venue: str, exchange: Any) -> Ticker | None:
        try:
            ticker = await exchange.fetch_ticker(symbol)
            bid, ask = float(ticker.get("bid") or 0), float(ticker.get("ask") or 0)
            ts = int(ticker.get("timestamp") or time.time() * 1000)
            if bid > 0 and ask > 0:
                return Ticker(venue, symbol, bid, ask, ts)
        except Exception as exc:
            print(f"[QUOTE] {venue} {symbol}: {exc}")
        return None

    results = await asyncio.gather(*(one(v, e) for v, e in exchanges.items()))
    return [r for r in results if r]


def best_candidate(tickers: list[Ticker], symbol: str) -> dict[str, Any] | None:
    now = int(time.time() * 1000)
    fresh = [t for t in tickers if now - t.timestamp_ms <= MAX_QUOTE_AGE_MS]
    if len(fresh) < 2:
        return None
    best: dict[str, Any] | None = None
    for buy in fresh:
        for sell in fresh:
            if buy.venue == sell.venue or sell.bid <= buy.ask:
                continue
            notional = min(MAX_NOTIONAL, max(0.0, MAX_NOTIONAL))
            candidate = find_candidate(
                symbol,
                buy.venue,
                buy.ask,
                sell.venue,
                sell.bid,
                notional,
                float(os.getenv(f"{CEXES.get(buy.venue, buy.venue.upper())}_FEE_BPS", "10")),
                float(os.getenv(f"{CEXES.get(sell.venue, sell.venue.upper())}_FEE_BPS", "10")),
                float(os.getenv("SCANNER_MAX_SLIPPAGE_BPS", "30")) / 2,
                float(os.getenv("SCANNER_MAX_SLIPPAGE_BPS", "30")) / 2,
                float(os.getenv("SCANNER_FIXED_COST_USD", "0")),
                MIN_NET_PNL,
            )
            if candidate.executable and (best is None or candidate.net_pnl > best["net_pnl"]):
                best = {
                    "symbol": symbol,
                    "buy": buy.venue,
                    "sell": sell.venue,
                    "net_pnl": candidate.net_pnl,
                    "gross_edge_pct": candidate.opportunity.gross_edge_pct,
                    "reason": candidate.reason(),
                    "assertion": "EXECUTABLE_NOW",
                    "live_mode": LIVE_ARBITRAGE,
                }
    return best


async def main() -> None:
    exchanges: dict[str, Any] = {}
    for exchange_id in CEXES:
        try:
            exchanges[exchange_id] = await make_exchange(exchange_id)
        except Exception as exc:
            print(f"[INIT] {exchange_id}: disabled: {exc}")

    print(f"[ENGINE] multi-venue scanner active: {', '.join(exchanges) or 'none'}")
    print(f"[ENGINE] LIVE_ARBITRAGE={LIVE_ARBITRAGE} (execution adapter remains separately armed)")

    try:
        while True:
            for symbol in SYMBOLS:
                tickers = await fetch_tickers(exchanges, symbol)
                candidate = best_candidate(tickers, symbol)
                if candidate:
                    print("[OPPORTUNITY]", candidate)
            await asyncio.sleep(SCAN_INTERVAL)
    finally:
        await asyncio.gather(*(e.close() for e in exchanges.values()), return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())

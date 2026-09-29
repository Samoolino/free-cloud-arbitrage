"""Compatibility market-data monitor using open-source CCXT async support.

This worker records indicative spreads only. It never creates orders; the
HMAC-authenticated ``executor.py`` is the sole order-execution worker.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from ccxt_async import exchange_class
from dotenv import load_dotenv
from supabase import create_client

WORKER_ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(WORKER_ROOT, ".env"))
MIN_MARGIN = float(os.getenv("MIN_PROFIT_MARGIN_PERCENT", "0.15")) / 100
SLIPPAGE = float(os.getenv("SLIPPAGE_BUFFER_PERCENT", "0.05")) / 100


def supabase_client() -> Any:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
    return create_client(url, key)


async def monitor_orderbook(exchange_id: str, symbol: str, data_store: dict[str, dict[str, float]]) -> None:
    exchange = exchange_class(exchange_id)({"enableRateLimit": True})
    try:
        await exchange.load_markets()
        while True:
            try:
                book = await exchange.fetch_order_book(symbol, 5)
                if book.get("asks") and book.get("bids"):
                    data_store[exchange_id] = {
                        "ask": float(book["asks"][0][0]),
                        "bid": float(book["bids"][0][0]),
                        "fee_rate": 0.001,
                    }
                    await record_spread(symbol, data_store)
                await asyncio.sleep(1)
            except Exception as exc:
                print(f"Order-book error on {exchange_id}: {exc}")
                await asyncio.sleep(5)
    finally:
        await exchange.close()


async def record_spread(symbol: str, data: dict[str, dict[str, float]]) -> None:
    if not {"binance", "kraken"}.issubset(data):
        return
    b, k = data["binance"], data["kraken"]
    net_a = (k["bid"] - b["ask"]) - ((b["ask"] + k["bid"]) * (b["fee_rate"] + SLIPPAGE))
    net_b = (b["bid"] - k["ask"]) - ((k["ask"] + b["bid"]) * (k["fee_rate"] + SLIPPAGE))
    # The legacy table has no uniqueness constraint, therefore insert a
    # timestamped observation instead of a silently non-functional upsert.
    supabase_client().table("live_spreads").insert({
        "symbol": symbol,
        "exchange_a": "binance",
        "exchange_b": "kraken",
        "binance_price": (b["ask"] + b["bid"]) / 2,
        "kraken_price": (k["ask"] + k["bid"]) / 2,
        "potential_profit": max(net_a, net_b),
        "tradeable": max(net_a, net_b) > min(b["ask"], k["ask"]) * MIN_MARGIN,
    }).execute()


async def main() -> None:
    symbol = os.getenv("ARBITRAGE_SYMBOL", "BTC/USDT")
    data: dict[str, dict[str, float]] = {}
    await asyncio.gather(*(monitor_orderbook(exchange, symbol, data) for exchange in ("binance", "kraken")))


if __name__ == "__main__":
    asyncio.run(main())

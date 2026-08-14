"""Real-time multi-exchange arbitrage opportunity worker.

Exchange enablement is sourced from the authenticated bot configuration so the
frontend exchange registry remains the control plane. Private API credentials
are never returned to this market-data worker; they belong to the execution
runtime only. Public WebSocket order books are normalized and passed through a
conservative profitability gate before a signal can be marked eligible.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import create_client

try:
    import ccxt.pro as ccxtpro
except ImportError:
    import ccxt.async_support as ccxtpro

from arbitrage_engine import ArbitrageEngine, Quote

ROOT = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(ROOT, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BASE = os.getenv("LOVABLE_BASE_URL", "").rstrip("/")
BOT_SECRET = os.getenv("BOT_SHARED_SECRET", "").encode()
BOT_USER = os.getenv("BOT_USER_ID", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
log = logging.getLogger("arbitrage_worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SYMBOLS = [s.strip().upper() for s in os.getenv(
    "ARBITRAGE_SYMBOLS", "BTC/USDT,ETH/USDT,BNB/USDT"
).split(",") if s.strip()]
INPUT_USDT = float(os.getenv("ARBITRAGE_INPUT_USDT", "100"))
MAX_QUOTE_AGE_MS = int(os.getenv("ARBITRAGE_MAX_QUOTE_AGE_MS", "1000"))
MIN_PROFIT_USD = float(os.getenv("ARBITRAGE_MIN_PROFIT_USD", "0.05"))
MIN_PROFIT_PCT = float(os.getenv("ARBITRAGE_MIN_PROFIT_PCT", "0.10"))
SLIPPAGE_BPS = float(os.getenv("ARBITRAGE_SLIPPAGE_BPS", "5"))
SAFETY_BPS = float(os.getenv("ARBITRAGE_SAFETY_BPS", "5"))

order_books: dict[str, dict[str, Quote]] = {}


def signed_get(path: str) -> dict[str, Any]:
    if not (BASE and BOT_SECRET and BOT_USER):
        raise RuntimeError("LOVABLE_BASE_URL, BOT_SHARED_SECRET and BOT_USER_ID are required")
    ts = str(int(time.time() * 1000))
    raw = ""
    signature = hmac.new(BOT_SECRET, f"{ts}.GET.{path}.{raw}".encode(), hashlib.sha256).hexdigest()
    response = requests.get(
        BASE + path,
        timeout=15,
        headers={"x-bot-timestamp": ts, "x-bot-user-id": BOT_USER, "x-bot-signature": signature},
    )
    response.raise_for_status()
    return response.json()


def enabled_exchange_ids() -> list[str]:
    """Read enabled exchanges from the same frontend-controlled bot config."""
    try:
        cfg = signed_get("/api/public/bot/config")
        ids = [str(x.get("exchange_id", "")).lower() for x in cfg.get("exchanges", []) if x.get("enabled", True)]
        ids = [x for x in ids if x]
        if ids:
            return ids
    except Exception as exc:
        log.warning("bot config unavailable; using ARBITRAGE_EXCHANGES fallback: %s", exc)
    return [x.strip().lower() for x in os.getenv(
        "ARBITRAGE_EXCHANGES", "binance,kraken,mexc,lbank,gate,bitfinex,fameex"
    ).split(",") if x.strip()]


async def create_public_clients(exchange_ids: list[str]) -> dict[str, Any]:
    clients: dict[str, Any] = {}
    for exchange_id in exchange_ids:
        klass = getattr(ccxtpro, exchange_id, None)
        if klass is None:
            log.warning("CCXT Pro has no adapter for %s; skipping", exchange_id)
            continue
        try:
            client = klass({"enableRateLimit": True, "options": {"defaultType": "spot", "adjustForTimeDifference": True}})
            await client.load_markets()
            clients[exchange_id] = client
            log.info("market adapter ready: %s", exchange_id)
        except Exception as exc:
            log.warning("market adapter failed: %s: %s", exchange_id, exc)
            try:
                await client.close()
            except Exception:
                pass
    return clients


async def watch_exchange(exchange_id: str, client: Any) -> None:
    supported = set(client.symbols or [])
    symbols = [s for s in SYMBOLS if s in supported]
    if not symbols:
        log.warning("%s supports none of configured symbols", exchange_id)
        return
    while True:
        try:
            for symbol in symbols:
                book = await client.watch_order_book(symbol, 10)
                bids = book.get("bids") or []
                asks = book.get("asks") or []
                if not bids or not asks:
                    continue
                bid, bid_size = float(bids[0][0]), float(bids[0][1])
                ask, ask_size = float(asks[0][0]), float(asks[0][1])
                fee_bps = float(os.getenv(f"{exchange_id.upper()}_TAKER_FEE_BPS", "10"))
                quote = Quote(exchange_id, symbol, bid, bid_size, ask, ask_size, fee_bps / 10000, int(time.time() * 1000))
                order_books.setdefault(symbol, {})[exchange_id] = quote
        except Exception as exc:
            log.warning("%s websocket error: %s; reconnecting", exchange_id, exc)
            await asyncio.sleep(2)


def write_opportunity(opportunity: Any) -> None:
    supabase.table("arbitrage_signals").upsert({
        "symbol": opportunity.symbol,
        "buy_exchange": opportunity.buy_exchange,
        "sell_exchange": opportunity.sell_exchange,
        "expected_pnl": opportunity.expected_profit_usd,
        "status": "profitable_pending_execution",
        "buy_tradeable": True,
        "buy_deposit_enabled": True,
        "buy_withdraw_enabled": True,
        "buy_suspended": False,
        "sell_tradeable": True,
        "sell_deposit_enabled": True,
        "sell_withdraw_enabled": True,
        "sell_suspended": False,
        "updated_at": time.time(),
    }, on_conflict="symbol,buy_exchange,sell_exchange").execute()


async def opportunity_loop() -> None:
    engine = ArbitrageEngine(
        min_profit_usd=MIN_PROFIT_USD,
        min_profit_pct=MIN_PROFIT_PCT,
        slippage_bps=SLIPPAGE_BPS,
        safety_buffer_bps=SAFETY_BPS,
        max_quote_age_ms=MAX_QUOTE_AGE_MS,
    )
    while True:
        try:
            for symbol, books in list(order_books.items()):
                opportunities = engine.scan(list(books.values()), INPUT_USDT)
                for opportunity in opportunities[:5]:
                    log.info(
                        "PROFITABLE %s %s -> %s amount=%.8f net=$%.6f (%.4f%%)",
                        opportunity.symbol, opportunity.buy_exchange, opportunity.sell_exchange,
                        opportunity.amount, opportunity.expected_profit_usd, opportunity.expected_profit_pct,
                    )
                    write_opportunity(opportunity)
            await asyncio.sleep(0.01)
        except Exception as exc:
            log.exception("opportunity loop error: %s", exc)
            await asyncio.sleep(0.5)


async def main() -> None:
    exchange_ids = enabled_exchange_ids()
    clients = await create_public_clients(exchange_ids)
    if not clients:
        raise RuntimeError("No supported exchange market adapters are available")
    tasks = [asyncio.create_task(watch_exchange(xid, client)) for xid, client in clients.items()]
    tasks.append(asyncio.create_task(opportunity_loop()))
    try:
        await asyncio.gather(*tasks)
    finally:
        for client in clients.values():
            try:
                await client.close()
            except Exception:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.parse_args()
    asyncio.run(main())

import asyncio
import os
import time
from typing import Any

import ccxt.pro as ccxtpro
from dotenv import load_dotenv

from arbitrage_engine import ArbitrageEngine, Quote

load_dotenv()

TARGET_SYMBOLS = [s.strip().upper() for s in os.getenv("ARBITRAGE_SYMBOLS", "BTC/USDT,ETH/USDT,BNB/USDT").split(",") if s.strip()]
EXCHANGES = [s.strip().lower() for s in os.getenv("ARBITRAGE_EXCHANGES", "binance,okx,kraken,coinbase,bybit,kucoin,gateio,mexc,bitget,htx,bitfinex,cryptocom,lbank").split(",") if s.strip()]
INPUT_USDT = float(os.getenv("ARBITRAGE_INPUT_USDT", "100"))
MIN_PROFIT_USD = float(os.getenv("MIN_PROFIT_USD", "0.05"))
MIN_PROFIT_PCT = float(os.getenv("MIN_PROFIT_PCT", "0.10"))
SLIPPAGE_BPS = float(os.getenv("SLIPPAGE_BPS", "5"))
SAFETY_BUFFER_BPS = float(os.getenv("SAFETY_BUFFER_BPS", "5"))
MAX_QUOTE_AGE_MS = int(os.getenv("MAX_QUOTE_AGE_MS", "1000"))


def enabled_exchange_credentials() -> dict[str, dict[str, str]]:
    """Load only worker-side secrets. Never log values."""
    result: dict[str, dict[str, str]] = {}
    for exchange_id in EXCHANGES:
        prefix = exchange_id.upper()
        api_key = os.getenv(f"{prefix}_API_KEY")
        api_secret = os.getenv(f"{prefix}_SECRET") or os.getenv(f"{prefix}_API_SECRET")
        passphrase = os.getenv(f"{prefix}_PASSPHRASE")
        if api_key and api_secret:
            result[exchange_id] = {"api_key": api_key, "api_secret": api_secret, "passphrase": passphrase or ""}
    return result


async def build_clients() -> dict[str, Any]:
    clients: dict[str, Any] = {}
    creds = enabled_exchange_credentials()
    for exchange_id, item in creds.items():
        klass = getattr(ccxtpro, exchange_id, None)
        if klass is None:
            continue
        config: dict[str, Any] = {
            "apiKey": item["api_key"],
            "secret": item["api_secret"],
            "enableRateLimit": True,
            "options": {"defaultType": "spot", "adjustForTimeDifference": True},
        }
        if item["passphrase"]:
            config["password"] = item["passphrase"]
        client = klass(config)
        try:
            await client.load_markets()
            clients[exchange_id] = client
            print(f"[GREEN] exchange={exchange_id} authenticated markets={len(client.markets)}")
        except Exception as exc:
            print(f"[RED] exchange={exchange_id} health/auth failed: {exc}")
            try:
                await client.close()
            except Exception:
                pass
    return clients


async def watch_exchange(exchange_id: str, client: Any, symbols: list[str], quotes: dict[tuple[str, str], Quote], lock: asyncio.Lock) -> None:
    supported = set(client.symbols or [])
    active = [s for s in symbols if s in supported]
    if not active:
        print(f"[YELLOW] {exchange_id}: none of target symbols available")
        return
    while True:
        for symbol in active:
            try:
                book = await client.watch_order_book(symbol, 10)
                bids = book.get("bids") or []
                asks = book.get("asks") or []
                if not bids or not asks:
                    continue
                bid_px, bid_sz = float(bids[0][0]), float(bids[0][1])
                ask_px, ask_sz = float(asks[0][0]), float(asks[0][1])
                fee_rate = 0.001
                try:
                    fee = await client.fetch_trading_fee(symbol)
                    fee_rate = float(fee.get("taker", fee_rate))
                except Exception:
                    pass
                quote = Quote(exchange_id, symbol, bid_px, bid_sz, ask_px, ask_sz, fee_rate, int(time.time() * 1000))
                async with lock:
                    quotes[(exchange_id, symbol)] = quote
            except Exception as exc:
                print(f"[YELLOW] {exchange_id} {symbol} websocket error: {exc}")
                await asyncio.sleep(1)


async def scanner(quotes: dict[tuple[str, str], Quote], lock: asyncio.Lock, clients: dict[str, Any]) -> None:
    engine = ArbitrageEngine(MIN_PROFIT_USD, MIN_PROFIT_PCT, SLIPPAGE_BPS, SAFETY_BUFFER_BPS, MAX_QUOTE_AGE_MS)
    last_emit: set[tuple[str, str, str, float]] = set()
    while True:
        async with lock:
            snapshot = list(quotes.values())
        opportunities = engine.scan_two_leg(snapshot, INPUT_USDT)
        for opportunity in opportunities[:10]:
            key = (opportunity.legs[0].exchange, opportunity.legs[1].exchange, opportunity.legs[0].symbol, round(opportunity.expected_profit_usd, 6))
            if key not in last_emit:
                print(
                    f"[GREEN OPPORTUNITY] {opportunity.legs[0].exchange} -> {opportunity.legs[1].exchange} "
                    f"{opportunity.legs[0].symbol} net=${opportunity.expected_profit_usd:.6f} "
                    f"({opportunity.expected_profit_pct:.4f}%) age={opportunity.max_quote_age_ms}ms"
                )
                last_emit.add(key)
        if len(last_emit) > 500:
            last_emit.clear()
        await asyncio.sleep(0.05)


async def main() -> None:
    clients = await build_clients()
    if len(clients) < 2:
        raise RuntimeError("At least two authenticated exchanges are required for arbitrage")
    quotes: dict[tuple[str, str], Quote] = {}
    lock = asyncio.Lock()
    feed_tasks = [watch_exchange(xid, client, TARGET_SYMBOLS, quotes, lock) for xid, client in clients.items()]
    try:
        await asyncio.gather(scanner(quotes, lock, clients), *feed_tasks)
    finally:
        await asyncio.gather(*(client.close() for client in clients.values()), return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())

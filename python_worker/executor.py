"""Authenticated live arbitrage executor using CCXT Pro.

Live mode is explicit and guarded. Exchange credentials are obtained from the
server-side authenticated credential broker; they are never read from the
browser and are never written to logs. Every leg revalidates its live order
book immediately before execution. Legs execute sequentially so a failed leg
can be detected and the route marked for recovery rather than silently
assuming atomicity across exchanges.
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

try:
    import ccxt.pro as ccxtpro
except ImportError:
    try:
        import ccxt.async_support as ccxtpro
    except ImportError as exc:
        raise ImportError("Install ccxtpro or a ccxt package with async_support") from exc

log = logging.getLogger("executor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
BASE = os.environ["LOVABLE_BASE_URL"].rstrip("/")
SECRET = os.environ["BOT_SHARED_SECRET"].encode()
USER = os.environ["BOT_USER_ID"]
MAX_SLIPPAGE_BPS = float(os.getenv("EXECUTION_MAX_SLIPPAGE_BPS", "20"))


def signed(method: str, path: str, body: Any = None) -> dict[str, Any]:
    raw = "" if body is None else json.dumps(body, separators=(",", ":"))
    ts = str(int(time.time() * 1000))
    sig = hmac.new(SECRET, f"{ts}.{method}.{path}.{raw}".encode(), hashlib.sha256).hexdigest()
    response = requests.request(method, BASE + path, data=raw, timeout=15, headers={
        "Content-Type": "application/json", "x-bot-timestamp": ts,
        "x-bot-user-id": USER, "x-bot-signature": sig,
    })
    response.raise_for_status()
    return response.json() if response.text else {}


def post_event(level: str, source: str, message: str, context: dict[str, Any] | None = None) -> None:
    try:
        signed("POST", "/api/public/bot/events", {"events": [{
            "level": level, "source": source, "message": message, "context": context or {},
        }]})
    except Exception:
        log.exception("event post failed")


def build_clients(credentials: list[dict[str, Any]]) -> dict[str, Any]:
    clients: dict[str, Any] = {}
    for item in credentials:
        if not item.get("enabled", True):
            continue
        xid = str(item["exchange_id"]).lower()
        klass = getattr(ccxtpro, xid, None)
        if klass is None:
            log.warning("CCXT has no adapter for %s", xid)
            continue
        api_key = item.get("api_key") or os.getenv(f"{xid.upper()}_API_KEY")
        secret = item.get("secret") or os.getenv(f"{xid.upper()}_SECRET")
        if not api_key or not secret:
            log.warning("skipping %s: credential unavailable", xid)
            continue
        config: dict[str, Any] = {
            "apiKey": api_key,
            "secret": secret,
            "enableRateLimit": True,
            "options": {"defaultType": "spot", "adjustForTimeDifference": True},
        }
        if item.get("passphrase"):
            config["password"] = item["passphrase"]
        clients[xid] = klass(config)
    return clients


async def validate_leg(client: Any, leg: dict[str, Any], notional: float) -> dict[str, Any]:
    symbol = f"{leg['base']}/{leg['quote']}"
    side = leg["side"]
    book = await client.fetch_order_book(symbol, 10)
    bids, asks = book.get("bids") or [], book.get("asks") or []
    if not bids or not asks:
        raise RuntimeError(f"empty order book: {symbol}")
    px = float(asks[0][0] if side == "buy" else bids[0][0])
    if px <= 0:
        raise RuntimeError(f"invalid executable price: {symbol}")
    expected = float(leg.get("expected_price") or px)
    deviation_bps = abs(px - expected) / expected * 10000 if expected else 0
    if expected and deviation_bps > MAX_SLIPPAGE_BPS:
        raise RuntimeError(f"price moved {deviation_bps:.2f} bps beyond execution guard")
    if side == "buy":
        amount = notional / px
        available = sum(float(level[1]) for level in asks[:10] if len(level) >= 2)
    else:
        amount = notional
        available = sum(float(level[1]) for level in bids[:10] if len(level) >= 2)
    if amount <= 0 or available < amount:
        raise RuntimeError(f"insufficient visible depth for {symbol}: required={amount} available={available}")
    return {"symbol": symbol, "side": side, "price": px, "amount": amount, "deviation_bps": deviation_bps}


async def execute_leg(client: Any, leg: dict[str, Any], notional: float, dry_run: bool) -> dict[str, Any]:
    check = await validate_leg(client, leg, notional)
    if dry_run:
        return {"dry_run": True, **check, "cost": check["amount"] * check["price"]}
    return await client.create_order(check["symbol"], "market", check["side"], check["amount"])


async def run_intent(clients: dict[str, Any], intent: dict[str, Any], *, dry_run: bool) -> None:
    legs = intent.get("legs") or []
    notional = float(intent.get("allocated_usd") or 0)
    if not legs or notional <= 0:
        raise ValueError("intent has no executable legs or allocated capital")
    mode = "DRY-RUN" if dry_run else "LIVE"
    results: list[dict[str, Any]] = []
    try:
        for index, leg in enumerate(legs, start=1):
            xid = str(leg["exchange"]).lower()
            client = clients.get(xid)
            if client is None:
                raise RuntimeError(f"exchange client unavailable: {xid}")
            log.info("[%s] intent=%s leg=%d/%d exchange=%s", mode, intent["id"], index, len(legs), xid)
            result = await execute_leg(client, leg, notional, dry_run)
            results.append(result)
        realized = 0.0
        if not dry_run:
            # Final realized P&L is reconciled by fills/settlement data. Do not
            # infer profit from order cost alone.
            realized = 0.0
        signed("POST", "/api/public/bot/fills", {
            "intent_id": intent["id"], "status": "filled" if not dry_run else "aborted_stale",
            "realized_pnl_usd": realized, "notional_usd": notional,
            "strategy": intent.get("strategy", "arbitrage"), "legs": results,
            "error": None if not dry_run else "dry-run: no orders placed",
        })
        post_event("info", "executor", f"{mode} intent {intent['id']} completed", {"legs": len(results)})
    except Exception as exc:
        log.exception("intent failed")
        try:
            signed("POST", "/api/public/bot/fills", {
                "intent_id": intent["id"], "status": "failed", "realized_pnl_usd": 0,
                "notional_usd": notional, "strategy": intent.get("strategy", "arbitrage"),
                "legs": results, "error": str(exc),
            })
        finally:
            post_event("error", "executor", f"intent {intent['id']} failed", {
                "completed_legs": len(results), "error": str(exc),
            })


async def main_async(args: argparse.Namespace) -> None:
    cfg = signed("GET", "/api/public/bot/config")
    remote_dry = bool(cfg.get("config", {}).get("dry_run", True))
    dry_run = args.dry_run or remote_dry
    if remote_dry and not args.dry_run:
        log.warning("bot_config.dry_run=true -> forcing dry-run")
    if not dry_run and not args.live:
        raise SystemExit("Refusing live mode without --live")

    credential_response = signed("GET", "/api/public/bot/credentials")
    clients = build_clients(credential_response.get("credentials", []))
    if not clients:
        raise RuntimeError("No enabled exchange credentials could initialize")
    log.info("CCXT clients ready: %s (dry_run=%s)", list(clients), dry_run)
    post_event("info", "executor", f"executor online (dry_run={dry_run})", {"clients": list(clients)})

    while True:
        intents = signed("GET", "/api/public/bot/intents?limit=5").get("intents", [])
        for intent in intents:
            await run_intent(clients, intent, dry_run=dry_run)
        if args.once:
            return
        await asyncio.sleep(1.0 if intents else 2.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--once", action="store_true")
    asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    main()

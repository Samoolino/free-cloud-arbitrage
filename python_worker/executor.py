"""Lovable arbitrage executor (HMAC + open-source CCXT).

Polls /api/public/bot/intents, executes each leg concurrently with
asyncio.gather, posts fills back to /api/public/bot/fills, and streams
system events to /api/public/bot/events.

Run modes:
  --dry-run            never call create_order; print the simulated leg
  --live               place real orders (refuses unless explicit)
  --once               execute one polling cycle and exit (for tests)

The remote bot_config.dry_run flag also forces dry-run regardless of CLI.
Use this for a safety lockout from the dashboard.
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

from ccxt_async import exchange_class

log = logging.getLogger("executor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


BASE = required_env("LOVABLE_BASE_URL").rstrip("/")
SECRET = required_env("BOT_SHARED_SECRET").encode()
USER = required_env("BOT_USER_ID")


def signed(method: str, path: str, body: Any = None) -> dict[str, Any]:
    raw = "" if body is None else json.dumps(body, separators=(",", ":"))
    ts = str(int(time.time() * 1000))
    sig = hmac.new(SECRET, f"{ts}.{method}.{path}.{raw}".encode(), hashlib.sha256).hexdigest()
    r = requests.request(method, BASE + path, data=raw, timeout=15, headers={
        "Content-Type": "application/json",
        "x-bot-timestamp": ts, "x-bot-user-id": USER, "x-bot-signature": sig,
    })
    r.raise_for_status()
    return r.json() if r.text else {}


def post_event(level: str, source: str, message: str, context: dict[str, Any] | None = None) -> None:
    try:
        signed("POST", "/api/public/bot/events", {"events": [{
            "level": level, "source": source, "message": message, "context": context or {},
        }]})
    except Exception:
        log.exception("event post failed")


def build_clients(exchanges: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for ex in exchanges:
        xid = ex["exchange_id"]
        api_key = os.environ.get(f"{xid.upper()}_API_KEY")
        secret = os.environ.get(f"{xid.upper()}_SECRET")
        if not (api_key and secret):
            log.warning("skipping %s — missing API key envs", xid)
            continue
        try:
            klass = exchange_class(xid)
        except ValueError:
            log.warning("ccxt has no exchange '%s'", xid)
            continue
        cfg = {"apiKey": api_key, "secret": secret, "enableRateLimit": True,
               "options": {"defaultType": "spot", "adjustForTimeDifference": True}}
        pp = os.environ.get(f"{xid.upper()}_PASSPHRASE")
        if pp: cfg["password"] = pp
        out[xid] = klass(cfg)
    return out


def order_amount(client: Any, symbol: str, amount: float) -> float:
    amount = float(client.amount_to_precision(symbol, amount))
    if amount <= 0:
        raise ValueError(f"order amount rounds to zero for {symbol}")
    return amount


async def simulate_leg(client: Any, leg: dict[str, Any], notional: float) -> dict[str, Any]:
    """Dry-run: fetch a current quote and validate the order size."""
    symbol = f"{leg['base']}/{leg['quote']}"
    side = leg["side"]
    ob = await client.fetch_order_book(symbol, 5)
    book_side = "asks" if side == "buy" else "bids"
    if not ob.get(book_side):
        raise ValueError(f"empty {book_side} for {symbol}")
    px = float(ob[book_side][0][0])
    amount = order_amount(client, symbol, notional / px if side == "buy" else notional)
    return {"dry_run": True, "symbol": symbol, "side": side, "price": px, "amount": amount, "cost": amount * px}


async def live_leg(client: Any, leg: dict[str, Any], notional: float) -> dict[str, Any]:
    symbol = f"{leg['base']}/{leg['quote']}"
    if leg["side"] == "buy":
        ob = await client.fetch_order_book(symbol, 5)
        if not ob.get("asks"):
            raise ValueError(f"empty asks for {symbol}")
        px = float(ob["asks"][0][0])
        return await client.create_order(symbol, "market", "buy", order_amount(client, symbol, notional / px))
    return await client.create_order(symbol, "market", "sell", order_amount(client, symbol, notional))


async def run_intent(clients: dict[str, Any], intent: dict[str, Any], *, dry_run: bool) -> None:
    legs = intent["legs"]
    notional = float(intent["allocated_usd"])
    mode = "DRY-RUN" if dry_run else "LIVE"
    log.info("[%s] intent=%s legs=%d notional=%.2f", mode, intent["id"], len(legs), notional)
    exec_fn = simulate_leg if dry_run else live_leg
    try:
        results = await asyncio.gather(*[exec_fn(clients[l["exchange"]], l, notional) for l in legs])
        realized = sum(float(r.get("cost", 0)) for r in results) - notional
        signed("POST", "/api/public/bot/fills", {
            "intent_id": intent["id"],
            "status": "filled" if not dry_run else "aborted_stale",
            "realized_pnl_usd": realized if not dry_run else 0,
            "notional_usd": notional, "strategy": intent["strategy"], "legs": results,
            "error": None if not dry_run else "dry-run: no orders placed",
        })
        post_event("info", "executor", f"{mode} intent {intent['id']} ok", {"realized_pnl_usd": realized})
    except Exception as exc:
        log.exception("intent failed")
        signed("POST", "/api/public/bot/fills", {
            "intent_id": intent["id"], "status": "failed", "realized_pnl_usd": 0,
            "notional_usd": notional, "strategy": intent["strategy"], "legs": [], "error": str(exc),
        })
        post_event("error", "executor", f"intent {intent['id']} failed", {"error": str(exc)})


async def main_async(args: argparse.Namespace) -> None:
    cfg = signed("GET", "/api/public/bot/config")
    remote_dry = bool(cfg.get("config", {}).get("dry_run", True))
    dry_run = args.dry_run or remote_dry
    if remote_dry and not args.dry_run:
        log.warning("bot_config.dry_run=true → forcing dry-run. Toggle in dashboard to go live.")
    if not dry_run and not args.live:
        raise SystemExit("Refusing to run live without --live flag. Use --dry-run for safe simulation.")

    clients = build_clients(cfg.get("exchanges", []))
    if not clients:
        raise RuntimeError("No CCXT clients configured. Set EXCHANGE_API_KEY/SECRET for an enabled exchange.")
    for exchange_id, client in clients.items():
        await client.load_markets()
        log.info("Loaded %d markets from %s", len(client.markets), exchange_id)
    log.info("CCXT clients ready: %s (dry_run=%s)", list(clients), dry_run)
    post_event("info", "executor", f"executor online (dry_run={dry_run})", {"clients": list(clients)})

    last_heartbeat = 0.0
    last_balances = 0.0
    try:
        while True:
            now = time.time()
            if now - last_heartbeat > 20:
                last_heartbeat = now
                events = [
                    {"level": "info", "source": f"heartbeat:{exchange_id}", "message": "client alive",
                     "context": {"markets": len(getattr(client, "markets", {}) or {})}}
                    for exchange_id, client in clients.items()
                ]
                if events:
                    try:
                        signed("POST", "/api/public/bot/events", {"events": events})
                    except Exception:
                        log.exception("heartbeat post failed")
            if now - last_balances > 30:
                last_balances = now
                snapshots = []
                for exchange_id, client in clients.items():
                    try:
                        balances = await client.fetch_balance()
                        totals = balances.get("total", {}) if isinstance(balances, dict) else {}
                        snapshots.append({
                            "exchange_id": exchange_id,
                            "balances": {asset: float(value) for asset, value in totals.items() if value and float(value) > 0},
                            "total_usd": 0.0,
                        })
                    except Exception as exc:
                        log.warning("balance fetch failed %s: %s", exchange_id, exc)
                        post_event("warn", f"heartbeat:{exchange_id}", f"balance fetch failed: {exc}")
                if snapshots:
                    try:
                        signed("POST", "/api/public/bot/balances", {"snapshots": snapshots})
                    except Exception:
                        log.exception("balances post failed")

            intents = signed("GET", "/api/public/bot/intents?limit=5").get("intents", [])
            if intents:
                await asyncio.gather(*(run_intent(clients, intent, dry_run=dry_run) for intent in intents))
            if args.once:
                return
            await asyncio.sleep(1.0 if intents else 2.0)
    finally:
        await asyncio.gather(*(client.close() for client in clients.values()), return_exceptions=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="simulate orders, never call create_order")
    p.add_argument("--live", action="store_true", help="explicit opt-in for live trading")
    p.add_argument("--once", action="store_true", help="exit after one polling cycle")
    args = p.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
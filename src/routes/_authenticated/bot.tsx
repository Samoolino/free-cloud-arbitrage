import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/bot")({ component: BotPage });

function BotPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">External executor</h1>
        <p className="text-sm text-muted-foreground">
          This Lovable app is a <strong>scanner and intent queue only</strong>. It
          never holds your CCXT API keys, never calls <code>create_order</code>, and
          never calls <code>withdraw</code>. No funds move and no real trades fire
          until you run the Python worker below on Render, Railway, Fly, or a VPS —
          that process owns your exchange keys and is the only thing that touches
          live balances via <a className="underline" href="https://github.com/ccxt/ccxt" target="_blank" rel="noreferrer">ccxt / ccxt.pro</a>.
        </p>
      </header>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader><CardTitle className="text-base">Why the dashboard shows no real trades yet</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>The scanner is producing <code>trade_intents</code> rows with <code>status=queued</code>. Until a worker is running and authenticated, those intents sit in the queue and the <code>trades</code> table stays empty. The full live loop is:</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Browser scanner detects an opportunity passing the no-loss gate.</li>
            <li>It inserts a <code>trade_intent</code> (status <code>queued</code>).</li>
            <li>Python worker <code>GET /api/public/bot/intents</code> → row flips to <code>acked</code>.</li>
            <li>Worker loads CCXT clients from <em>its own</em> env vars and calls <code>exchange.create_order(...)</code> per leg with <code>asyncio.gather</code>.</li>
            <li>Worker <code>POST /api/public/bot/fills</code> with realized PnL → <code>trades</code> row appears here.</li>
            <li>If the route needs cross-exchange transfer, worker calls <code>exchange.withdraw(...)</code>, polls <code>fetch_deposits</code>, posts each stage to <code>/api/public/bot/transfers</code>.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Endpoints (live)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm font-mono">
          <div><Badge variant="outline">GET</Badge> /api/public/bot/config — config + active session + enabled exchanges</div>
          <div><Badge variant="outline">GET</Badge> /api/public/bot/intents?limit=10 — FIFO queued intents (auto-marks <code>acked</code>)</div>
          <div><Badge variant="outline">POST</Badge> /api/public/bot/intents — explicit ack <code>{`{ id, status }`}</code></div>
          <div><Badge variant="outline">POST</Badge> /api/public/bot/fills — report fill + realized PnL, writes <code>trades</code></div>
          <div><Badge variant="outline">POST</Badge> /api/public/bot/transfers — upsert withdrawal lifecycle</div>
          <div><Badge variant="outline">POST</Badge> /api/public/bot/events — batch <code>system_events</code></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Auth (HMAC-SHA256 with BOT_SHARED_SECRET)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Every request must include three headers:</p>
          <ul className="list-disc ml-5 font-mono text-xs">
            <li>x-bot-timestamp: unix ms (rejected if &gt; 5 min skew)</li>
            <li>x-bot-user-id: your account uuid</li>
            <li>x-bot-signature: hex HMAC-SHA256 of <code>{`${"`"}${"$"}{ts}.${"$"}{METHOD}.${"$"}{pathname}.${"$"}{rawBody}${"`"}`}</code></li>
          </ul>
          <pre className="text-xs bg-muted/40 p-3 rounded overflow-x-auto">{`import hmac, hashlib, time, json, requests

SECRET = os.environ["BOT_SHARED_SECRET"].encode()
USER   = os.environ["BOT_USER_ID"]
BASE   = "https://<your-app>.lovable.app"

def call(method, path, body=None):
    raw = "" if body is None else json.dumps(body, separators=(",",":"))
    ts  = str(int(time.time()*1000))
    sig = hmac.new(SECRET, f"{ts}.{method}.{path}.{raw}".encode(),
                   hashlib.sha256).hexdigest()
    return requests.request(method, BASE+path, data=raw, headers={
      "Content-Type": "application/json",
      "x-bot-timestamp": ts, "x-bot-user-id": USER, "x-bot-signature": sig,
    }).json()`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reference executor (ccxt.pro, asyncio)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Drop this into a Render/Railway worker service. It owns your CCXT keys,
            executes legs concurrently with <code>asyncio.gather</code>, and reports
            fills + transfers back. Install: <code>pip install ccxt requests</code>.
          </p>
          <pre className="text-xs bg-muted/40 p-3 rounded overflow-x-auto">{`# worker.py — minimal CCXT executor for Lovable arbitrage intents
import os, time, json, hmac, hashlib, asyncio, requests
import ccxt.pro as ccxtpro   # https://github.com/ccxt/ccxt

SECRET = os.environ["BOT_SHARED_SECRET"].encode()
USER   = os.environ["BOT_USER_ID"]
BASE   = os.environ["LOVABLE_BASE_URL"]   # e.g. https://yourapp.lovable.app

def signed(method, path, body=None):
    raw = "" if body is None else json.dumps(body, separators=(",",":"))
    ts  = str(int(time.time()*1000))
    sig = hmac.new(SECRET, f"{ts}.{method}.{path}.{raw}".encode(),
                   hashlib.sha256).hexdigest()
    r = requests.request(method, BASE+path, data=raw, headers={
        "Content-Type": "application/json",
        "x-bot-timestamp": ts, "x-bot-user-id": USER, "x-bot-signature": sig,
    }, timeout=15)
    r.raise_for_status()
    return r.json()

def build_clients(exchanges):
    clients = {}
    for ex in exchanges:
        xid = ex["exchange_id"]
        api_key = os.environ.get(f"{xid.upper()}_API_KEY")
        secret  = os.environ.get(f"{xid.upper()}_SECRET")
        if not (api_key and secret): continue
        klass = getattr(ccxtpro, xid, None)
        if klass is None: continue
        opts = {"apiKey": api_key, "secret": secret, "enableRateLimit": True,
                "options": {"defaultType": "spot", "adjustForTimeDifference": True}}
        pp = os.environ.get(f"{xid.upper()}_PASSPHRASE")
        if pp: opts["password"] = pp
        clients[xid] = klass(opts)
    return clients

async def execute_leg(client, leg, amount_quote):
    # leg = {exchange, base, quote, side, ...}
    symbol = f"{leg['base']}/{leg['quote']}"
    if leg["side"] == "buy":
        ob = await client.fetch_order_book(symbol, 5)
        px = ob["asks"][0][0]
        order = await client.create_order(symbol, "market", "buy", amount_quote/px)
    else:
        order = await client.create_order(symbol, "market", "sell", amount_quote)
    return order

async def run_intent(clients, intent):
    legs = intent["legs"]
    notional = float(intent["allocated_usd"])
    try:
        results = await asyncio.gather(*[
            execute_leg(clients[l["exchange"]], l, notional) for l in legs
        ])
        realized = sum(float(o.get("cost", 0)) for o in results) - notional
        signed("POST", "/api/public/bot/fills", {
            "intent_id": intent["id"], "status": "filled",
            "realized_pnl_usd": realized, "notional_usd": notional,
            "strategy": intent["strategy"], "legs": results,
        })
    except Exception as e:
        signed("POST", "/api/public/bot/fills", {
            "intent_id": intent["id"], "status": "failed",
            "realized_pnl_usd": 0, "notional_usd": notional,
            "strategy": intent["strategy"], "legs": [], "error": str(e),
        })

async def main():
    cfg = signed("GET", "/api/public/bot/config")
    clients = build_clients(cfg["exchanges"])
    print(f"Authenticated. CCXT clients ready: {list(clients)}")
    while True:
        intents = signed("GET", "/api/public/bot/intents?limit=5").get("intents", [])
        if not intents:
            await asyncio.sleep(1.0); continue
        await asyncio.gather(*[run_intent(clients, i) for i in intents])

if __name__ == "__main__":
    asyncio.run(main())`}</pre>
          <p className="text-xs text-muted-foreground">
            Required env on the worker: <code>BOT_SHARED_SECRET</code>, <code>BOT_USER_ID</code>,
            <code>LOVABLE_BASE_URL</code>, plus <code>{`{EXCHANGE}_API_KEY`}</code> /
            <code>{`{EXCHANGE}_SECRET`}</code> (and <code>{`{EXCHANGE}_PASSPHRASE`}</code> where
            applicable: kucoin, okx, bitget). Use exchange IDs exactly as ccxt expects them.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Why an external worker is mandatory</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Lovable runs on Cloudflare Workers. That runtime has no Python interpreter, no long-lived background processes, no persistent sockets across requests, and aggressive CPU/time limits per invocation — so it physically cannot run <code>ccxt.pro</code>, hold a websocket-authenticated trading session, or poll <code>fetch_deposits</code> for minutes/hours waiting for an on-chain confirmation. Storing private API keys in a stateless edge function is also a security non-starter. The dashboard therefore owns:</p>
          <ul className="list-disc ml-5">
            <li>Public WS scanning across Binance / OKX / Coinbase / Kraken</li>
            <li>The strict no-loss math gate (target % + slippage buffer)</li>
            <li>Multi-opportunity conflict resolution + capital allocation</li>
            <li>Session lifecycle until the target amount is hit</li>
          </ul>
          <p>The worker — running anywhere with a real Python runtime — owns order placement, balance reads, and on-chain transfers using your CCXT keys. No worker running = no real trades, by design.</p>
        </CardContent>
      </Card>
    </div>
  );
}
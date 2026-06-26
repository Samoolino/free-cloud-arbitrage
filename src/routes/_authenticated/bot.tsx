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
          The browser scanner detects opportunities and stores intents. A small Python
          worker on Render/Railway picks them up and runs CCXT Pro to place live orders
          and trigger withdrawals. Use the API below to wire it up.
        </p>
      </header>

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
        <CardHeader><CardTitle className="text-base">Why an external worker?</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Lovable runs on Cloudflare Workers and cannot host long-lived <code>ccxt.pro</code> coroutines, withdrawal pollers, or <code>fetch_deposits</code> watchers. The dashboard owns:</p>
          <ul className="list-disc ml-5">
            <li>Public WS scanning across Binance / OKX / Coinbase / Kraken</li>
            <li>The strict no-loss math gate (target % + slippage buffer)</li>
            <li>Multi-opportunity conflict resolution + capital allocation</li>
            <li>Session lifecycle until the target amount is hit</li>
          </ul>
          <p>The worker owns order placement and on-chain transfers using your CCXT keys.</p>
        </CardContent>
      </Card>
    </div>
  );
}
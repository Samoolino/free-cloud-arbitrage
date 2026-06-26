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
        <CardHeader><CardTitle className="text-base">Endpoints (HMAC-SHA256 with BOT_SHARED_SECRET)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm font-mono">
          <div><Badge variant="outline">GET</Badge> /api/bot/config — returns active strategy snapshot</div>
          <div><Badge variant="outline">GET</Badge> /api/bot/intents — pending trade intents (FIFO)</div>
          <div><Badge variant="outline">POST</Badge> /api/bot/fills — report executed fills + realized PnL</div>
          <div><Badge variant="outline">POST</Badge> /api/bot/transfers — report withdrawal lifecycle</div>
          <div><Badge variant="outline">POST</Badge> /api/bot/events — stream system_events from the executor</div>
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
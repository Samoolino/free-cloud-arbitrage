import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, CircleDot } from "lucide-react";
import { lastMirrorCheck } from "@/lib/mirror.functions";
import { getConnectivity } from "@/lib/telemetry.functions";

export const Route = createFileRoute("/_authenticated/operations")({
  component: OperationsPage,
});

type Sensitivity = "sim" | "real";
type Status = "live" | "partial" | "planned";

const REAL = (
  <Badge className="bg-red-600 hover:bg-red-600 text-white gap-1">
    <AlertTriangle className="h-3 w-3" /> REAL MONEY
  </Badge>
);
const SIM = (
  <Badge variant="secondary" className="gap-1">
    <ShieldCheck className="h-3 w-3" /> SIMULATED
  </Badge>
);

function StatusPill({ s }: { s: Status }) {
  const map = {
    live: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
    partial: "bg-amber-500/15 text-amber-500 border-amber-500/40",
    planned: "bg-muted text-muted-foreground border-border",
  } as const;
  return (
    <Badge variant="outline" className={`gap-1 ${map[s]}`}>
      <CircleDot className="h-3 w-3" /> {s}
    </Badge>
  );
}

const ENGAGEMENTS: {
  node: string;
  where: string;
  what: string;
  sensitivity: Sensitivity;
  status: Status;
}[] = [
  { node: "Browser scanner", where: "src/lib/scanner/engine.ts", what: "Ingests public order books, evaluates loops, writes queued trade_intents. Never touches funds.", sensitivity: "sim", status: "live" },
  { node: "Trade intent queue", where: "table: trade_intents", what: "Persisted candidates. status=queued|acked|filled. Still no funds moved.", sensitivity: "sim", status: "live" },
  { node: "HMAC bot API", where: "src/routes/api/public/bot/*", what: "Auth boundary between app and external executor. HMAC-SHA256 + 5-min skew window.", sensitivity: "sim", status: "live" },
  { node: "Python executor poll", where: "python_worker/executor.py — GET /bot/intents", what: "Reads next intent and marks it acked. Read-only wrt exchange funds.", sensitivity: "sim", status: "live" },
  { node: "CCXT create_order", where: "python_worker → exchange.create_order()", what: "First point where REAL FUNDS move. Runs only on your VPS with your keys.", sensitivity: "real", status: "live" },
  { node: "CCXT withdraw / transfer", where: "python_worker → exchange.withdraw()", what: "Cross-exchange asset movement. Real on-chain fees, real settlement risk.", sensitivity: "real", status: "live" },
  { node: "Fill report", where: "POST /api/public/bot/fills → table: trades", what: "Confirms a real fill occurred; realized PnL is recorded.", sensitivity: "real", status: "live" },
  { node: "Transfer lifecycle", where: "POST /api/public/bot/transfers → table: transfers", what: "Records withdrawal → in-flight → credited stages of a real transfer.", sensitivity: "real", status: "live" },
  { node: "GitHub webhook", where: "src/routes/api/public/github/webhook.ts", what: "On push to Samoolino/free-cloud-arbitrage@main: re-runs mirror integrity check.", sensitivity: "sim", status: "live" },
];

const STRATEGIES: {
  name: string;
  desc: string;
  status: Status;
  sensitivity: Sensitivity;
  where: string;
}[] = [
  { name: "Cross-exchange triangular (USDT/USDC → BASE → transfer → BASE → USDT/USDC)", desc: "Current default. Buy on venue A, transfer, sell on venue B. Uses no-loss depth-walked VWAP + slippage buffer + transfer fee.", status: "live", sensitivity: "real", where: "src/lib/scanner/engine.ts::scan" },
  { name: "Direct spot price-difference arbitrage", desc: "Same asset, two venues, no transfer — simultaneous buy low + sell high, netted at the executor. Fastest capital cycle.", status: "partial", sensitivity: "real", where: "engine.ts (uses same books; needs conflict-mode + inventory tracking)" },
  { name: "Intra-exchange triangular (A→B→C→A)", desc: "Three legs on the same venue. No withdraw, no on-chain fee, tight latency.", status: "planned", sensitivity: "real", where: "engine.ts — new enumerator" },
  { name: "Pentagonal (5-leg) cross-exchange", desc: "Longer paths across venues. Flag exists on bot_config; enumerator not implemented.", status: "planned", sensitivity: "real", where: "bot_config.pentagonal_enabled" },
  { name: "Stablecoin depeg (USDT/USDC/DAI)", desc: "Detect stable-stable spreads above threshold; cheap when both legs are on same venue.", status: "planned", sensitivity: "real", where: "engine.ts — new pair generator" },
  { name: "Funding-rate / basis carry (perp vs spot)", desc: "Requires perp feeds and a hedging leg. Needs futures adapter first.", status: "planned", sensitivity: "real", where: "not started — needs new adapter" },
];

function OperationsPage() {
  const getLast = useServerFn(lastMirrorCheck);
  const mirror = useQuery({ queryKey: ["ops-mirror-last"], queryFn: () => getLast() });
  const getConn = useServerFn(getConnectivity);
  const conn = useQuery({ queryKey: ["ops-connectivity"], queryFn: () => getConn(), refetchInterval: 10_000 });
  const executorFresh = conn.data?.executor_last_seen
    ? Date.now() - new Date(conn.data.executor_last_seen).getTime() < 120_000
    : false;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Operations audit</h1>
        <p className="text-sm text-muted-foreground">
          End-to-end map of the bot: where it runs, which engagements are simulated,
          and which touch real funds. Every {REAL} node executes only inside the
          external Python worker with your CCXT keys.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Deployment status</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs mb-1">Backend</div>
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Healthy</Badge>
            <p className="text-xs text-muted-foreground mt-1">Lovable Cloud (Cloudflare Workers + Postgres, RLS enforced).</p>
          </div>
          <div>
            <div className="text-muted-foreground text-xs mb-1">GitHub mirror</div>
            {mirror.isLoading ? (
              <Badge variant="outline">checking…</Badge>
            ) : mirror.data ? (
              <>
                <Badge variant="outline">{mirror.data.message ?? "unknown"}</Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Samoolino/free-cloud-arbitrage · main · webhook + integrity re-check wired.
                </p>
              </>
            ) : (
              <Badge variant="outline">no check yet — visit Git sync</Badge>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs mb-1">External executor</div>
            <Badge variant="outline">off-platform</Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Runs on your VPS/Render/Railway. Owns keys, is the ONLY component
              that touches live balances.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Point-to-point architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-[11px] leading-relaxed bg-muted/40 p-4 rounded overflow-x-auto">{`  [Browser scanner]  ── queued intent ──▶  [Supabase: trade_intents]        (SIM)
          │                                     │
          │ reads public WS books                │ HMAC GET /bot/intents
          ▼                                     ▼
  [Public exchange WS]              [Python worker on VPS]                 (REAL)
                                             │
                                             │ CCXT create_order per leg
                                             ▼
                                     [Exchange spot markets]               (REAL FUNDS)
                                             │
                                             │ POST /bot/fills, /bot/transfers
                                             ▼
                       [Supabase: trades, transfers, system_events]
                                             ▲
  [GitHub push] ─▶ /api/public/github/webhook (HMAC) ─▶ mirror integrity re-check`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Exchange connectivity (live)
            {executorFresh
              ? <Badge className="bg-emerald-600/20 text-emerald-500 border border-emerald-600/40">executor online</Badge>
              : <Badge variant="secondary">executor offline</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conn.data?.exchanges.length ? conn.data.exchanges.map((x) => {
            const fresh = Date.now() - new Date(x.last_seen).getTime() < 90_000;
            return (
              <div key={x.exchange_id} className="flex items-center justify-between border border-border rounded-md p-2 text-sm">
                <div className="flex items-center gap-2">
                  <CircleDot className={`h-3 w-3 ${fresh ? "text-emerald-500" : "text-muted-foreground"}`} />
                  <span className="capitalize font-medium">{x.exchange_id}</span>
                  <span className="text-xs text-muted-foreground">{x.message}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(x.last_seen).toLocaleTimeString()}
                </span>
              </div>
            );
          }) : (
            <p className="text-xs text-muted-foreground">
              No heartbeat received in the last 15 minutes. Start the Python worker; it will POST heartbeat events per WebSocket/REST client.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement inventory (sensitivity + status)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ENGAGEMENTS.map((e) => (
            <div key={e.node} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm">{e.node}</div>
                <div className="flex items-center gap-2">
                  <StatusPill s={e.status} />
                  {e.sensitivity === "real" ? REAL : SIM}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{e.what}</div>
              <div className="text-[11px] font-mono text-muted-foreground/80 mt-1">{e.where}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strategies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STRATEGIES.map((s) => (
            <div key={s.name} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm">{s.name}</div>
                <div className="flex items-center gap-2">
                  <StatusPill s={s.status} />
                  {s.sensitivity === "real" ? REAL : SIM}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
              <div className="text-[11px] font-mono text-muted-foreground/80 mt-1">{s.where}</div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            Every strategy marked {REAL} moves real funds through the Python worker
            only. Toggling a strategy in Strategy settings does not fire live orders
            unless the worker is running and unlocked (paper_trading=false, dry_run=false).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">GitHub connection</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Repo:</span> Samoolino/free-cloud-arbitrage</div>
            <div><span className="text-muted-foreground">Branch:</span> main</div>
            <div><span className="text-muted-foreground">Two-way sync:</span> Lovable ↔ GitHub (managed by Lovable Git integration)</div>
            <div><span className="text-muted-foreground">Webhook:</span> POST /api/public/github/webhook (HMAC via GITHUB_WEBHOOK_SECRET)</div>
            <div><span className="text-muted-foreground">Integrity check:</span> src/lib/github-mirror.server.ts — SHA compare of python_worker/* and src/routes/_authenticated/*</div>
            <div><span className="text-muted-foreground">Live status:</span> see the Git sync page for the latest diff + one-click copy of drift.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
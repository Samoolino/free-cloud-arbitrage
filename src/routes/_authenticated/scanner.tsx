import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getBotConfig } from "@/lib/bot-config.functions";
import { getActiveSession, recordPaperTrade, startSession, stopSession } from "@/lib/sessions.functions";
import { listExchangeCredentials } from "@/lib/exchanges.functions";
import { useScanner } from "@/hooks/use-scanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EXCHANGE_GRID, EXCHANGE_BY_ID } from "@/lib/exchanges";
import { Radar, Play, Square, CircleDot, Zap, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scanner")({
  component: ScannerPage,
});

function ScannerPage() {
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["bot_config"], queryFn: getBotConfig });
  const { data: session } = useQuery({ queryKey: ["session_active"], queryFn: getActiveSession });
  const { data: creds } = useQuery({ queryKey: ["creds"], queryFn: listExchangeCredentials });
  const [target, setTarget] = useState("250");
  const [capital, setCapital] = useState("1000");
  const [running, setRunning] = useState(false);

  const enabled = (config?.enabled_exchanges as string[] | null) ?? ["binance", "okx", "coinbase", "kraken"];
  const bases = (config?.tracked_assets as string[] | null) ?? ["BTC", "ETH", "SOL", "XRP"];

  const scannerCfg = useMemo(() => ({
    exchanges: enabled,
    bases,
    quotes: ["USDT", "USDC"],
    targetProfitPct: Number(config?.target_profit_pct ?? 1.5),
    slippageBufferPct: Number(config?.slippage_buffer_pct ?? 0.15),
    wsStalenessMs: Number(config?.ws_staleness_ms ?? 1500),
    triangular: Boolean(config?.triangular_enabled ?? true),
    pentagonal: Boolean(config?.pentagonal_enabled ?? false),
    capitalUsd: Number(capital) || 0,
    tickDebounceMs: 300,
  }), [enabled, bases, config, capital]);

  const { opportunities, resolved, adapterStatus, bookKeys } = useScanner(scannerCfg, running);

  const startSess = useMutation({
    mutationFn: (vars: { amount: number; trigger?: string }) =>
      startSession({ data: { target_amount_usd: vars.amount, trigger_exchange: vars.trigger } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["session_active"] }); toast.success("Session started"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const stopSess = useMutation({
    mutationFn: (id: string) => stopSession({ data: { session_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["session_active"] }); toast.success("Session stopped"); },
  });
  const paperFill = useMutation({
    mutationFn: (vars: { sid: string; legs: unknown; pnl: number; notional: number }) =>
      recordPaperTrade({ data: { session_id: vars.sid, legs: vars.legs, strategy: "triangular", notional_usd: vars.notional, realized_pnl_usd: vars.pnl } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["session_active"] });
      if (r.target_reached) toast.success("Target reached — session closed");
      else toast.success("Paper fill recorded");
    },
  });

  const triggerCred = (creds as Array<{ exchange_id: string; is_trigger: boolean }> | undefined)?.find((c) => c.is_trigger);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Radar className="h-5 w-5 text-primary"/> Live Scanner</h1>
          <p className="text-sm text-muted-foreground">Public WS feeds → no-loss math → conflict-resolved execution plan.</p>
        </div>
        <div className="flex items-center gap-2">
          {running
            ? <Button variant="destructive" onClick={() => setRunning(false)}><Square className="h-4 w-4 mr-2"/>Stop</Button>
            : <Button onClick={() => setRunning(true)}><Play className="h-4 w-4 mr-2"/>Start scanning</Button>}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Books streamed</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{bookKeys.size}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Candidates</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{opportunities.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Gated (passes no-loss)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold text-emerald-400">{opportunities.filter((o) => o.gatePassed).length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Selected this tick</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{resolved.selected.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CircleDot className="h-4 w-4"/> Session control</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {session ? (
            <div className="flex flex-wrap items-end gap-3">
              <div><div className="text-xs text-muted-foreground">Status</div><div className="font-medium capitalize">{session.status}</div></div>
              <div><div className="text-xs text-muted-foreground">Realized PnL</div><div className="font-medium">${Number(session.realized_pnl_usd).toFixed(2)}</div></div>
              <div><div className="text-xs text-muted-foreground">Target</div><div className="font-medium">${Number(session.target_amount_usd).toFixed(2)}</div></div>
              <div className="ml-auto"><Button variant="destructive" size="sm" onClick={() => stopSess.mutate(session.id)}>End session</Button></div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-[160px_160px_auto] gap-3 items-end">
              <div><Label className="text-xs">Target amount (USD)</Label><Input value={target} onChange={(e) => setTarget(e.target.value)} /></div>
              <div><Label className="text-xs">Trigger capital (USD)</Label><Input value={capital} onChange={(e) => setCapital(e.target.value)} /></div>
              <Button onClick={() => startSess.mutate({ amount: Number(target), trigger: triggerCred?.exchange_id })} disabled={!Number(target)}>
                Start target run
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Bot runs until target amount is hit. Paper fills are simulated from the resolved plan and live order book.
          </p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Adapters</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {EXCHANGE_GRID.filter((e) => enabled.includes(e.id)).map((e) => {
              const ok = adapterStatus[e.id];
              return (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span>{e.name}</span>
                  {e.hasPublicWs ? (
                    <Badge variant={ok ? "default" : "secondary"} className={ok ? "bg-emerald-600/30 text-emerald-300 border border-emerald-700/40" : ""}>
                      {ok ? "WS live" : "WS idle"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-300 border-amber-700/40">via executor</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-primary"/> Conflict-resolved execution plan</CardTitle>
          </CardHeader>
          <CardContent>
            {resolved.selected.length === 0 ? (
              <p className="text-sm text-muted-foreground">No opportunity passes the no-loss gate right now.</p>
            ) : (
              <div className="space-y-2">
                {resolved.selected.map(({ opp, allocatedUsd }) => (
                  <div key={opp.id} className="rounded-md border border-border bg-card/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{opp.path}</div>
                      <Badge className="bg-emerald-600/30 text-emerald-300 border border-emerald-700/40">+{opp.expectedNetPct.toFixed(3)}%</Badge>
                    </div>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div>Net <span className="text-foreground">${opp.expectedNetUsd.toFixed(2)}</span></div>
                      <div>Alloc <span className="text-foreground">${allocatedUsd.toFixed(0)}</span></div>
                      <div>Max <span className="text-foreground">${opp.maxSizeUsd.toFixed(0)}</span></div>
                      <div>Net via <span className="text-foreground">{opp.transferNetwork}</span></div>
                    </div>
                    {session && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="secondary" onClick={() => paperFill.mutate({
                          sid: session.id, legs: opp.legs, notional: allocatedUsd,
                          pnl: (opp.expectedNetPct / 100) * allocatedUsd,
                        })}>
                          <Check className="h-3.5 w-3.5 mr-1"/> Record paper fill
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {resolved.skipped.length > 0 && (
              <>
                <Separator className="my-3"/>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> {resolved.skipped.length} skipped due to leg conflict</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All candidates</CardTitle></CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Press Start scanning to subscribe to public order book streams.</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto divide-y divide-border text-sm">
              {opportunities.map((o) => (
                <div key={o.id} className="py-2 flex items-center gap-3">
                  <Badge variant={o.gatePassed ? "default" : "outline"} className={o.gatePassed ? "bg-emerald-600/30 text-emerald-300 border border-emerald-700/40" : ""}>
                    {o.expectedNetPct.toFixed(3)}%
                  </Badge>
                  <div className="flex-1 truncate">{o.path}</div>
                  <div className="text-xs text-muted-foreground">${o.expectedNetUsd.toFixed(2)} on ${capital}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
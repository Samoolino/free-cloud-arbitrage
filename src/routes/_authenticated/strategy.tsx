import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getBotConfig, updateBotConfig } from "@/lib/bot-config.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EXCHANGE_GRID } from "@/lib/exchanges";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/strategy")({ component: StrategyPage });

function StrategyPage() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["bot_config"], queryFn: getBotConfig });
  const [form, setForm] = useState<Record<string, unknown>>({});
  useEffect(() => { if (cfg) setForm(cfg); }, [cfg]);

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateBotConfig({ data: patch as never }),
    onSuccess: (d) => { qc.setQueryData(["bot_config"], d); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!cfg) return null;
  const enabledEx = (form.enabled_exchanges as string[]) ?? [];
  const tracked = (form.tracked_assets as string[]) ?? [];
  const toggleArr = (key: "enabled_exchanges" | "tracked_assets", val: string) => {
    const arr = ((form[key] as string[] | undefined) ?? []).slice();
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    setForm({ ...form, [key]: arr });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-semibold">Strategy</h1>
        <p className="text-sm text-muted-foreground">No-loss gate, paper mode, exchanges and tracked assets.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">PnL gate</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Target profit %</Label>
            <Input type="number" step="0.05" value={String(form.target_profit_pct ?? "")} onChange={(e) => setForm({ ...form, target_profit_pct: Number(e.target.value) })} />
          </div>
          <div><Label className="text-xs">Slippage buffer %</Label>
            <Input type="number" step="0.05" value={String(form.slippage_buffer_pct ?? "")} onChange={(e) => setForm({ ...form, slippage_buffer_pct: Number(e.target.value) })} />
          </div>
          <div><Label className="text-xs">Min trigger balance (USD)</Label>
            <Input type="number" value={String(form.min_trigger_balance_usd ?? "")} onChange={(e) => setForm({ ...form, min_trigger_balance_usd: Number(e.target.value) })} />
          </div>
          <div><Label className="text-xs">WS staleness (ms)</Label>
            <Input type="number" value={String(form.ws_staleness_ms ?? "")} onChange={(e) => setForm({ ...form, ws_staleness_ms: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <Switch checked={!!form.paper_trading} onCheckedChange={(v) => setForm({ ...form, paper_trading: v })} />
            <Label className="text-xs">Paper trading mode</Label>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <Switch checked={!!form.dry_run} onCheckedChange={(v) => setForm({ ...form, dry_run: v })} />
            <Label className="text-xs">Executor dry-run (no live orders)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Loops</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between"><Label>Triangular (3-leg)</Label>
            <Switch checked={!!form.triangular_enabled} onCheckedChange={(v) => setForm({ ...form, triangular_enabled: v })} /></div>
          <div className="flex items-center justify-between"><Label>Pentagonal (5-leg)</Label>
            <Switch checked={!!form.pentagonal_enabled} onCheckedChange={(v) => setForm({ ...form, pentagonal_enabled: v })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tracked assets</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["BTC", "ETH", "SOL", "XRP", "BNB", "MATIC", "AVAX", "DOGE"].map((a) => (
            <button key={a} onClick={() => toggleArr("tracked_assets", a)} className={`px-3 py-1 rounded-full text-xs border ${tracked.includes(a) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>{a}</button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Enabled exchanges</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {EXCHANGE_GRID.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={enabledEx.includes(e.id)} onChange={() => toggleArr("enabled_exchanges", e.id)} />
              <span className="flex-1">{e.name}</span>
              <span className="text-[10px] text-muted-foreground">{e.hasPublicWs ? "WS" : "REST"}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => update.mutate({
          paper_trading: !!form.paper_trading,
          target_profit_pct: Number(form.target_profit_pct),
          slippage_buffer_pct: Number(form.slippage_buffer_pct),
          min_trigger_balance_usd: Number(form.min_trigger_balance_usd),
          ws_staleness_ms: Number(form.ws_staleness_ms),
          triangular_enabled: !!form.triangular_enabled,
          pentagonal_enabled: !!form.pentagonal_enabled,
          enabled_exchanges: enabledEx,
          tracked_assets: tracked,
        })}>Save strategy</Button>
      </div>
    </div>
  );
}
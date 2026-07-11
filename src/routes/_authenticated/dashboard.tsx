import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { getBotConfig } from "@/lib/bot-config.functions";
import { getActiveSession } from "@/lib/sessions.functions";
import { listExchangeCredentials } from "@/lib/exchanges.functions";
import { setLiveTrading } from "@/lib/telemetry.functions";
import { Activity, Radar, Building2, Target, Shield, Zap, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  loader: async () => {
    const [config, session, creds] = await Promise.all([
      getBotConfig(),
      getActiveSession(),
      listExchangeCredentials(),
    ]);
    return { config, session, creds };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useSuspenseQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [config, session, creds] = await Promise.all([
        getBotConfig(), getActiveSession(), listExchangeCredentials(),
      ]);
      return { config, session, creds };
    },
    initialData: Route.useLoaderData(),
  });
  const creds = data.creds as Array<{ exchange_id: string; enabled: boolean; is_trigger: boolean }> | null;
  const trigger = creds?.find((c) => c.is_trigger);
  const enabledCount = creds?.filter((c) => c.enabled).length ?? 0;
  const isLive = !data.config.paper_trading && !data.config.dry_run;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live posture of your arbitrage engine.</p>
        </div>
        <div className="flex items-center gap-2">
          {isLive
            ? <Badge className="bg-red-600/20 text-red-400 border border-red-700/40">LIVE FUNDS</Badge>
            : <Badge variant="secondary">{data.config.paper_trading ? "Paper" : "Dry-run"}</Badge>}
          <GoLiveButton isLive={isLive} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Target className="h-3.5 w-3.5"/>Target profit</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data.config.target_profit_pct}%</div><div className="text-xs text-muted-foreground">+ slip {data.config.slippage_buffer_pct}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Shield className="h-3.5 w-3.5"/>Trigger API</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{trigger?.exchange_id ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Min ${Number(data.config.min_trigger_balance_usd).toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Building2 className="h-3.5 w-3.5"/>Exchanges</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{enabledCount}</div><div className="text-xs text-muted-foreground">enabled</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Activity className="h-3.5 w-3.5"/>Session</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold capitalize">{data.session?.status ?? "idle"}</div>
            <div className="text-xs text-muted-foreground">
              {data.session ? `$${Number(data.session.realized_pnl_usd).toFixed(2)} / $${Number(data.session.target_amount_usd).toFixed(0)}` : "No active target"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Get started</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button asChild variant="outline"><Link to="/exchanges"><Building2 className="h-4 w-4 mr-2"/>Configure exchanges</Link></Button>
          <Button asChild variant="outline"><Link to="/strategy"><Target className="h-4 w-4 mr-2"/>Tune strategy</Link></Button>
          <Button asChild><Link to="/scanner"><Radar className="h-4 w-4 mr-2"/>Open live scanner</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GoLiveButton({ isLive }: { isLive: boolean }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const call = useServerFn(setLiveTrading);
  const qc = useQueryClient();

  async function submit(enable: boolean) {
    setBusy(true);
    try {
      await call({ data: { enable, confirm_phrase: enable ? phrase : "" } });
      toast.success(enable ? "Live trading ENABLED" : "Live trading disabled");
      setOpen(false);
      setPhrase("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLive) {
    return (
      <Button size="sm" variant="outline" onClick={() => submit(false)} disabled={busy}>
        <ShieldOff className="h-3.5 w-3.5 mr-2" /> Disable live
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
          <Zap className="h-3.5 w-3.5 mr-2" /> Go Live
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-500">Enable live trading</DialogTitle>
          <DialogDescription>
            This flips <code>bot_config.paper_trading=false</code> and <code>dry_run=false</code>.
            Your running Python worker (with <code>--live</code>) will begin placing REAL orders on every enabled exchange using its CCXT keys.
            No orders fire if the worker isn't running.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Type <code className="font-mono font-semibold">ENABLE LIVE TRADING</code> to confirm:
          </p>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="ENABLE LIVE TRADING" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={busy || phrase !== "ENABLE LIVE TRADING"}
            onClick={() => submit(true)}
          >
            <Zap className="h-3.5 w-3.5 mr-2" /> Confirm & enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
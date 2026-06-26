import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBotConfig } from "@/lib/bot-config.functions";
import { getActiveSession } from "@/lib/sessions.functions";
import { listExchangeCredentials } from "@/lib/exchanges.functions";
import { Activity, Radar, Building2, Target, Shield } from "lucide-react";

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
  const trigger = data.creds?.find((c) => c.is_trigger);
  const enabledCount = data.creds?.filter((c) => c.enabled).length ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live posture of your arbitrage engine.</p>
        </div>
        <div className="flex items-center gap-2">
          {data.config.paper_trading ? (
            <Badge variant="secondary">Paper trading</Badge>
          ) : (
            <Badge className="bg-amber-600/20 text-amber-400 border border-amber-700/40">Live funds</Badge>
          )}
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
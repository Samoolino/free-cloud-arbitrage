import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBalances, getConnectivity } from "@/lib/telemetry.functions";

export const Route = createFileRoute("/_authenticated/balances")({
  component: BalancesPage,
});

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function isFresh(iso: string | null | undefined, maxAgeMs = 90_000) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < maxAgeMs;
}

function BalancesPage() {
  const getB = useServerFn(getBalances);
  const getC = useServerFn(getConnectivity);
  const bal = useQuery({ queryKey: ["balances"], queryFn: () => getB(), refetchInterval: 10_000 });
  const conn = useQuery({ queryKey: ["connectivity"], queryFn: () => getC(), refetchInterval: 10_000 });

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Wallet className="h-6 w-6" /> Live balances</h1>
          <p className="text-sm text-muted-foreground">
            Real-time asset totals pulled by the Python worker from every enabled CCXT client and pushed to <code>/api/public/bot/balances</code>. If a venue is missing, the worker either isn't running or its API key for that venue is missing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { bal.refetch(); conn.refetch(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Executor heartbeat
            {isFresh(conn.data?.executor_last_seen, 120_000)
              ? <Badge className="bg-emerald-600/20 text-emerald-500 border border-emerald-600/40">online</Badge>
              : <Badge variant="secondary">offline</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Last event from <code>executor</code>: {timeAgo(conn.data?.executor_last_seen)}. Real order routing requires this to be online.
        </CardContent>
      </Card>

      {bal.data?.snapshots.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {bal.data.snapshots.map((s) => {
            const balances = (s.balances && typeof s.balances === "object" ? s.balances : {}) as Record<string, number | string>;
            const rows = Object.entries(balances).filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
            const fresh = isFresh(s.taken_at, 60_000);
            return (
              <Card key={s.exchange_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="capitalize">{s.exchange_id}</span>
                    <div className="flex items-center gap-2">
                      {fresh
                        ? <Badge className="bg-emerald-600/20 text-emerald-500 border border-emerald-600/40">live</Badge>
                        : <Badge variant="secondary">stale</Badge>}
                      <span className="text-xs text-muted-foreground">{timeAgo(s.taken_at)}</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold mb-2">${s.total_usd.toFixed(2)}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.slice(0, 8).map(([asset, amt]) => (
                        <tr key={asset} className="border-t border-border/40">
                          <td className="py-1 font-mono">{asset}</td>
                          <td className="py-1 text-right font-mono text-muted-foreground">{Number(amt).toFixed(6)}</td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td className="py-2 text-muted-foreground text-xs" colSpan={2}>No non-zero balances reported.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No balance snapshots yet. Start the Python worker with <code>--live</code> or <code>--dry-run</code>; it will POST balances every 30 seconds.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
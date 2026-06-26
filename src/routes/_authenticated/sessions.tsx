import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listSessions } from "@/lib/sessions.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/sessions")({ component: SessionsPage });

type Row = { id: string; status: string; target_amount_usd: number; realized_pnl_usd: number; trades_count: number; started_at: string; ended_at: string | null };

function SessionsPage() {
  const { data } = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const rows = (data as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Sessions</h1>
      <Card><CardHeader><CardTitle className="text-base">Recent</CardTitle></CardHeader><CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No sessions yet.</p> : (
          <div className="divide-y divide-border text-sm">
            {rows.map((s) => (
              <div key={s.id} className="py-2 flex items-center gap-3">
                <Badge variant={s.status === "running" ? "default" : "outline"}>{s.status}</Badge>
                <div className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleString()}</div>
                <div className="ml-auto text-xs">${Number(s.realized_pnl_usd).toFixed(2)} / ${Number(s.target_amount_usd).toFixed(0)} ({s.trades_count} fills)</div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const listTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("trades").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  });

type Row = { id: string; strategy: string; notional_usd: number; realized_pnl_usd: number; paper: boolean; created_at: string };

export const Route = createFileRoute("/_authenticated/trades")({ component: TradesPage });

function TradesPage() {
  const { data } = useQuery({ queryKey: ["trades"], queryFn: () => listTrades() });
  const rows = (data as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Trades</h1>
      <Card><CardContent className="pt-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No trades yet.</p> : (
          <div className="divide-y divide-border text-sm">
            {rows.map((t) => (
              <div key={t.id} className="py-2 flex items-center gap-3">
                <Badge variant="outline">{t.strategy}</Badge>
                {t.paper && <Badge variant="secondary">paper</Badge>}
                <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                <div className="ml-auto text-xs">${Number(t.notional_usd).toFixed(2)} → <span className={Number(t.realized_pnl_usd) >= 0 ? "text-emerald-400" : "text-red-400"}>${Number(t.realized_pnl_usd).toFixed(2)}</span></div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
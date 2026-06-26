import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const list = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("transfers").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  });

type Row = { id: string; asset: string; amount: number; from_exchange: string; to_exchange: string; network: string; status: string; created_at: string };

export const Route = createFileRoute("/_authenticated/transfers")({ component: TransfersPage });

function TransfersPage() {
  const { data } = useQuery({ queryKey: ["transfers"], queryFn: () => list() });
  const rows = (data as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Transfers</h1>
      <Card><CardContent className="pt-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No cross-exchange transfers yet.</p> : (
          <div className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <div key={r.id} className="py-2 flex items-center gap-3">
                <Badge variant={r.status === "confirmed" ? "default" : "outline"}>{r.status}</Badge>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                <div className="ml-auto text-xs">{r.amount} {r.asset} {r.from_exchange} → {r.to_exchange} ({r.network})</div>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
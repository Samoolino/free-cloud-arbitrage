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
    const { data, error } = await supabase.from("system_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  });

type Row = { id: string; severity: string; source: string; message: string; created_at: string };

export const Route = createFileRoute("/_authenticated/logs")({ component: LogsPage });

function LogsPage() {
  const { data } = useQuery({ queryKey: ["logs"], queryFn: () => list() });
  const rows = (data as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-semibold">System logs</h1>
      <Card><CardContent className="pt-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : (
          <div className="divide-y divide-border text-xs font-mono">
            {rows.map((r) => (
              <div key={r.id} className="py-1.5 flex gap-3">
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</span>
                <Badge variant="outline" className="h-5 text-[10px]">{r.severity}</Badge>
                <span className="text-muted-foreground">[{r.source}]</span>
                <span className="flex-1">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
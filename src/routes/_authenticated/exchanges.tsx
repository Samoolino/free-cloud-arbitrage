import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EXCHANGE_GRID, EXCHANGE_BY_ID } from "@/lib/exchanges";
import {
  deleteExchangeCredential,
  listExchangeCredentials,
  upsertExchangeCredential,
} from "@/lib/exchanges.functions";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/exchanges")({ component: ExchangesPage });

type Cred = { id: string; exchange_id: string; label: string | null; enabled: boolean; is_trigger: boolean; taker_fee_bps: number | null };

function ExchangesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["creds"], queryFn: listExchangeCredentials });
  const creds = (data as Cred[] | undefined) ?? [];
  const upsert = useMutation({
    mutationFn: (vars: Parameters<typeof upsertExchangeCredential>[0]["data"]) => upsertExchangeCredential({ data: vars }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["creds"] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteExchangeCredential({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["creds"] }); toast.success("Removed"); },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Exchanges</h1>
        <p className="text-sm text-muted-foreground">Connect API keys. Mark one as Trigger API — funds there define capital for sessions.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Connected</CardTitle></CardHeader>
        <CardContent>
          {creds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exchanges connected.</p>
          ) : (
            <div className="divide-y divide-border">
              {creds.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="font-medium w-32">{EXCHANGE_BY_ID[c.exchange_id]?.name ?? c.exchange_id}</div>
                  {c.is_trigger && <Badge>Trigger</Badge>}
                  <Badge variant={c.enabled ? "default" : "outline"}>{c.enabled ? "Enabled" : "Disabled"}</Badge>
                  <div className="text-xs text-muted-foreground ml-auto">{c.taker_fee_bps ?? "auto"} bps</div>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4"/></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddCredentialCard onSubmit={(vars) => upsert.mutate(vars)} />
    </div>
  );
}

function AddCredentialCard({ onSubmit }: { onSubmit: (v: { exchange_id: string; label: string; api_key: string; api_secret: string; passphrase: string; enabled: boolean; is_trigger: boolean }) => void }) {
  const [v, setV] = useState({
    exchange_id: "binance", label: "", api_key: "", api_secret: "", passphrase: "",
    enabled: true, is_trigger: false,
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Add / update credential</CardTitle></CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        <div><Label className="text-xs">Exchange</Label>
          <select value={v.exchange_id} onChange={(e) => setV({ ...v, exchange_id: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            {EXCHANGE_GRID.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Label</Label><Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="Optional"/></div>
        <div><Label className="text-xs">API key</Label><Input value={v.api_key} onChange={(e) => setV({ ...v, api_key: e.target.value })} /></div>
        <div><Label className="text-xs">API secret</Label><Input type="password" value={v.api_secret} onChange={(e) => setV({ ...v, api_secret: e.target.value })} /></div>
        <div><Label className="text-xs">Passphrase (OKX/KuCoin)</Label><Input type="password" value={v.passphrase} onChange={(e) => setV({ ...v, passphrase: e.target.value })} /></div>
        <div className="flex items-center gap-6 pt-5">
          <div className="flex items-center gap-2"><Switch checked={v.enabled} onCheckedChange={(x) => setV({ ...v, enabled: x })} /><Label>Enabled</Label></div>
          <div className="flex items-center gap-2"><Switch checked={v.is_trigger} onCheckedChange={(x) => setV({ ...v, is_trigger: x })} /><Label>Trigger API</Label></div>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={() => onSubmit(v)}>Save credential</Button>
        </div>
      </CardContent>
    </Card>
  );
}
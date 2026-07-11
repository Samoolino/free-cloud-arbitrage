import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export const getBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // latest snapshot per exchange
    const { data, error } = await supabase
      .from("balances_snapshot")
      .select("exchange_id, balances, total_usd, taken_at")
      .eq("user_id", userId)
      .order("taken_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const seen = new Set<string>();
    const latest: Array<{ exchange_id: string; balances: Json; total_usd: number; taken_at: string }> = [];
    for (const row of data ?? []) {
      if (seen.has(row.exchange_id)) continue;
      seen.add(row.exchange_id);
      latest.push({
        exchange_id: row.exchange_id,
        balances: row.balances,
        total_usd: Number(row.total_usd ?? 0),
        taken_at: row.taken_at as string,
      });
    }
    return { snapshots: latest };
  });

export const getConnectivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Look for heartbeat events from the worker (source starts with 'heartbeat')
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const events = await supabase
      .from("system_events")
      .select("source, level, message, context, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (events.error) throw events.error;
    const byExchange = new Map<string, { source: string; last_seen: string; level: string; message: string; context: Json }>();
    let executorLastSeen: string | null = null;
    for (const e of events.data ?? []) {
      if (e.source === "executor" && !executorLastSeen) executorLastSeen = e.created_at as string;
      if (typeof e.source === "string" && e.source.startsWith("heartbeat:")) {
        const ex = e.source.slice("heartbeat:".length);
        if (!byExchange.has(ex)) {
          byExchange.set(ex, {
            source: e.source,
            last_seen: e.created_at as string,
            level: e.level as string,
            message: e.message as string,
            context: (e.context ?? null) as Json,
          });
        }
      }
    }
    return {
      executor_last_seen: executorLastSeen,
      exchanges: Array.from(byExchange.entries()).map(([exchange_id, v]) => ({ exchange_id, ...v })),
    };
  });

export const getExecutionDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [intents, trades, errors] = await Promise.all([
      supabase.from("trade_intents")
        .select("id, status, allocated_usd, created_at, result_at, error")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
      supabase.from("trades")
        .select("id, strategy, notional_usd, realized_pnl_usd, paper, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("system_events")
        .select("source, level, message, created_at")
        .eq("user_id", userId).eq("level", "error")
        .order("created_at", { ascending: false }).limit(10),
    ]);
    if (intents.error) throw intents.error;
    if (trades.error) throw trades.error;
    if (errors.error) throw errors.error;
    const counts: Record<string, number> = { queued: 0, acked: 0, filled: 0, failed: 0, cancelled: 0, aborted_stale: 0, partial: 0 };
    for (const i of intents.data ?? []) counts[i.status] = (counts[i.status] ?? 0) + 1;
    return { counts, intents: intents.data ?? [], trades: trades.data ?? [], errors: errors.data ?? [] };
  });

const GoLiveSchema = z.object({
  confirm_phrase: z.string(),
  enable: z.boolean(),
});

export const setLiveTrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GoLiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.enable && data.confirm_phrase !== "ENABLE LIVE TRADING") {
      throw new Error("Confirmation phrase mismatch. Type exactly: ENABLE LIVE TRADING");
    }
    const paper = !data.enable;
    const dry = !data.enable;
    const up = await supabase.from("bot_config")
      .upsert({ user_id: userId, paper_trading: paper, dry_run: dry }, { onConflict: "user_id" })
      .select("paper_trading, dry_run").single();
    if (up.error) throw up.error;
    await supabase.from("system_events").insert({
      user_id: userId,
      level: data.enable ? "warn" : "info",
      source: "dashboard",
      message: data.enable ? "LIVE TRADING ENABLED by user" : "Live trading disabled — reverted to paper/dry-run",
      context: { paper_trading: paper, dry_run: dry } as never,
    });
    return up.data;
  });
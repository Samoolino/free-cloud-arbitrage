import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getBotConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const sel = await supabase.from("bot_config").select("*").eq("user_id", userId).maybeSingle();
    if (sel.error) throw sel.error;
    if (sel.data) return sel.data;
    const ins = await supabase.from("bot_config").insert({ user_id: userId }).select("*").single();
    if (ins.error) throw ins.error;
    return ins.data;
  });

const UpdateSchema = z.object({
  paper_trading: z.boolean().optional(),
  target_profit_pct: z.number().min(0).max(50).optional(),
  slippage_buffer_pct: z.number().min(0).max(10).optional(),
  min_trigger_balance_usd: z.number().min(0).optional(),
  ws_staleness_ms: z.number().int().min(100).max(10_000).optional(),
  triangular_enabled: z.boolean().optional(),
  pentagonal_enabled: z.boolean().optional(),
  conflict_mode: z.enum(["greedy", "single_best"]).optional(),
  enabled_exchanges: z.array(z.string()).optional(),
  tracked_assets: z.array(z.string()).optional(),
  coingecko_plan: z.enum(["DEMO", "PRO"]).optional(),
});

export const updateBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const up = await supabase
      .from("bot_config")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" })
      .select("*").single();
    if (up.error) throw up.error;
    return up.data;
  });
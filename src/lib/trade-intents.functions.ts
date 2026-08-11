import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const TradeIntentCandidate = z.object({
  strategy: z.enum(["triangular", "pentagonal"]),
  legs: z.array(z.unknown()).min(1),
  allocated_usd: z.number().positive(),
  expected_net_usd: z.number(),
  expected_net_pct: z.number(),
  max_size_usd: z.number().positive(),
  path: z.string().optional(),
  transfer_network: z.string().nullable().optional(),
  transfer_fee_quote: z.number().nullable().optional(),
});

const QueueTradeIntentsSchema = z.object({
  selected: z.array(TradeIntentCandidate).min(1).max(25),
  session_id: z.string().uuid().optional(),
});

export type TradeIntentCandidateInput = z.infer<typeof TradeIntentCandidate>;

export function buildQueuedTradeIntentRows(
  userId: string,
  sessionId: string,
  selected: TradeIntentCandidateInput[],
) {
  return selected.map((item) => ({
    user_id: userId,
    session_id: sessionId,
    opportunity_id: null,
    legs: item.legs as never,
    allocated_usd: item.allocated_usd,
    expected_net_usd: item.expected_net_usd,
    lock_token: randomUUID(),
    ttl_ms: 800,
    status: "queued" as const,
  }));
}

export const queueTradeIntents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QueueTradeIntentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let sessionId = data.session_id ?? null;

    if (!sessionId) {
      const active = await supabase
        .from("sessions")
        .select("id,status")
        .eq("user_id", userId)
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active.error) throw active.error;
      if (!active.data) throw new Error("No active running session found");
      sessionId = active.data.id;
    }

    const session = await supabase
      .from("sessions")
      .select("id,status")
      .eq("user_id", userId)
      .eq("id", sessionId)
      .maybeSingle();
    if (session.error) throw session.error;
    if (!session.data || session.data.status !== "running") {
      throw new Error("Session must be running to queue trade intents");
    }

    const rows = buildQueuedTradeIntentRows(userId, sessionId, data.selected);

    const inserted = await supabase.from("trade_intents").insert(rows);
    if (inserted.error) throw inserted.error;

    return { queued: rows.length };
  });

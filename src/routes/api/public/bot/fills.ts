import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

const Body = z.object({
  intent_id: z.string().uuid(),
  status: z.enum(["filled", "partial", "failed", "cancelled", "aborted_stale"]),
  realized_pnl_usd: z.number(),
  notional_usd: z.number().nonnegative(),
  strategy: z.enum(["triangular", "pentagonal"]),
  legs: z.array(z.unknown()),
  error: z.string().optional().nullable(),
});

export const Route = createFileRoute("/api/public/bot/fills")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, raw, url.pathname);
          const parsed = Body.safeParse(JSON.parse(raw || "{}"));
          if (!parsed.success) return errorBot(parsed.error.message);
          const f = parsed.data;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const intent = await supabaseAdmin
            .from("trade_intents").select("session_id,user_id")
            .eq("id", f.intent_id).maybeSingle();
          if (intent.error) return errorBot(intent.error.message, 500);
          if (!intent.data || intent.data.user_id !== userId) return errorBot("intent not found", 404);

          const up = await supabaseAdmin.from("trade_intents").update({
            status: f.status,
            realized_pnl_usd: f.realized_pnl_usd,
            result_at: new Date().toISOString(),
            error: f.error ?? null,
          }).eq("id", f.intent_id).eq("user_id", userId);
          if (up.error) return errorBot(up.error.message, 500);

          if (f.status === "filled" || f.status === "partial") {
            const t = await supabaseAdmin.from("trades").insert({
              user_id: userId,
              session_id: intent.data.session_id,
              intent_id: f.intent_id,
              strategy: f.strategy,
              legs: f.legs as never,
              notional_usd: f.notional_usd,
              realized_pnl_usd: f.realized_pnl_usd,
              paper: false,
            });
            if (t.error) return errorBot(t.error.message, 500);
          }
          return jsonBot({ ok: true });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
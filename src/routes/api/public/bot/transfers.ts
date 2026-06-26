import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

const Body = z.object({
  id: z.string().uuid().optional(),
  intent_id: z.string().uuid().nullable().optional(),
  asset: z.string().min(2),
  network: z.string().min(2),
  from_exchange: z.string().min(2),
  to_exchange: z.string().min(2),
  amount: z.number().positive(),
  fee: z.number().nonnegative().optional(),
  tx_hash: z.string().optional().nullable(),
  status: z.enum(["pending", "broadcast", "confirmed", "failed"]),
});

export const Route = createFileRoute("/api/public/bot/transfers")({
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
          const t = parsed.data;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const payload = {
            user_id: userId,
            intent_id: t.intent_id ?? null,
            asset: t.asset,
            network: t.network,
            from_exchange: t.from_exchange,
            to_exchange: t.to_exchange,
            amount: t.amount,
            fee: t.fee ?? null,
            tx_hash: t.tx_hash ?? null,
            status: t.status,
            confirmed_at: t.status === "confirmed" ? new Date().toISOString() : null,
          };

          if (t.id) {
            const up = await supabaseAdmin.from("transfers")
              .update(payload).eq("id", t.id).eq("user_id", userId)
              .select("*").maybeSingle();
            if (up.error) return errorBot(up.error.message, 500);
            return jsonBot({ transfer: up.data });
          }
          const ins = await supabaseAdmin.from("transfers")
            .insert(payload).select("*").single();
          if (ins.error) return errorBot(ins.error.message, 500);
          return jsonBot({ transfer: ins.data });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
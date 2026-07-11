import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

const Body = z.object({
  snapshots: z.array(z.object({
    exchange_id: z.string().min(1),
    balances: z.record(z.string(), z.union([z.number(), z.string()])),
    total_usd: z.number().nonnegative().default(0),
  })).min(1).max(50),
});

export const Route = createFileRoute("/api/public/bot/balances")({
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
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rows = parsed.data.snapshots.map((s) => ({
            user_id: userId,
            exchange_id: s.exchange_id,
            balances: s.balances as never,
            total_usd: s.total_usd,
            taken_at: new Date().toISOString(),
          }));
          const ins = await supabaseAdmin.from("balances_snapshot").insert(rows);
          if (ins.error) return errorBot(ins.error.message, 500);
          return jsonBot({ inserted: rows.length });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
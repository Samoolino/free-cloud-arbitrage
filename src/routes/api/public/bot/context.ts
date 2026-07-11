import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

const UpsertBody = z.object({
  entries: z.array(z.object({
    scope: z.string().min(1),
    exchange_id: z.string().nullable().optional(),
    symbol: z.string().nullable().optional(),
    payload: z.record(z.string(), z.unknown()),
    ttl_seconds: z.number().int().min(1).max(86400).default(60),
  })).min(1).max(200),
});

export const Route = createFileRoute("/api/public/bot/context")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, "", url.pathname);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rows = await supabaseAdmin.from("market_context")
            .select("scope, exchange_id, symbol, payload, ttl_seconds, updated_at")
            .eq("user_id", userId).order("updated_at", { ascending: false }).limit(500);
          if (rows.error) return errorBot(rows.error.message, 500);
          return jsonBot({ entries: rows.data ?? [] });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, raw, url.pathname);
          const parsed = UpsertBody.safeParse(JSON.parse(raw || "{}"));
          if (!parsed.success) return errorBot(parsed.error.message);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const rows = parsed.data.entries.map((e) => ({
            user_id: userId,
            scope: e.scope,
            exchange_id: e.exchange_id ?? null,
            symbol: e.symbol ?? null,
            payload: e.payload as never,
            ttl_seconds: e.ttl_seconds,
          }));
          const up = await supabaseAdmin.from("market_context")
            .upsert(rows, { onConflict: "user_id,scope,exchange_id,symbol" });
          if (up.error) return errorBot(up.error.message, 500);
          return jsonBot({ upserted: rows.length });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
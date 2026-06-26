import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

const Body = z.object({
  events: z.array(z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    source: z.string().min(1),
    message: z.string().min(1).max(2000),
    session_id: z.string().uuid().nullable().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })).min(1).max(100),
});

export const Route = createFileRoute("/api/public/bot/events")({
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
          const rows = parsed.data.events.map((e) => ({
            user_id: userId,
            level: e.level,
            source: e.source,
            message: e.message,
            session_id: e.session_id ?? null,
            context: (e.context ?? null) as never,
          }));
          const ins = await supabaseAdmin.from("system_events").insert(rows);
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
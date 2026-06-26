import { createFileRoute } from "@tanstack/react-router";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

// GET  → FIFO list of queued intents (also marks them `acked` so the worker
//        does not re-fetch the same row on the next poll).
// POST → optional explicit ack for a single intent id.
export const Route = createFileRoute("/api/public/bot/intents")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, "", url.pathname);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const sel = await supabaseAdmin
            .from("trade_intents").select("*")
            .eq("user_id", userId).eq("status", "queued")
            .order("created_at", { ascending: true }).limit(limit);
          if (sel.error) return errorBot(sel.error.message, 500);
          const rows = sel.data ?? [];
          if (rows.length) {
            await supabaseAdmin.from("trade_intents")
              .update({ status: "acked", ack_at: new Date().toISOString() })
              .in("id", rows.map((r) => r.id));
          }
          return jsonBot({ intents: rows });
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
          const body = JSON.parse(raw || "{}") as { id?: string; status?: string };
          if (!body.id) return errorBot("id required");
          const status = body.status === "executing" ? "executing" : "acked";
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const up = await supabaseAdmin.from("trade_intents")
            .update({ status, ack_at: new Date().toISOString() })
            .eq("id", body.id).eq("user_id", userId).select("*").maybeSingle();
          if (up.error) return errorBot(up.error.message, 500);
          return jsonBot({ intent: up.data });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
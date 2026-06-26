import { createFileRoute } from "@tanstack/react-router";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

export const Route = createFileRoute("/api/public/bot/config")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, "", url.pathname);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const cfg = await supabaseAdmin
            .from("bot_config").select("*").eq("user_id", userId).maybeSingle();
          if (cfg.error) return errorBot(cfg.error.message, 500);
          const session = await supabaseAdmin
            .from("sessions").select("*").eq("user_id", userId)
            .in("status", ["running", "cooldown", "lockout"])
            .order("started_at", { ascending: false }).limit(1).maybeSingle();
          const creds = await supabaseAdmin
            .from("exchange_credentials")
            .select("exchange_id,label,enabled,is_trigger,taker_fee_bps")
            .eq("user_id", userId).eq("enabled", true);
          return jsonBot({
            config: cfg.data,
            active_session: session.data ?? null,
            exchanges: creds.data ?? [],
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
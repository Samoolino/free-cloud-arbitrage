import { createFileRoute } from "@tanstack/react-router";
import { verifyBotRequest, jsonBot, errorBot, BOT_CORS } from "@/lib/bot-auth.server";

// GET /api/public/bot/status — executor connectivity + last GitHub mirror sync.
// Reports queue depth, last intent ack, last fill, last system_event, last
// mirror_check event (with diff counts + errors). Worker should poll this on
// startup to confirm it is wired correctly.
export const Route = createFileRoute("/api/public/bot/status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, "", url.pathname);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const [queued, lastAck, lastFill, lastEvent, lastMirror, lastErr, cfg] = await Promise.all([
            supabaseAdmin.from("trade_intents").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("status", "queued"),
            supabaseAdmin.from("trade_intents").select("id, ack_at, status")
              .eq("user_id", userId).not("ack_at", "is", null)
              .order("ack_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from("trades").select("id, executed_at, realized_pnl_usd")
              .eq("user_id", userId).eq("paper", false)
              .order("executed_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from("system_events").select("created_at, level, source, message")
              .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from("system_events").select("created_at, message, context")
              .eq("user_id", userId).eq("source", "mirror_check")
              .order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from("system_events").select("created_at, source, message")
              .eq("user_id", userId).eq("level", "error")
              .order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseAdmin.from("bot_config").select("dry_run, paper_trading").eq("user_id", userId).maybeSingle(),
          ]);

          const now = Date.now();
          const ackMs = lastAck.data?.ack_at ? new Date(lastAck.data.ack_at).getTime() : null;
          const eventMs = lastEvent.data?.created_at ? new Date(lastEvent.data.created_at).getTime() : null;
          const lastSeen = Math.max(ackMs ?? 0, eventMs ?? 0) || null;
          const executor_online = lastSeen != null && now - lastSeen < 5 * 60_000;

          return jsonBot({
            executor: {
              online: executor_online,
              queued_intents: queued.count ?? 0,
              last_ack_at: lastAck.data?.ack_at ?? null,
              last_fill_at: lastFill.data?.executed_at ?? null,
              last_event: lastEvent.data ?? null,
              last_error: lastErr.data ?? null,
              dry_run: cfg.data?.dry_run ?? null,
              paper_trading: cfg.data?.paper_trading ?? null,
            },
            mirror: (() => {
              const ctx = (lastMirror.data?.context ?? null) as null | {
                head_sha?: string; matches?: number; mismatches?: number;
                missing_local?: number; missing_remote?: number;
              };
              const mismatches = ctx?.mismatches ?? 0;
              const missing = (ctx?.missing_local ?? 0) + (ctx?.missing_remote ?? 0);
              return {
                last_check_at: lastMirror.data?.created_at ?? null,
                last_message: lastMirror.data?.message ?? null,
                head_sha: ctx?.head_sha ?? null,
                matches: ctx?.matches ?? null,
                mismatches,
                missing_local: ctx?.missing_local ?? null,
                missing_remote: ctx?.missing_remote ?? null,
                in_sync: ctx ? mismatches === 0 && missing === 0 : null,
                context: ctx,
              };
            })(),
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});
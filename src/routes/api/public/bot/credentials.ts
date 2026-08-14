import { createFileRoute } from "@tanstack/react-router";
import { verifyBotRequest, errorBot, BOT_CORS } from "@/lib/bot-auth.server";
import { decryptExchangeSecret } from "@/lib/exchange-crypto.server";

export const Route = createFileRoute("/api/public/bot/credentials")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: BOT_CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { userId } = await verifyBotRequest(request, "", url.pathname);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await supabaseAdmin
            .from("exchange_credentials")
            .select("exchange_id,enabled,is_trigger,taker_fee_bps,api_key_enc,api_secret_enc,passphrase_enc")
            .eq("user_id", userId)
            .eq("enabled", true);
          if (result.error) return errorBot(result.error.message, 500);
          const credentials = (result.data ?? []).map((row) => ({
            exchange_id: row.exchange_id,
            enabled: row.enabled,
            is_trigger: row.is_trigger,
            taker_fee_bps: row.taker_fee_bps,
            api_key: decryptExchangeSecret(row.api_key_enc),
            secret: decryptExchangeSecret(row.api_secret_enc),
            passphrase: decryptExchangeSecret(row.passphrase_enc),
          }));
          return new Response(JSON.stringify({ credentials }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...BOT_CORS },
          });
        } catch (e) {
          if (e instanceof Response) return e;
          return errorBot((e as Error).message, 500);
        }
      },
    },
  },
});

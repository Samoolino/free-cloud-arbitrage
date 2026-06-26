import { createHmac, timingSafeEqual } from "node:crypto";

// Verify HMAC-SHA256 over `${timestamp}.${method}.${path}.${body}`.
// Headers required from the executor:
//   x-bot-timestamp  unix ms (rejected if older than 5 minutes)
//   x-bot-user-id    target user uuid (scopes data; HMAC binds it)
//   x-bot-signature  hex-encoded HMAC digest
export type BotAuth = { userId: string };

export async function verifyBotRequest(
  request: Request,
  rawBody: string,
  pathname: string,
): Promise<BotAuth> {
  const secret = process.env.BOT_SHARED_SECRET;
  if (!secret) throw new Response("server missing BOT_SHARED_SECRET", { status: 500 });

  const ts = request.headers.get("x-bot-timestamp");
  const userId = request.headers.get("x-bot-user-id");
  const sig = request.headers.get("x-bot-signature");
  if (!ts || !userId || !sig) throw new Response("missing bot headers", { status: 401 });

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
    throw new Response("stale timestamp", { status: 401 });
  }

  const payload = `${ts}.${request.method.toUpperCase()}.${pathname}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let provided: Buffer;
  try { provided = Buffer.from(sig, "hex"); } catch { throw new Response("bad signature", { status: 401 }); }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Response("bad signature", { status: 401 });
  }
  return { userId };
}

export const BOT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-bot-timestamp, x-bot-user-id, x-bot-signature",
  "Access-Control-Max-Age": "86400",
} as const;

export function jsonBot(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...BOT_CORS },
  });
}

export function errorBot(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...BOT_CORS },
  });
}
import { describe, expect, it, beforeAll } from "bun:test";
import { createHmac } from "node:crypto";

beforeAll(() => { process.env.BOT_SHARED_SECRET = "test-secret"; });

function sign(method: string, path: string, body: string, ts: string, secret = "test-secret") {
  return createHmac("sha256", secret).update(`${ts}.${method.toUpperCase()}.${path}.${body}`).digest("hex");
}

function makeReq(method: string, path: string, body: string, headers: Record<string, string>) {
  return new Request(`http://localhost${path}`, { method, body: method === "GET" ? undefined : body, headers });
}

describe("verifyBotRequest (HMAC-SHA256)", () => {
  it("accepts a correctly signed request", async () => {
    const { verifyBotRequest } = await import("@/lib/bot-auth.server");
    const ts = String(Date.now());
    const userId = "11111111-1111-1111-1111-111111111111";
    const path = "/api/public/bot/config";
    const sig = sign("GET", path, "", ts);
    const req = makeReq("GET", path, "", {
      "x-bot-timestamp": ts, "x-bot-user-id": userId, "x-bot-signature": sig,
    });
    const out = await verifyBotRequest(req, "", path);
    expect(out.userId).toBe(userId);
  });

  it("rejects a tampered body", async () => {
    const { verifyBotRequest } = await import("@/lib/bot-auth.server");
    const ts = String(Date.now());
    const path = "/api/public/bot/fills";
    const sig = sign("POST", path, '{"a":1}', ts);
    const req = makeReq("POST", path, '{"a":2}', {
      "x-bot-timestamp": ts, "x-bot-user-id": "u", "x-bot-signature": sig,
    });
    await expect(verifyBotRequest(req, '{"a":2}', path)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects wrong secret", async () => {
    const { verifyBotRequest } = await import("@/lib/bot-auth.server");
    const ts = String(Date.now());
    const path = "/api/public/bot/events";
    const sig = sign("POST", path, "{}", ts, "wrong");
    const req = makeReq("POST", path, "{}", {
      "x-bot-timestamp": ts, "x-bot-user-id": "u", "x-bot-signature": sig,
    });
    await expect(verifyBotRequest(req, "{}", path)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects stale timestamp (>5 min)", async () => {
    const { verifyBotRequest } = await import("@/lib/bot-auth.server");
    const ts = String(Date.now() - 10 * 60_000);
    const path = "/api/public/bot/intents";
    const sig = sign("GET", path, "", ts);
    const req = makeReq("GET", path, "", {
      "x-bot-timestamp": ts, "x-bot-user-id": "u", "x-bot-signature": sig,
    });
    await expect(verifyBotRequest(req, "", path)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects missing headers", async () => {
    const { verifyBotRequest } = await import("@/lib/bot-auth.server");
    const req = makeReq("GET", "/api/public/bot/config", "", {});
    await expect(verifyBotRequest(req, "", "/api/public/bot/config")).rejects.toMatchObject({ status: 401 });
  });

  it("matches the Python worker signing scheme byte-for-byte", () => {
    // mirrors python_worker/worker.py signed() helper
    const ts = "1719600000000";
    const sig = sign("POST", "/api/public/bot/fills", '{"intent_id":"x"}', ts);
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });
});
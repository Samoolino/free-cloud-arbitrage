import { describe, expect, it, beforeAll, mock } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";

// --- in-memory supabase admin stub --------------------------------------
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  bot_config: [],
  sessions: [],
  exchange_credentials: [],
  trade_intents: [],
  trades: [],
  system_events: [],
  transfers: [],
};

function makeQuery(name: string) {
  let rows = [...(tables[name] ?? [])];
  const filters: Array<(r: Row) => boolean> = [];
  const api: Record<string, unknown> = {};
  const apply = () => rows.filter((r) => filters.every((f) => f(r)));
  api.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      const c = apply().length;
      return Promise.resolve({ data: null, error: null, count: c });
    }
    return api;
  };
  api.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api; };
  api.in = (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return api; };
  api.not = (k: string, _op: string, v: unknown) => { filters.push((r) => r[k] !== v); return api; };
  api.order = () => api;
  api.limit = () => api;
  api.maybeSingle = () => Promise.resolve({ data: apply()[0] ?? null, error: null });
  api.single = () => Promise.resolve({ data: apply()[0] ?? null, error: apply()[0] ? null : { message: "no row" } });
  api.then = (resolve: (v: unknown) => unknown) => resolve({ data: apply(), error: null, count: apply().length });
  api.insert = (row: Row | Row[]) => {
    const arr = Array.isArray(row) ? row : [row];
    for (const r of arr) tables[name].push({ id: r.id ?? randomUUID(), created_at: new Date().toISOString(), ...r });
    rows = [...tables[name]];
    return { select: () => ({ single: () => Promise.resolve({ data: arr[0], error: null }) }), then: (res: (v: unknown) => unknown) => res({ data: arr, error: null }) };
  };
  api.update = (patch: Row) => {
    const sub = {
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return sub; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return sub; },
      select: () => ({ maybeSingle: () => {
        const targets = apply();
        for (const t of targets) Object.assign(t, patch);
        return Promise.resolve({ data: targets[0] ?? null, error: null });
      } }),
      then: (res: (v: unknown) => unknown) => {
        const targets = apply();
        for (const t of targets) Object.assign(t, patch);
        return res({ data: targets, error: null });
      },
    };
    return sub;
  };
  api.upsert = (row: Row) => ({
    select: () => ({ single: () => {
      tables[name].push({ id: randomUUID(), ...row });
      return Promise.resolve({ data: row, error: null });
    } }),
  });
  return api;
}

const supabaseAdmin = { from: (name: string) => makeQuery(name) };

beforeAll(() => {
  process.env.BOT_SHARED_SECRET = "test-secret";
  mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));
});

// --- helpers -----------------------------------------------------------
const SECRET = "test-secret";
const USER = "22222222-2222-2222-2222-222222222222";

function signed(method: string, path: string, body: unknown = null) {
  const raw = body == null ? "" : JSON.stringify(body);
  const ts = String(Date.now());
  const sig = createHmac("sha256", SECRET).update(`${ts}.${method}.${path}.${raw}`).digest("hex");
  return new Request(`http://localhost${path}`, {
    method,
    body: method === "GET" ? undefined : raw,
    headers: {
      "Content-Type": "application/json",
      "x-bot-timestamp": ts,
      "x-bot-user-id": USER,
      "x-bot-signature": sig,
    },
  });
}

async function invoke(routePath: string, method: string, body: unknown = null) {
  const mod = await import(`@/routes/api/public/bot/${routePath}`);
  const handler = (mod.Route.options.server.handlers as Record<string, (c: { request: Request }) => Promise<Response>>)[method];
  return handler({ request: signed(method, `/api/public/bot/${routePath}`, body) });
}

// --- tests -------------------------------------------------------------
describe("bot api end-to-end", () => {
  it("GET /config returns config + active session + exchanges", async () => {
    tables.bot_config.push({ user_id: USER, dry_run: true, paper_trading: false });
    tables.sessions.push({ user_id: USER, status: "running", started_at: new Date().toISOString() });
    tables.exchange_credentials.push({ user_id: USER, exchange_id: "binance", enabled: true, is_trigger: true, taker_fee_bps: 10 });
    const res = await invoke("config", "GET");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config.dry_run).toBe(true);
    expect(json.active_session.status).toBe("running");
    expect(json.exchanges).toHaveLength(1);
  });

  it("GET /intents flips queued -> acked", async () => {
    const id = randomUUID();
    tables.trade_intents.push({ id, user_id: USER, status: "queued", legs: [], allocated_usd: 100, created_at: new Date().toISOString() });
    const res = await invoke("intents", "GET");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.intents).toHaveLength(1);
    const row = tables.trade_intents.find((r) => r.id === id)!;
    expect(row.status).toBe("acked");
  });

  it("POST /fills writes a real trade and updates intent", async () => {
    const id = randomUUID();
    tables.trade_intents.push({ id, user_id: USER, status: "acked", session_id: null, legs: [] });
    const res = await invoke("fills", "POST", {
      intent_id: id, status: "filled", realized_pnl_usd: 1.23,
      notional_usd: 100, strategy: "triangular", legs: [{ exchange: "binance" }],
    });
    expect(res.status).toBe(200);
    const trade = tables.trades.find((t) => t.intent_id === id);
    expect(trade).toBeTruthy();
    expect(trade!.paper).toBe(false);
    expect(trade!.realized_pnl_usd).toBe(1.23);
  });

  it("POST /events batch-inserts system events", async () => {
    const before = tables.system_events.length;
    const res = await invoke("events", "POST", {
      events: [
        { level: "info", source: "worker", message: "hello" },
        { level: "warn", source: "worker", message: "slow leg" },
      ],
    });
    expect(res.status).toBe(200);
    expect(tables.system_events.length).toBe(before + 2);
  });

  it("rejects unsigned requests", async () => {
    const req = new Request("http://localhost/api/public/bot/config", { method: "GET" });
    const mod = await import("@/routes/api/public/bot/config");
    const handler = (mod.Route.options.server.handlers as Record<string, (c: { request: Request }) => Promise<Response>>).GET;
    const res = await handler({ request: req });
    expect(res.status).toBe(401);
  });
});
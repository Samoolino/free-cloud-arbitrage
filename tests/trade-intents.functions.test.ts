import { describe, expect, it } from "bun:test";
import { buildQueuedTradeIntentRows, TradeIntentCandidateInput } from "@/lib/trade-intents.functions";

describe("buildQueuedTradeIntentRows", () => {
  it("creates queued trade intent rows with allocated_usd and lock tokens", () => {
    const selected: TradeIntentCandidateInput[] = [
      {
        strategy: "triangular",
        legs: [{ exchange: "binance", base: "BTC", quote: "USDT", side: "buy" }],
        allocated_usd: 250,
        expected_net_usd: 3.2,
        expected_net_pct: 1.28,
        max_size_usd: 500,
        path: "BTC/USDT",
      },
    ];

    const rows = buildQueuedTradeIntentRows("user-1", "session-1", selected);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        user_id: "user-1",
        session_id: "session-1",
        allocated_usd: 250,
        expected_net_usd: 3.2,
        status: "queued",
        ttl_ms: 800,
      }),
    );
    expect(rows[0].lock_token).toBeDefined();
    expect(rows[0].legs).toEqual(selected[0].legs);
  });
});

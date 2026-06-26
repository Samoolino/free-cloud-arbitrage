// Opportunity engine: ingests book updates from public-WS adapters, enumerates
// cross-exchange triangular loops (USDT/USDC -> BASE on exchange A -> transfer ->
// BASE on exchange B -> USDT/USDC), evaluates via no-loss math, ranks candidates,
// and resolves conflicts via greedy non-overlapping subset selection.

import type { Book } from "@/lib/no-loss-math";
import {
  evaluateLoop,
  passesGate,
  selectNonConflicting,
  type Leg,
  type ScoredOpportunity,
} from "@/lib/no-loss-math";
import { EXCHANGE_BY_ID, pickBestNetwork } from "@/lib/exchanges";
import { makeAdapter, type BookUpdate } from "./adapters";

export type EngineConfig = {
  exchanges: string[];
  bases: string[];
  quotes: string[];
  targetProfitPct: number;
  slippageBufferPct: number;
  wsStalenessMs: number;
  triangular: boolean;
  pentagonal: boolean;
  capitalUsd: number;
  tickDebounceMs: number;
};

export type EmittedOpportunity = ScoredOpportunity & {
  strategy: "triangular" | "pentagonal";
  path: string;
  gatePassed: boolean;
  reason?: string;
  detectedAt: number;
  transferNetwork?: string;
  transferFeeQuote?: number;
};

export type EngineEvents = {
  onOpportunity?: (opps: EmittedOpportunity[]) => void;
  onBook?: (key: string) => void;
  onAdapterStatus?: (exchange: string, ok: boolean) => void;
};

export class ScannerEngine {
  private books: Record<string, Book> = {};
  private unsubs: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last: EmittedOpportunity[] = [];

  constructor(private cfg: EngineConfig, private events: EngineEvents = {}) {}

  start() {
    const pairs: { base: string; quote: string }[] = [];
    for (const b of this.cfg.bases)
      for (const q of this.cfg.quotes)
        if (b !== q) pairs.push({ base: b, quote: q });

    for (const exId of this.cfg.exchanges) {
      if (!EXCHANGE_BY_ID[exId]) continue;
      const ad = makeAdapter(exId);
      if (!ad) continue;
      try {
        const u = ad.subscribe(pairs, (upd) => this.onBook(upd));
        this.unsubs.push(u);
        this.events.onAdapterStatus?.(exId, true);
      } catch {
        this.events.onAdapterStatus?.(exId, false);
      }
    }
  }

  stop() {
    for (const u of this.unsubs) try { u(); } catch {}
    this.unsubs = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  resolve(opps: EmittedOpportunity[]) {
    const gated = opps.filter((o) => o.gatePassed);
    return selectNonConflicting(gated, this.cfg.capitalUsd);
  }

  private onBook(u: BookUpdate) {
    this.books[`${u.exchange}:${u.base}-${u.quote}`] = u.book;
    this.events.onBook?.(`${u.exchange}:${u.base}-${u.quote}`);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const opps = this.scan();
      this.last = opps;
      if (opps.length) this.events.onOpportunity?.(opps);
    }, this.cfg.tickDebounceMs);
  }

  private scan(): EmittedOpportunity[] {
    const out: EmittedOpportunity[] = [];
    const now = Date.now();
    const { capitalUsd } = this.cfg;
    if (capitalUsd <= 0 || !this.cfg.triangular) return out;

    for (const q of this.cfg.quotes) {
      for (const base of this.cfg.bases) {
        if (base === q) continue;
        for (const a of this.cfg.exchanges) for (const b of this.cfg.exchanges) {
          if (a === b) continue;
          const keyA = `${a}:${base}-${q}`;
          const keyB = `${b}:${base}-${q}`;
          const bookA = this.books[keyA];
          const bookB = this.books[keyB];
          if (!bookA || !bookB) continue;
          const stale = Math.max(now - bookA.ts, now - bookB.ts);
          if (stale > this.cfg.wsStalenessMs) continue;
          const metaA = EXCHANGE_BY_ID[a]; const metaB = EXCHANGE_BY_ID[b];
          if (!metaA || !metaB) continue;
          const transfer = pickBestNetwork(base, a, b);
          if (!transfer) continue;
          const legs: Leg[] = [
            { exchange: a, base, quote: q, side: "buy", feeBps: metaA.takerFeeBps },
            { exchange: b, base, quote: q, side: "sell", feeBps: metaB.takerFeeBps },
          ];
          const transferFeeQuote = transfer.fee * (bookB.bids[0]?.price ?? 0);
          const res = evaluateLoop(legs, { [keyA]: bookA, [keyB]: bookB }, capitalUsd, transferFeeQuote);
          if (!res) continue;
          const passed = passesGate({
            netPct: res.pct,
            targetProfitPct: this.cfg.targetProfitPct,
            slippageBufferPct: this.cfg.slippageBufferPct,
          });
          const maxSizeUsd = Math.min(
            (bookA.asks[0]?.price ?? 0) * (bookA.asks[0]?.size ?? 0),
            (bookB.bids[0]?.price ?? 0) * (bookB.bids[0]?.size ?? 0),
            capitalUsd,
          );
          out.push({
            id: `${a}-${b}-${base}-${q}-${now}`,
            legs,
            expectedNetUsd: (res.pct / 100) * capitalUsd,
            expectedNetPct: res.pct,
            maxSizeUsd,
            staleness: stale,
            strategy: "triangular",
            path: `${q} → [${metaA.name}] ${base} → (${transfer.code}) → [${metaB.name}] ${base} → ${q}`,
            gatePassed: passed,
            reason: passed ? undefined : `net ${res.pct.toFixed(3)}% below gate`,
            detectedAt: now,
            transferNetwork: transfer.code,
            transferFeeQuote,
          });
        }
      }
    }
    return out.sort((x, y) => y.expectedNetPct - x.expectedNetPct).slice(0, 50);
  }

  snapshot() { return this.last; }
}
// Strict no-loss math: depth-walked VWAP loop evaluation, gate check, conflict resolver.

export type DepthLevel = { price: number; size: number };
export type Book = { bids: DepthLevel[]; asks: DepthLevel[]; ts: number };

export type Leg = {
  exchange: string;
  base: string;
  quote: string;
  side: "buy" | "sell";
  feeBps: number;
};

export function walkBookForQuote(book: Book, side: "buy" | "sell", inputQuote: number) {
  const ladder = side === "buy" ? book.asks : book.bids;
  let remaining = inputQuote;
  let baseFilled = 0;
  let costQuote = 0;
  for (const lvl of ladder) {
    const lvlQuote = lvl.price * lvl.size;
    const take = Math.min(remaining, lvlQuote);
    const baseTake = take / lvl.price;
    baseFilled += baseTake;
    costQuote += take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return null;
  return { vwap: costQuote / baseFilled, baseFilled };
}

export type LegEval = { leg: Leg; vwap: number; filledBase: number; outQuote: number };

export function evaluateLoop(
  legs: Leg[],
  books: Record<string, Book>,
  startCapital: number,
  transferFees = 0,
): { endCapital: number; pct: number; perLeg: LegEval[] } | null {
  let capital = startCapital;
  const perLeg: LegEval[] = [];
  for (const leg of legs) {
    const book = books[`${leg.exchange}:${leg.base}-${leg.quote}`];
    if (!book) return null;
    const fee = leg.feeBps / 10_000;
    if (leg.side === "buy") {
      const w = walkBookForQuote(book, "buy", capital);
      if (!w) return null;
      const baseAfterFee = w.baseFilled * (1 - fee);
      perLeg.push({ leg, vwap: w.vwap, filledBase: w.baseFilled, outQuote: baseAfterFee });
      capital = baseAfterFee;
    } else {
      let remaining = capital;
      let baseFilled = 0;
      let outQuote = 0;
      for (const lvl of book.bids) {
        const take = Math.min(remaining, lvl.size);
        baseFilled += take;
        outQuote += take * lvl.price;
        remaining -= take;
        if (remaining <= 0) break;
      }
      if (remaining > 0) return null;
      const vwap = outQuote / baseFilled;
      const quoteAfterFee = outQuote * (1 - fee);
      perLeg.push({ leg, vwap, filledBase: baseFilled, outQuote: quoteAfterFee });
      capital = quoteAfterFee;
    }
  }
  const endCapital = capital - transferFees;
  const pct = ((endCapital - startCapital) / startCapital) * 100;
  return { endCapital, pct, perLeg };
}

export function passesGate(opts: { netPct: number; targetProfitPct: number; slippageBufferPct: number }) {
  return opts.netPct > opts.targetProfitPct + opts.slippageBufferPct;
}

export function legKey(leg: Leg) {
  return `${leg.exchange}:${leg.base}-${leg.quote}:${leg.side}`;
}

export type ScoredOpportunity = {
  id: string;
  legs: Leg[];
  expectedNetUsd: number;
  expectedNetPct: number;
  maxSizeUsd: number;
  staleness: number;
};

export function selectNonConflicting(candidates: ScoredOpportunity[], triggerCapitalUsd: number) {
  const sorted = candidates.slice().sort((a, b) =>
    b.expectedNetUsd - a.expectedNetUsd ||
    b.expectedNetPct - a.expectedNetPct ||
    a.legs.length - b.legs.length ||
    a.staleness - b.staleness,
  );
  const used = new Set<string>();
  const picked: ScoredOpportunity[] = [];
  const skipped: ScoredOpportunity[] = [];
  for (const o of sorted) {
    if (o.legs.some((l) => used.has(legKey(l)))) { skipped.push(o); continue; }
    picked.push(o);
    o.legs.forEach((l) => used.add(legKey(l)));
  }
  const total = picked.reduce((s, o) => s + Math.max(o.expectedNetUsd, 0), 0);
  const selected = picked.map((opp) => {
    const share = total > 0 ? Math.max(opp.expectedNetUsd, 0) / total : 1 / picked.length;
    return { opp, allocatedUsd: Math.min(opp.maxSizeUsd, triggerCapitalUsd * share) };
  }).filter((s) => s.allocatedUsd > 0);
  return { selected, skipped };
}
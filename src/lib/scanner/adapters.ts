// Public WebSocket adapters per venue (keyless). Each adapter pushes normalized
// Book updates to the engine. Venues without browser-friendly public WS fall back
// to a no-op adapter; the external Python executor handles them server-side.

import type { Book } from "@/lib/no-loss-math";

export type BookUpdate = { exchange: string; base: string; quote: string; book: Book };
export type Adapter = {
  exchange: string;
  subscribe(pairs: { base: string; quote: string }[], onUpdate: (u: BookUpdate) => void): () => void;
};

function safeWs(url: string): WebSocket | null {
  try { return new WebSocket(url); } catch { return null; }
}

function binance(): Adapter {
  return {
    exchange: "binance",
    subscribe(pairs, onUpdate) {
      const streams = pairs.map(({ base, quote }) => `${(base + quote).toLowerCase()}@depth10@100ms`);
      const ws = safeWs(`wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`);
      if (!ws) return () => {};
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          const symLower: string | undefined = msg?.stream?.split("@")[0];
          if (!symLower) return;
          const sym = symLower.toUpperCase();
          const pair = pairs.find((p) => sym === (p.base + p.quote));
          if (!pair) return;
          const d = msg.data;
          onUpdate({
            exchange: "binance",
            base: pair.base,
            quote: pair.quote,
            book: {
              bids: (d.bids ?? []).map((l: [string, string]) => ({ price: +l[0], size: +l[1] })),
              asks: (d.asks ?? []).map((l: [string, string]) => ({ price: +l[0], size: +l[1] })),
              ts: Date.now(),
            },
          });
        } catch {}
      };
      return () => ws.close();
    },
  };
}

function okx(): Adapter {
  return {
    exchange: "okx",
    subscribe(pairs, onUpdate) {
      const ws = safeWs("wss://ws.okx.com:8443/ws/v5/public");
      if (!ws) return () => {};
      ws.onopen = () => ws.send(JSON.stringify({
        op: "subscribe",
        args: pairs.map((p) => ({ channel: "books5", instId: `${p.base}-${p.quote}` })),
      }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (!msg?.arg?.instId || !msg.data?.[0]) return;
          const [base, quote] = String(msg.arg.instId).split("-");
          const d = msg.data[0];
          onUpdate({
            exchange: "okx", base, quote,
            book: {
              bids: (d.bids ?? []).map((l: string[]) => ({ price: +l[0], size: +l[1] })),
              asks: (d.asks ?? []).map((l: string[]) => ({ price: +l[0], size: +l[1] })),
              ts: Date.now(),
            },
          });
        } catch {}
      };
      return () => ws.close();
    },
  };
}

function coinbase(): Adapter {
  return {
    exchange: "coinbase",
    subscribe(pairs, onUpdate) {
      const ws = safeWs("wss://advanced-trade-ws.coinbase.com");
      if (!ws) return () => {};
      const product_ids = pairs.map((p) => `${p.base}-${p.quote}`);
      ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", channel: "level2", product_ids }));
      const local: Record<string, Book> = {};
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          for (const ev2 of msg.events ?? []) {
            const pid: string = ev2.product_id;
            if (!pid) continue;
            const [base, quote] = pid.split("-");
            const book = local[pid] ?? (local[pid] = { bids: [], asks: [], ts: Date.now() });
            for (const u of ev2.updates ?? []) {
              const side = u.side === "bid" ? "bids" : "asks";
              const px = +u.price_level; const sz = +u.new_quantity;
              const arr = book[side as "bids" | "asks"];
              const idx = arr.findIndex((l) => l.price === px);
              if (sz === 0 && idx >= 0) arr.splice(idx, 1);
              else if (idx >= 0) arr[idx].size = sz;
              else arr.push({ price: px, size: sz });
            }
            book.bids.sort((a, b) => b.price - a.price); book.bids = book.bids.slice(0, 10);
            book.asks.sort((a, b) => a.price - b.price); book.asks = book.asks.slice(0, 10);
            book.ts = Date.now();
            onUpdate({ exchange: "coinbase", base, quote, book });
          }
        } catch {}
      };
      return () => ws.close();
    },
  };
}

function kraken(): Adapter {
  return {
    exchange: "kraken",
    subscribe(pairs, onUpdate) {
      const ws = safeWs("wss://ws.kraken.com/v2");
      if (!ws) return () => {};
      ws.onopen = () => ws.send(JSON.stringify({
        method: "subscribe",
        params: { channel: "book", symbol: pairs.map((p) => `${p.base}/${p.quote}`), depth: 10 },
      }));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (msg.channel !== "book" || !msg.data) return;
          for (const d of msg.data) {
            const [base, quote] = String(d.symbol).split("/");
            onUpdate({
              exchange: "kraken", base, quote,
              book: {
                bids: (d.bids ?? []).map((l: { price: number; qty: number }) => ({ price: l.price, size: l.qty })),
                asks: (d.asks ?? []).map((l: { price: number; qty: number }) => ({ price: l.price, size: l.qty })),
                ts: Date.now(),
              },
            });
          }
        } catch {}
      };
      return () => ws.close();
    },
  };
}

export function makeAdapter(exchangeId: string): Adapter | null {
  switch (exchangeId) {
    case "binance": return binance();
    case "okx": return okx();
    case "coinbase": return coinbase();
    case "kraken": return kraken();
    default: return { exchange: exchangeId, subscribe: () => () => {} };
  }
}
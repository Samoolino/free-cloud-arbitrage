import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Radar, ShieldCheck, Zap, Layers, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArbDesk — Cross-exchange arbitrage" },
      { name: "description", content: "Live multi-exchange triangular and pentagonal arbitrage scanner with no-loss gating and multi-opportunity conflict resolution." },
      { property: "og:title", content: "ArbDesk — Cross-exchange arbitrage" },
      { property: "og:description", content: "Detect, rank, and execute non-overlapping arbitrage loops across 16 exchanges in real time." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/20 grid place-items-center">
              <Radar className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">ArbDesk</span>
          </div>
          <Link to="/auth"><Button size="sm">Sign in</Button></Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live order books across 16 exchanges
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
            Multi-exchange arbitrage,<br />
            <span className="text-muted-foreground">gated by no-loss math.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            ArbDesk streams keyless public WebSocket order books from Binance, OKX, Kraken,
            Coinbase, Bybit, KuCoin, Gate, MEXC, Bitget, HTX, Bitfinex, Crypto.com, LBank,
            bitFlyer, PointPay and CEX.io, enumerates triangular and pentagonal loops, and
            queues only the non-overlapping subset that passes a strict no-loss gate.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth">
              <Button size="lg">Start scanning <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </section>

        <section className="mt-24 grid md:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: "Browser-native scanner", body: "Public WebSockets stream directly to a Web Worker — no Python backend needed for detection." },
            { icon: ShieldCheck, title: "No-loss gate", body: "Every loop is walked through real depth with taker fees + transfer fees before it can be queued." },
            { icon: Layers, title: "Multi-opportunity resolver", body: "When several loops pass at once, the engine picks the maximum-value non-conflicting subset." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card/40 p-5">
              <f.icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-medium">{f.title}</div>
              <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Capital comes from your selected Trigger API balance. Paper-trading is the default.
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ScannerEngine, type EmittedOpportunity, type EngineConfig } from "@/lib/scanner/engine";

export function useScanner(cfg: EngineConfig, enabled: boolean) {
  const [opportunities, setOpportunities] = useState<EmittedOpportunity[]>([]);
  const [adapterStatus, setAdapterStatus] = useState<Record<string, boolean>>({});
  const [bookKeys, setBookKeys] = useState<Set<string>>(new Set());
  const engineRef = useRef<ScannerEngine | null>(null);
  const cfgKey = JSON.stringify(cfg);

  useEffect(() => {
    if (!enabled) return;
    const seen = new Set<string>();
    const engine = new ScannerEngine(cfg, {
      onOpportunity: (next) => setOpportunities(next),
      onBook: (k) => { seen.add(k); setBookKeys(new Set(seen)); },
      onAdapterStatus: (ex, ok) => setAdapterStatus((s) => ({ ...s, [ex]: ok })),
    });
    engineRef.current = engine;
    engine.start();
    return () => { engine.stop(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cfgKey]);

  const resolved = useMemo(
    () => engineRef.current?.resolve(opportunities) ?? { selected: [], skipped: [] },
    [opportunities],
  );

  return { opportunities, resolved, adapterStatus, bookKeys };
}
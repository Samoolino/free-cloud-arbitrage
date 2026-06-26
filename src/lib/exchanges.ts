// Exchange grid. Keyless public WS metadata + fee/network fallback defaults.

export type NetworkInfo = { code: string; fee: number; etaSec: number };

export type ExchangeMeta = {
  id: string;
  name: string;
  hasPublicWs: boolean;
  wsUrl?: string;
  restPollSymbolUrl?: string;
  takerFeeBps: number;
  symbolFormat: (base: string, quote: string) => string;
  networks: Record<string, NetworkInfo[]>;
};

const N = {
  SOL: { code: "SOL", fee: 0.0001, etaSec: 15 },
  TRC20: { code: "TRC20", fee: 1, etaSec: 30 },
  ARB: { code: "ARBITRUM", fee: 0.1, etaSec: 20 },
  BASE: { code: "BASE", fee: 0.1, etaSec: 20 },
  ERC20: { code: "ERC20", fee: 8, etaSec: 60 },
  BTC: { code: "BTC", fee: 0.0001, etaSec: 600 },
  XRP: { code: "XRP", fee: 0.1, etaSec: 5 },
};

const stable = [N.SOL, N.TRC20, N.ARB, N.BASE, N.ERC20];

export const EXCHANGE_GRID: ExchangeMeta[] = [
  { id: "binance", name: "Binance", hasPublicWs: true, wsUrl: "wss://stream.binance.com:9443/stream", takerFeeBps: 10, symbolFormat: (b, q) => `${b}${q}`.toLowerCase(), networks: { USDT: stable, USDC: stable, BTC: [N.BTC], ETH: [N.ERC20, N.ARB, N.BASE], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "okx", name: "OKX", hasPublicWs: true, wsUrl: "wss://ws.okx.com:8443/ws/v5/public", takerFeeBps: 10, symbolFormat: (b, q) => `${b}-${q}`, networks: { USDT: stable, USDC: stable, BTC: [N.BTC], ETH: [N.ERC20, N.ARB], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "kraken", name: "Kraken", hasPublicWs: true, wsUrl: "wss://ws.kraken.com/v2", takerFeeBps: 26, symbolFormat: (b, q) => `${b}/${q}`, networks: { USDT: [N.ERC20, N.TRC20], USDC: [N.ERC20, N.SOL], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "coinbase", name: "Coinbase", hasPublicWs: true, wsUrl: "wss://advanced-trade-ws.coinbase.com", takerFeeBps: 60, symbolFormat: (b, q) => `${b}-${q}`, networks: { USDT: [N.ERC20], USDC: [N.ERC20, N.SOL, N.BASE], BTC: [N.BTC], ETH: [N.ERC20, N.BASE], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "bybit", name: "Bybit", hasPublicWs: true, wsUrl: "wss://stream.bybit.com/v5/public/spot", takerFeeBps: 10, symbolFormat: (b, q) => `${b}${q}`, networks: { USDT: stable, USDC: stable, BTC: [N.BTC], ETH: [N.ERC20, N.ARB], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "kucoin", name: "KuCoin", hasPublicWs: true, takerFeeBps: 10, symbolFormat: (b, q) => `${b}-${q}`, networks: { USDT: stable, USDC: [N.ERC20, N.SOL], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "gateio", name: "Gate.io", hasPublicWs: true, wsUrl: "wss://api.gateio.ws/ws/v4/", takerFeeBps: 20, symbolFormat: (b, q) => `${b}_${q}`, networks: { USDT: stable, USDC: [N.ERC20, N.SOL], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "mexc", name: "MEXC", hasPublicWs: true, wsUrl: "wss://wbs.mexc.com/ws", takerFeeBps: 0, symbolFormat: (b, q) => `${b}${q}`, networks: { USDT: stable, USDC: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "bitget", name: "Bitget", hasPublicWs: true, wsUrl: "wss://ws.bitget.com/v2/ws/public", takerFeeBps: 10, symbolFormat: (b, q) => `${b}${q}`, networks: { USDT: stable, USDC: [N.ERC20, N.SOL], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "htx", name: "HTX", hasPublicWs: true, wsUrl: "wss://api.huobi.pro/ws", takerFeeBps: 20, symbolFormat: (b, q) => `${b}${q}`.toLowerCase(), networks: { USDT: [N.TRC20, N.ERC20], USDC: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "bitfinex", name: "Bitfinex", hasPublicWs: true, wsUrl: "wss://api-pub.bitfinex.com/ws/2", takerFeeBps: 20, symbolFormat: (b, q) => `t${b}${q}`, networks: { USDT: [N.ERC20, N.TRC20], USDC: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "cryptocom", name: "Crypto.com", hasPublicWs: true, wsUrl: "wss://stream.crypto.com/v2/market", takerFeeBps: 25, symbolFormat: (b, q) => `${b}_${q}`, networks: { USDT: [N.ERC20, N.TRC20], USDC: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20], SOL: [N.SOL], XRP: [N.XRP] } },
  { id: "lbank", name: "LBank", hasPublicWs: false, restPollSymbolUrl: "https://api.lbkex.com/v2/ticker.do", takerFeeBps: 10, symbolFormat: (b, q) => `${b}_${q}`.toLowerCase(), networks: { USDT: [N.TRC20, N.ERC20], BTC: [N.BTC], ETH: [N.ERC20] } },
  { id: "bitflyer", name: "bitFlyer", hasPublicWs: false, restPollSymbolUrl: "https://api.bitflyer.com/v1/ticker", takerFeeBps: 15, symbolFormat: (b, q) => `${b}_${q}`, networks: { BTC: [N.BTC], ETH: [N.ERC20] } },
  { id: "pointpay", name: "PointPay", hasPublicWs: false, restPollSymbolUrl: "https://api.pointpay.io/market/v1/ticker/24h", takerFeeBps: 25, symbolFormat: (b, q) => `${b}${q}`, networks: { USDT: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20] } },
  { id: "cex", name: "CEX.io", hasPublicWs: false, restPollSymbolUrl: "https://cex.io/api/ticker", takerFeeBps: 25, symbolFormat: (b, q) => `${b}/${q}`, networks: { USDT: [N.ERC20], BTC: [N.BTC], ETH: [N.ERC20] } },
];

export const EXCHANGE_BY_ID: Record<string, ExchangeMeta> = Object.fromEntries(EXCHANGE_GRID.map((e) => [e.id, e]));

export function pickBestNetwork(asset: string, from: string, to: string, timePenaltyPerSec = 0.0001): NetworkInfo | null {
  const a = EXCHANGE_BY_ID[from]?.networks[asset] ?? [];
  const b = EXCHANGE_BY_ID[to]?.networks[asset] ?? [];
  const inter = a.filter((n) => b.some((m) => m.code === n.code));
  if (!inter.length) return null;
  return inter.slice().sort((x, y) => (x.fee + x.etaSec * timePenaltyPerSec) - (y.fee + y.etaSec * timePenaltyPerSec))[0];
}
# Live CEX / DEX / network integrations

The bot uses an adapter model. Adding a venue is configuration plus an adapter capability check; credentials are injected at runtime and are never committed.

## CEX requirements

Each CEX needs:

- API key and secret with **trading only** permissions.
- Withdrawals disabled on the trading key.
- IP allow-list where supported.
- Spot markets enabled for the selected symbols.
- REST/WebSocket access for order books and private order/fill events.
- Fee tier known to the profitability engine.
- Account balance and open-order reconciliation.

Supported adapter targets in the registry:

- Binance
- Kraken
- OKX
- Bybit
- Coinbase
- KuCoin

CCXT may be used for common REST operations, while venue-native WebSockets should be preferred for low-latency market/private events when available.

## DEX requirements

Each DEX requires:

- chain RPC endpoint;
- wallet address;
- signer reference (never a plaintext private key in this repository);
- router/aggregator connectivity;
- token contract addresses/decimals;
- gas-price source;
- quote and transaction simulation;
- allowance/balance checks;
- slippage and minimum-output limits.

The initial Gateway targets are:

- Uniswap / Ethereum and compatible EVM networks
- PancakeSwap / BNB Smart Chain
- Jupiter / Solana

Additional DEX adapters can be added without changing the opportunity engine.

## Networks

The registry provides integration slots for Ethereum, Arbitrum, Base, Optimism, BSC, Polygon and Solana. A network is enabled only when its RPC and required adapter configuration are present.

## Cross-network policy

Do not treat a cross-chain price difference as immediately executable. The scanner must distinguish:

1. **same-chain atomic/near-atomic arbitrage** — preferred;
2. **pre-funded cross-chain arbitrage** — executable only when both destination inventories already exist;
3. **transfer-dependent arbitrage** — not executable as a latency-sensitive trade because bridge/transfer settlement can invalidate the quoted spread.

For every candidate, calculate executable depth, fees, gas, slippage, quote age and inventory availability on both legs.

## Credential onboarding

Example environment variables are intentionally names only. Put real values in the deployment secret manager or local untracked environment:

```text
BINANCE_API_KEY=
BINANCE_API_SECRET=
KRAKEN_API_KEY=
KRAKEN_API_SECRET=
OKX_API_KEY=
OKX_API_SECRET=
OKX_API_PASSWORD=
BYBIT_API_KEY=
BYBIT_API_SECRET=
COINBASE_API_KEY=
COINBASE_API_SECRET=
KUCOIN_API_KEY=
KUCOIN_API_SECRET=
KUCOIN_API_PASSWORD=
ETH_RPC_URL=
ARBITRUM_RPC_URL=
BASE_RPC_URL=
OPTIMISM_RPC_URL=
BSC_RPC_URL=
POLYGON_RPC_URL=
SOLANA_RPC_URL=
DEX_WALLET_ADDRESS=
SIGNER_KEY_REF=
```

Never paste a production private key or API secret into a GitHub issue, pull request, source file or Telegram command.

## Live activation

A venue must be explicitly enabled and pass startup checks before the scanner can use it. Startup checks should verify connectivity, clock drift, permissions, balances, market availability and fee configuration. Live execution remains subject to the global arm/risk gate.

# Live venue integration requirements

## CEX

The bot uses CCXT-compatible adapters for the requested centralized exchanges:

- MEXC
- Gate
- Binance
- Kraken
- OKX
- Bybit
- Coinbase
- KuCoin
- Bitfinex
- LBank

For each venue, configure API credentials through a secret manager/environment:

- `<PREFIX>_API_KEY`
- `<PREFIX>_API_SECRET`
- `<PREFIX>_PASSWORD` only when required by that venue

Create API keys with **trading only** permissions. Keep withdrawals disabled unless a separate, explicitly approved settlement service is used. Do not commit credentials.

Before enabling a venue, verify:

1. API authentication works.
2. Symbol mapping is correct.
3. Order-book depth is available.
4. Fees are loaded for the account/tier.
5. Minimum order size/precision is known.
6. Balance is sufficient on the required asset.
7. The venue supports the intended order type.
8. Sandbox/testnet support is used where available for integration testing.
9. Rate limits are respected.
10. Reconciliation can identify open, partial, filled, cancelled and rejected orders.

## DEX

DEX execution is chain-specific. The engine must know:

- chain/network ID;
- RPC endpoint;
- router/aggregator endpoint;
- token contract addresses and decimals;
- pool/router liquidity;
- gas price and gas estimate;
- slippage limit;
- allowance state;
- nonce management;
- transaction receipt/confirmation state;
- signer reference.

Initial Gateway-oriented integrations are Uniswap, PancakeSwap and SushiSwap on the networks declared in `venues.yaml`. More DEXs can be added without changing the capital-loop interface.

## Cross-network opportunities

A price difference on different networks is **not automatically executable arbitrage**. The scanner must account for bridge/transfer time and cost, inventory on both networks, bridge limits, confirmation latency and settlement risk. The preferred fast path is pre-funded inventory on both sides rather than moving assets during every trade.

## Opportunity assertion

A candidate can become `EXECUTABLE_NOW` only if:

`expected sell proceeds - buy cost - CEX fees - DEX fees - gas - slippage - bridge/settlement costs - safety reserve > minimum profit`

and:

- quotes are fresh;
- executable depth covers the requested size;
- balances are confirmed;
- both legs are executable;
- venue health is acceptable;
- no risk lock is active.

A displayed ticker spread alone is never sufficient.

## Secret architecture

```text
CEX API key/secret ─┐
                    ├─> Secret Manager ─> venue adapter
DEX signer ref ─────┘

scanner ─> risk gate ─> execution adapter ─> reconciliation
```

Raw private keys, seed phrases and exchange secrets must never be placed in Git, Telegram commands, logs or database rows.

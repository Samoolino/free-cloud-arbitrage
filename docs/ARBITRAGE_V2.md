# Free Cloud Arbitrage V2

## Objective

Turn the existing CCXT worker into a venue-neutral arbitrage system with a Hummingbot execution boundary, CEX/DEX market discovery, Telegram operations, and a conservative profitability gate.

## Important risk model

There is no mathematically guaranteed "no-loss" arbitrage in live markets. Quotes move, orders partially fill, networks fail, withdrawals can pause, and latency can erase an edge. The implementation therefore uses **NO_LOSS_MODE** as a policy name for *do-not-execute unless modeled net profit clears a safety reserve*. It is not a guarantee of zero losses.

## Execution architecture

1. Market-data adapters: CEX WebSocket/REST and DEX RPC/aggregator quotes.
2. Normalizer: convert all venues into bid/ask/depth/fee/latency records.
3. Opportunity engine: evaluate both directions for every symbol.
4. Risk gate: subtract trading fees, estimated slippage, gas, transfer costs and safety reserve.
5. Execution engine: Hummingbot adapter or CCXT adapter.
6. Runtime guard: disarmed on restart; heartbeat timeout blocks new orders.
7. Telegram: status/arm/disarm/dry/stop. Only an allow-listed chat may control it.
8. Supervisor: systemd restarts crashed processes; state remains fail-closed.

## Capital model

For CEX/CEX arbitrage, keep inventory pre-funded on both venues. Do not depend on transferring assets between venues during the arbitrage transaction. Rebalance later. This removes a large source of timing risk.

For DEX/CEX, use a dedicated execution wallet or contract with only the required balance. Never put a seed phrase/private key in Git, Telegram, Supabase, logs, or dashboard configuration.

## Wallet policy

The bot may use a signer, but private keys should live outside source control in a secret manager or isolated signer. For production, prefer a dedicated hot wallet with a small balance or an HSM/remote signer. Disable withdrawal permissions on CEX API keys.

## Minimum execution checks

- quote age <= QUOTE_MAX_AGE_MS
- estimated net PnL > MIN_NET_PROFIT_USD + SAFETY_RESERVE_USD
- slippage <= MAX_SLIPPAGE_BPS
- sufficient balances on both legs
- venue status healthy
- expected fill size available in top-of-book/depth
- both legs accepted or a defined hedge/rollback procedure is available
- runtime guard is armed and heartbeat is fresh
- kill switch is immediately available

## Telegram commands

`/status` shows state; `/arm` enables live eligibility; `/disarm` blocks new orders; `/dry` forces dry-run and disarms; `/stop` requests shutdown; `/help` lists commands.

## Non-downtime

Run the worker under systemd with `Restart=always`, and run Hummingbot separately under its own supervisor. This gives process recovery rather than pretending that a single process can never fail.

## Rollout

1. Dry-run only.
2. Replay historical/live market data without orders.
3. Testnet/sandbox where the venue supports it.
4. Small production notional with withdrawal-disabled API keys.
5. Increase limits only after measured fill quality and realized PnL agree with modeled PnL.

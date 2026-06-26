
# Arbitrage Scanner + Control Plane — Lovable-Native

## What changes vs the previous plan

Part B (Python execution engine) stays as a **downloadable repo** because Cloudflare Workers cannot run `ccxt.pro` withdrawal pollers or 24/7 asyncio loops. But every *observable* function of Part B is folded into Part A so the Lovable app is fully usable on its own:

- Real-time scanners run **in the browser** over public WebSockets (no keys).
- The full no-loss math, Trigger-API gate, multi-opportunity ranking, transfer-route picker, paper-trading, and session-target logic run **in the Lovable app**.
- The external Python bot is only the thin "press the button at the exchange" layer for live withdrawals + signed order broadcast. When in paper mode, the Lovable app simulates fills end-to-end and no bot is needed.

## Part A scope (everything below ships in Lovable)

### Auth (Lovable Cloud)
- Email + password, Google, Apple
- `profiles`, `user_roles` + `has_role()`, first signup → `admin`
- All tables RLS-scoped to `auth.uid()`

### Exchange matrix (UI + scanner config)
Binance, OKX, Kraken, Bybit, Coinbase, KuCoin, Gate.io, MEXC, Bitget, HTX, Bitfinex, Crypto.com, **LBank, bitFlyer, PointPay, CEX.io**.

For each: ccxt id, public WS URL, supported deposit networks, taker fee fallback, min withdrawal per asset/network. Stored in a code-side `EXCHANGE_GRID` constant + a `exchanges` config table for user-overridable fees.

### Browser-side real-time scanner (the core feature)

A long-lived `ScannerWorker` (Web Worker) running in every signed-in tab:

1. **Layer A — REST sweep (CoinGecko Demo)**: every 30 s, sweep `/coins/{id}/tickers` for tracked assets (BTC, ETH, SOL, XRP, USDT, USDC and any user-added) across all enabled venues. Filter `is_anomaly` and `is_stale`. Build the cross-exchange ticker map.
2. **Layer B — Public WebSockets**: open keyless public order-book streams to **Binance**, **OKX**, **Bybit**, **KuCoin**, **Gate.io**, **MEXC**, **Bitget**, **HTX**, **Coinbase**, **Kraken**, **Crypto.com**, **Hyperliquid**, plus REST-poll fallbacks for venues without public WS (bitFlyer, LBank, PointPay, CEX.io). Maintain a top-N depth book per symbol in memory.
3. **Layer C (auto-switch)**: if `COINGECKO_PLAN=PRO` (stored in `bot_config`), Layer A swaps to CoinGecko Webhooks/WS posted to `/api/public/scanner/coingecko` and Layer B is downgraded to a hot-pair watchlist only.

The worker emits opportunities to the UI via `BroadcastChannel` and persists them to Supabase `opportunities` (Realtime → other tabs/devices).

### Opportunity engine (runs in the worker)

For every enabled strategy (triangular, pentagonal), enumerate loops over the live book on a debounced tick (e.g. every 250 ms per affected symbol). For each candidate loop:

- Walk real depth per leg → volume-weighted executable price (not top-of-book).
- Pull `TradingFee` per leg from the exchange config (taker).
- Add `OnChainTransferFees` if legs span venues (picked by transfer router below).
- Apply the strict no-loss inequality:

  `Π(rate_n) · Π(1 − fee_n) − transferFees > capital · (1 + (targetProfitPct + slippageBuffer)/100)`

- Compute `maxExecutableSize` = min over legs of (depth available, withdrawal limit, Trigger-API free balance).
- Compute `expectedNetUsd` and `expectedNetPct`.
- Tag `gatePassed: true/false` and `reason` on fail (e.g. "depth too thin on leg 3").

### Multi-opportunity handling (your specific ask)

When several candidates pass the gate at the same tick, the engine ranks and arbitrates:

1. **Rank by `expectedNetUsd` desc**, tiebreak by `expectedNetPct`, then by lowest leg-count, then by lowest total latency (sum of WS staleness per leg).
2. **Conflict graph**: two opportunities conflict if they share a leg symbol on the same exchange *and* would consume overlapping depth, OR if both require the Trigger-API free balance and the sum exceeds it. The engine selects the maximum-value non-conflicting subset (greedy: take top-ranked, mark its legs as committed, take next non-conflicting, repeat).
3. **Capital allocation**: Trigger-API free USDT/USDC is split across the selected non-conflicting set proportionally to `expectedNetUsd`, capped per opportunity by `maxExecutableSize`.
4. **Atomic queueing**: each selected opportunity gets a single `trade_intents` row with `status=queued`, a `lock_token`, and a `ttl_ms` (default 800 ms). A Postgres advisory lock per (exchange, symbol) prevents two tabs/devices from queuing the same leg twice.
5. **Stale-guard**: just before broadcast, the engine re-walks depth from the latest WS snapshot. If `expectedNetPct` has fallen below threshold, the intent is **aborted** and logged to `system_events` (`reason=stale_book`).

The UI's Opportunities table shows: rank, loop path, legs, gross %, fees, transfer, net %, net USD, max size, gate status, and "would execute now?" badge.

### Trigger API + capital model
- User selects one enabled exchange as **Trigger API**.
- Every 10 s the app polls balances for all enabled exchanges (signed server function using the user's stored encrypted keys) and writes `balances_snapshot`.
- The bot considers "capital" = `free(USDT) + free(USDC)` on the Trigger API. There is **no manual capital input**.
- If `free(Trigger) < min_trigger_balance_usd` OR there are open orders consuming it → `session.status = lockout`, all execution intents blocked, dashboard shows red lockout banner. Auto-clears the next tick balance ≥ threshold.

### Sessions + Target Amount as endpoint
- `POST startSession({ targetAmountUsd })` creates a `sessions` row with `realized_pnl_usd=0`, `status=running`.
- Scanner + executor run continuously. After every confirmed trade, `realized_pnl_usd` increments.
- When `realized_pnl_usd >= targetAmountUsd`: `status=target_reached`, executor stops queuing new intents, scanner keeps running (display only), UI shows "Target hit" celebration + summary.
- `stopSession()` manual halt → `status=stopped`.

### Cross-exchange transfer router (in-app)
For any inter-exchange loop:
- Read source venue's supported withdrawal networks for the asset + destination's supported deposit networks.
- Intersect, score by `(networkFee + estimatedTimeSeconds * timePenalty)` ascending.
- Default penalty favors Solana / Arbitrum / TRC-20 / Base over ERC-20.
- The chosen network + fee feed back into the no-loss math *before* gate check.
- Live mode: the executor (Python bot) performs the withdrawal; the app spins a `transfers` row with `status=pending` and polls destination deposit status via signed server function until `confirmed`. Destination-leg execution is **frozen** until then.
- Paper mode: app simulates a configurable confirmation delay and proceeds.

### Paper vs live
- `bot_config.paper_trading = true` (default) → app simulates fills against the live book it already has, writes `trades` rows with simulated fills/fees, increments session PnL. No external bot needed.
- `false` → executor needs the Python bot online and heart-beating; if no heartbeat in 15 s, app auto-falls-back to paper + logs `system_events`.

### Circuit breaker
- WS staleness > 500 ms (configurable) on any leg → opportunity disqualified.
- Three breaker trips in 60 s → session auto-pauses for 60 s (`status=cooldown`), logged.

### Pages
- `/` landing (public)
- `/auth` sign-in (email, Google, Apple)
- `/_authenticated/dashboard` — Trigger-API gauge, session progress vs target, live PnL, last 10 trades, lockout/cooldown banners
- `/_authenticated/scanner` — live opportunities table (sortable, filter by strategy/exchange/gate), depth visualizer per selected loop
- `/_authenticated/strategy` — target amount, target profit %, slippage buffer, paper toggle, circuit-breaker ms, triangular/pentagonal toggles, conflict-resolution mode (greedy / single-best)
- `/_authenticated/exchanges` — credentials, enable/disable, set Trigger, test-connection, min balance, per-asset network preferences
- `/_authenticated/trades`, `/_authenticated/transfers`, `/_authenticated/sessions`, `/_authenticated/logs`
- `/_authenticated/bot` — generates `BOT_SHARED_SECRET`, shows the signed endpoint URLs, download `bot.zip` for the Python executor

### Tables (public schema, GRANTs + RLS)
`profiles`, `user_roles`, `exchange_credentials` (server-only column read), `bot_config`, `sessions`, `opportunities`, `trade_intents`, `trades`, `transfers`, `balances_snapshot`, `system_events`.

### Server functions
`getBotConfig` / `updateBotConfig`, `listExchangeCredentials` / `upsertExchangeCredential` / `deleteExchangeCredential` / `testExchangeConnection`, `pollAllBalances` (cron-style, called from worker on a 10 s interval), `startSession` / `stopSession` / `getActiveSession`, `queueIntent`, `cancelIntent`, `recordPaperFill`, `rotateBotSecret`.

### Public signed endpoints (`/api/public/bot/*`) for the external executor
HMAC-signed with `BOT_SHARED_SECRET`:
- `GET /config` `/session` — pulls config, creds, active target
- `POST /heartbeat` `/balances` `/trade` `/transfer` `/event` — bot pushes state
- `GET /intents/next` `POST /intents/:id/ack` `/intents/:id/result` — bot pulls queued intents and reports fills

### Realtime
Supabase Realtime channels on `opportunities`, `trade_intents`, `trades`, `transfers`, `system_events`, `balances_snapshot` filtered by `user_id`.

## Part B — Python executor (downloadable bundle)

Generated as `bot.zip` (artifact in `/_authenticated/bot`):
- `Dockerfile` (python:3.11-slim, $PORT health), `render.yaml`, `requirements.txt` (ccxt, ccxt.pro, aiohttp, websockets)
- Thin loop: pull intents from `/api/public/bot/intents/next`, ccxt parallel-broadcast legs, post `/result`. Handle withdrawals + deposit confirms. No scanner logic — Lovable owns that.
- Env: `APP_BASE_URL`, `BOT_SHARED_SECRET`, per-exchange API keys.

## Build order
1. Cloud + auth (email/Google/Apple) + RLS scaffold
2. Migrations for all tables + GRANTs
3. Exchanges page + credentials + Trigger selection
4. Strategy + sessions pages
5. Scanner Web Worker: public WS adapters per venue + REST-poll fallbacks + CoinGecko Layer A
6. Opportunity engine + multi-opportunity conflict resolver + no-loss gate + transfer router
7. Dashboard + Scanner UI + Trades/Transfers/Logs pages
8. Paper executor (in-app) + session target stop
9. `/api/public/bot/*` signed endpoints + `/bot` page + downloadable `bot.zip`
10. Circuit breaker, lockout banners, Realtime polish

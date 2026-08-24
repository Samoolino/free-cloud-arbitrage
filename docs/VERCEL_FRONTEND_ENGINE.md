# Vercel frontend ↔ live arbitrage engine

## Deployment boundary

Vercel should host the dashboard/control plane and short-lived API endpoints. The long-running arbitrage worker, Hummingbot process, websocket market-data loops, Telegram bot and signer service must run on a persistent worker host/container (or equivalent durable compute), not inside a normal Vercel request function.

## Environment variables

### Safe for browser exposure (`VITE_`)
Only non-secret configuration belongs here, for example:

- `VITE_ENGINE_API_URL`
- `VITE_ENGINE_WS_URL` (if a public authenticated gateway is provided)
- `VITE_APP_ENV`

### Server-only secrets
Never prefix these with `VITE_`:

- exchange API keys/secrets;
- Hummingbot credentials;
- Telegram bot token;
- Supabase service-role key;
- RPC provider secrets;
- wallet private keys/seed phrases;
- signer credentials.

These must be configured as Vercel environment variables only when a server-side route genuinely needs them. Prefer keeping trading secrets on the engine/signer host and having Vercel call an authenticated control API.

## Control API contract

The frontend should call a small authenticated control gateway rather than talking directly to exchange APIs or signing wallets.

Recommended endpoints:

- `GET /api/engine/status`
- `GET /api/opportunities`
- `POST /api/engine/arm`
- `POST /api/engine/disarm`
- `POST /api/engine/dry-run`
- `POST /api/engine/stop`
- `POST /api/engine/target`

The gateway should authenticate the user, authorize the action, write an audit event, then call the engine control service.

## Live-test stages

1. Vercel preview + engine dry-run.
2. Live market data, no order submission.
3. Tiny notional canary on one CEX pair after venue authentication/reconciliation tests.
4. DEX canary only after RPC, gas, allowance, nonce and receipt tests.
5. Enable additional venues individually.
6. Enable target-based capital rotation after reconciliation is proven.

## Health requirements

Expose status fields for:

- engine armed/disarmed;
- scanner heartbeat;
- venue connectivity;
- quote age;
- last opportunity;
- capital available/reserved;
- open orders;
- unsettled trades;
- realized PnL;
- target progress;
- risk lock reason.

## Important

A Vercel deployment is not itself proof that live trading is working. Production readiness requires a persistent engine deployment, successful health checks, authenticated control flow, live market-data validation, order reconciliation and an explicit risk gate before any live order is submitted.

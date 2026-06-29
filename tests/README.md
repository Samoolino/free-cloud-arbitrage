# Bot API integration tests

Run with `bun test tests/`. Tests cover:

- HMAC verifier: well-formed signatures pass, tampered payload/headers/secret
  fail, stale timestamps are rejected.
- Sign-and-call helper that matches the Python worker reference exactly.
- End-to-end flow via the route handlers (`config`, `intents`, `fills`,
  `events`) with an in-memory Supabase admin stub.

No live DB / network is required — the supabase admin client is mocked via
`mock.module()` before the route files are imported.

## Env

`BOT_SHARED_SECRET=test-secret bun test`
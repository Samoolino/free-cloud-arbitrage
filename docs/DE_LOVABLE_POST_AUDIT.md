# De-Lovable Migration — Post-Audit / QA Status

**Repository:** `Samoolino/free-cloud-arbitrage`

**Migration branch:** `de-lovable-migration`

**Baseline:** `c3e4bceb108cae62a710d748fb49aa2c4489b171`

**Audit mode:** static/source-level post-audit

## Executed changes

- Removed `@lovable.dev/cloud-auth-js` from `package.json`.
- Removed `@lovable.dev/mcp-js` from `package.json`.
- Removed `@lovable.dev/vite-tanstack-config` from `package.json`.
- Replaced the Lovable Vite wrapper with native Vite + TanStack Start + Nitro + React + Tailwind configuration.
- Replaced Lovable OAuth calls with direct Supabase OAuth calls.
- Replaced `window.__lovableEvents` error reporting with a vendor-neutral application error reporter.
- Removed the Lovable integration adapter.
- Removed Lovable-specific error reporting.
- Removed Lovable repository agent instructions.
- Removed `.lovable/plan.md` and `.lovable/project.json` metadata.
- Removed the stale npm and Bun lockfiles so they cannot continue to pin the removed Lovable dependency graph.
- Removed Lovable-only Bun install exemptions.

## Capability equivalence review

| Capability | Replacement | Static QA |
|---|---|---|
| Email/password auth | Existing direct Supabase auth | PASS |
| Google OAuth | `supabase.auth.signInWithOAuth({ provider: "google" })` | PASS — implementation present |
| Apple OAuth | `supabase.auth.signInWithOAuth({ provider: "apple" })` | PASS — implementation present |
| Session persistence | Existing Supabase client/session handling | PASS |
| Server bearer authentication | Existing Supabase auth middleware | PASS — retained |
| TanStack Start build | Native `tanstackStart()` Vite plugin | PASS — implementation present |
| Nitro integration | Native `nitro()` Vite plugin | PASS — implementation present |
| React build | Native `@vitejs/plugin-react` | PASS — implementation present |
| Tailwind build | Native `@tailwindcss/vite` | PASS — implementation present |
| Error boundary telemetry | Vendor-neutral `reportAppError()` | PASS — implementation present |
| MCP | No source-level use of the Lovable MCP package was identified in the inspected application paths | REQUIRES RUNTIME/INTEGRATION CONFIRMATION |
| Arbitrage Python worker | Untouched by the migration | PRESERVED |
| Supabase data layer | Untouched as the core backend/data service | PRESERVED |
| GitHub integration | Untouched | PRESERVED |

## Lockfile status

Both `package-lock.json` and `bun.lock` were deliberately removed because they contained the pre-migration dependency graph. A fresh lockfile must be generated with the selected package manager before a production build is treated as reproducible.

This is intentional and is a **QA HOLD**, not a claim that runtime validation has passed.

## Runtime validation status

The repository connector can modify and inspect GitHub source but does not provide a local Node/Bun execution environment in this workflow. Therefore the following tests have **not** been falsely marked as passed:

- dependency installation
- TypeScript compilation
- ESLint
- Vite production build
- SSR runtime smoke test
- OAuth end-to-end test
- Supabase authenticated-route test
- Python worker test suite
- arbitrage-engine integration test
- MCP end-to-end test

## Required final QA commands

Run with the chosen package manager after checkout:

```text
bun install
bun run lint
bun run build
```

Then execute the existing Python worker test suite and application smoke tests.

## Acceptance rule

The migration is **SOURCE-LEVEL PASS / RUNTIME QA HOLD** until the fresh dependency lockfile is generated and the build, authentication, backend, worker, and integration tests pass.

The `main` branch has not been modified by this migration.

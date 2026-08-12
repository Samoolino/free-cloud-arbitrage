# De-Lovable Migration — Pre-Audit Baseline

**Repository:** `Samoolino/free-cloud-arbitrage`

**Baseline commit:** `c3e4bceb108cae62a710d748fb49aa2c4489b171`

**Migration branch:** `de-lovable-migration`

**Audit status:** PRE-AUDIT / NO FUNCTIONAL MIGRATION YET

## Objective

Decouple the application from Lovable-specific runtime, build, authentication, telemetry, and MCP adapters while preserving the application's existing functional capabilities.

## Baseline observations

1. `package.json` contains Lovable packages:
   - `@lovable.dev/cloud-auth-js`
   - `@lovable.dev/mcp-js`
   - `@lovable.dev/vite-tanstack-config`
2. `vite.config.ts` imports `defineConfig` from `@lovable.dev/vite-tanstack-config` and relies on that wrapper for TanStack Start/Vite/Nitro-related configuration.
3. `src/routes/auth.tsx` uses Supabase directly for email/password authentication but delegates Google/Apple OAuth to the Lovable auth adapter.
4. `src/integrations/lovable/index.ts` creates the Lovable OAuth adapter and then places returned tokens into a Supabase session.
5. `src/lib/lovable-error-reporting.ts` sends error events through `window.__lovableEvents`.
6. `src/routes/__root.tsx` calls the Lovable error reporter from the root error boundary.
7. Supabase is already a direct application dependency and is therefore a candidate for retention as the underlying data/auth service.
8. `src/integrations/supabase/auth-middleware.ts` already validates Supabase bearer tokens server-side, reducing the amount of authentication architecture that must change.
9. The repository contains a Python worker and worker resilience tests; these are part of the functional regression surface and must remain operational.
10. Both `bun.lock` and `package-lock.json` exist and should be normalized intentionally rather than incidentally during dependency removal.

## Required replacement map

| Current capability | Current implementation | Required independent replacement |
|---|---|---|
| OAuth | Lovable Cloud Auth → Supabase session | Direct Supabase OAuth |
| Build/config | Lovable Vite/TanStack wrapper | Native Vite + TanStack Start configuration |
| Error telemetry | `window.__lovableEvents` | Vendor-neutral structured error reporting |
| MCP | `@lovable.dev/mcp-js` | Preserve protocol capability through independent implementation or remove only if proven unused |
| Environment assumptions | Lovable Cloud wording/runtime assumptions | Explicit platform-neutral environment configuration |

## Functional preservation gate

The migration is not considered successful merely because the project builds. The following must be revalidated after migration:

- application startup and production build
- routing and SSR
- email/password authentication
- OAuth authentication
- session persistence and protected routes
- Supabase data access and server-side authorization
- GitHub webhook/synchronization functionality
- dashboard/operations/bot/sync routes
- market-data ingestion
- arbitrage opportunity calculations and gating
- execution path
- Python worker resilience
- required MCP functionality

## Change-control rules

- `main` remains untouched by this migration branch.
- The baseline commit above is the rollback reference.
- Lovable dependencies must not be removed until their supplied capabilities have been replaced and tested.
- No secrets are to be copied into this audit or committed to the repository.
- Any missing or ambiguous capability discovered during implementation must be recorded rather than silently removed.

## Post-audit requirement

A post-audit document must be added after implementation with a capability-by-capability comparison against this baseline and explicit PASS/FAIL/REQUIRES-FOLLOW-UP results.

# Supabase authentication and OAuth 404 checklist

The application already has a `/auth` route and uses Supabase Auth for email/password plus Google and Apple OAuth.

## Required Supabase URL configuration

Set these in the deployed frontend/runtime:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-side routes also need:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Do not place a Supabase secret/service-role key in browser code.

## Supabase Auth URL configuration

In Supabase Authentication > URL Configuration:

1. Set the Site URL to the real deployed application origin.
2. Add the deployed `/auth` callback URL to Additional Redirect URLs.
3. Add the local development `/auth` URL when testing locally.
4. Add every exact production hostname used by the deployment (including the canonical hostname if a custom domain redirects to it).

The application requests `${window.location.origin}/auth` for both Google and Apple, so the exact origin must be allowed by Supabase.

## Provider configuration

### Email/password

Enable Email provider. Configure confirmation behavior consistently with the application. If confirmation is enabled, the confirmation email must redirect to the allowed `/auth` callback.

### Google

Enable Google provider in Supabase and configure Google's OAuth client with the Supabase callback URL shown by the Supabase dashboard. The application's `redirectTo` is the application `/auth` route; Supabase completes the provider callback before returning the browser to that URL.

### Apple

Enable Apple provider in Supabase and configure Apple's Service ID/key settings with the callback values supplied by Supabase. Ensure the production application origin is allowed by Supabase Redirect URLs.

## 404 diagnosis

If OAuth succeeds at the provider but the browser returns 404:

- inspect the final URL and confirm it ends at `/auth` rather than an unregistered route;
- confirm the deployment serves the TanStack Start route `/auth` on direct navigation;
- confirm the deployment's SPA/SSR fallback is configured correctly;
- confirm the exact hostname is listed in Supabase Redirect URLs;
- confirm no proxy/rewrite strips `/auth`;
- confirm the app was deployed from the same commit containing `src/routes/auth.tsx`.

If Supabase itself returns an error before redirecting back, check the provider configuration and Supabase redirect allow-list first.

## Live-arbitrage separation

Authentication must not be removed merely to make the trading engine run. The trading worker should be able to run headlessly under systemd with its own service credentials while the web dashboard remains authenticated.

For live testing, prefer:

- authenticated dashboard;
- Telegram operator allow-list;
- separate trading-service credentials;
- dry-run/armed state controls;
- no private keys in source control.

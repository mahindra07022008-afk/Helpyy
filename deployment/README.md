# Helpyy deployment

Production: https://helpyy.mahindra07022008.workers.dev/

The original React pages and CSS are retained. Cloudflare serves the built frontend and the API in `deployment/worker.mjs`. Supabase supplies email authentication and PostgreSQL through its REST API. The Worker uses the public publishable key and the caller's access token; it never uses a service-role key. The original Express/Clerk source is retained for reference, but is not the deployed backend.

## Build and deploy

Use Node 24 and the pinned pnpm version from package.json.

1. `pnpm install --frozen-lockfile`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the build environment (or `artifacts/helpay/.env.production.local`, which is ignored).
3. `pnpm run build:production`
4. `pnpm test` and `pnpm audit`
5. Set deployment-only environment variables from `.env.example`, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
6. `node deployment/deploy.mjs`

Do not use the root generic build command for Cloudflare: it also builds unrelated original workspace artifacts. The deployed application uses `build:production`.

`schema.sql` records the additive database migration already applied to helpay-v2. Do not reapply it to a populated project. Existing tables and data were not replaced. Coupon codes are in a separate RLS-protected table; public listings never include codes. Prices are enforced in the database. New payments, payouts, and payment approvals are always denied. Zero dashboard earnings reflect the absence of a payment ledger in this deployment; no transactions are simulated or migrated.

## Required authentication follow-up

In the helpay-v2 Supabase project, Authentication > URL Configuration, set Site URL to the live URL above and allow that origin as a redirect. Dashboard sign-in is required; the connected tools do not expose this setting. Keep email confirmation enabled. Verify one real sign-up, email delivery, confirmation link, then sign-in. Social providers are not configured; this deployment uses email/password. Existing Replit/Clerk accounts are not migrated.

## Operational limits

Coupon browse and seller views are currently limited to the newest 100 results. Search runs over that bounded public result set. Real payment and payout setup, custom domains, and existing Replit data/account migration are outside this deployment. No subscription or domain purchase was made.

# OfferPay V2 deployment

Current production (unchanged): https://helpyy.mahindra07022008.workers.dev/

The OfferPay React pages and CSS are served by the existing `helpyy` Cloudflare Worker along with the API in `deployment/worker.mjs`. Supabase supplies email authentication and PostgreSQL through its REST API. The Worker uses the public publishable key and the caller's access token; it never uses a service-role key. The original Express/Clerk source is retained for reference, but is not the deployed backend.

## Build and deploy

Use Node 24 and the pinned pnpm version from package.json.

1. `pnpm install --frozen-lockfile`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the build environment (or `artifacts/helpay/.env.production.local`, which is ignored).
3. `pnpm run build:production`
4. `pnpm test` and `pnpm audit`
5. Set deployment-only environment variables from `.env.example`, plus `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
6. `node deployment/deploy.mjs`

Do not use the root generic build command for Cloudflare: it also builds unrelated original workspace artifacts. The deployed application uses `build:production`.

`schema.sql` records the additive database migration already applied to helpay-v2. Do not reapply it to a populated project. Existing tables and data were not replaced. Coupon codes are in a separate RLS-protected table; public listings never include codes. Prices are enforced in the database. New payments, payouts, and payment approvals are always denied. Zero dashboard earnings reflect the absence of a payment ledger in this deployment; no transactions are simulated or migrated. No new database migration has been prepared or applied for OfferPay V2. Any further database work requires a fresh, verified backup and inspection of the live schema first.

## Required authentication follow-up

In the helpay-v2 Supabase project, Authentication > URL Configuration, keep the current live URL as the Site URL until the customer domain is configured and verified. Add the final customer origin and the `/dashboard` and `/reset-password` callback URLs to the allow-list before using those flows on the custom domain. Dashboard sign-in is required; the connected tools do not expose this setting. Keep email confirmation enabled. Verify sign-up, email delivery, confirmation link, password recovery, then sign-in. Social providers are not configured; this deployment uses email/password. Existing Replit/Clerk accounts are not migrated.

## Operational limits

Coupon browse and seller views are currently limited to the newest 100 results. Search runs over that bounded public result set. Real payment and payout setup, the customer/admin custom domains, server-verified administrator roles, admin dashboard, and existing Replit data/account migration are not enabled. Do not attach `admin.offerpay.net.in` or deploy until the authorization and access-control tests pass. No subscription or domain purchase was made.

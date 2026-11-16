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

If the asset-upload step returns 401 because a proxy or CI system rewrites the `Authorization` header, run `INLINE_ASSETS=1 node deployment/deploy.mjs` instead. It bundles the built site into the Worker and deploys in a single API call; the site behaves the same. The current production deployment was made this way.

Do not use the root generic build command for Cloudflare: it also builds unrelated original workspace artifacts. The deployed application uses `build:production`.

Database migrations live in `deployment/migrations/` and are applied in order with the Supabase SQL editor (or the Management API). `001_initial_schema.sql` is already applied to helpay-v2; do not reapply it. `002_withdraw_listing.sql` (seller can withdraw their own listing) is additive, idempotent, and must be applied **before** deploying a Worker that includes the withdraw endpoint; until it is, Withdraw returns an error and nothing else is affected. Its rollback statements are at the bottom of the file. Existing tables and data were not replaced. Coupon codes are in a separate RLS-protected table; public listings never include codes. Prices are enforced in the database.

## Payments (manual UPI, no gateway)

Set `UPI_ID` at deploy time to switch payments on; without it every payment and payout request is refused. The flow is the original one:

1. The buyer pays the listed price to the published UPI ID in their own UPI app (approved there with their UPI PIN; the site never sees a PIN or bank details) and submits the transaction reference. The listing is reserved.
2. A reviewer opens `/admin`, checks in their own UPI/bank app that a payment with that reference and amount really arrived, then marks it verified or rejected. Nothing is treated as paid before that.
3. Verified: the buyer sees the coupon code under My account and the seller's earnings become claimable. Rejected: the listing returns to the marketplace.
4. The seller requests a payout to their UPI ID; the reviewer sends the money by UPI and marks the request paid.

Reviewers are the confirmed accounts whose email is in `private.helpyy_admins` (add with `insert into private.helpyy_admins(email) values ('you@example.com');`). All payment rules live in database functions in `003_upi_payments.sql`; the two payment tables have no direct client access. The QR image shown at checkout is `attached_assets/WhatsApp_Image_…jpeg` and must belong to the same UPI ID.

Limits to know: verification is manual, so codes are not instant; refunds are sent by hand from the reviewer's UPI app; a personal UPI ID may be subject to the bank's limits on commercial collections.

## Required authentication follow-up

In the helpay-v2 Supabase project, Authentication > URL Configuration, set Site URL to the live URL above and add `<live URL>/**` to Redirect URLs (sign-up confirmation returns to `/dashboard`, password reset returns to `/reset-password`). Repeat for a custom domain when one is attached. Dashboard sign-in is required; the connected tools do not expose this setting. Keep email confirmation enabled. Verify one real sign-up, email delivery, confirmation link, then sign-in. Social providers are not configured; this deployment uses email/password. Existing Replit/Clerk accounts are not migrated.

## Operational limits

Coupon browse and seller views return the newest 100 matching results. Search (title or brand) and the brand filter run in the database. Custom domains and existing Replit data/account migration are outside this deployment. No subscription or domain purchase was made.

## Backup and rollback

- Code: every deploy is a Worker version. Cloudflare dashboard > Workers & Pages > helpyy > Deployments > roll back to the previous version, or check out the previous commit and rerun the build and `node deployment/deploy.mjs`.
- Database: before any migration, take a backup (Supabase dashboard > Database > Backups, or `pg_dump` with the connection string from Project Settings > Database). Migrations here are additive; each lists its own rollback statements.
- Git: `backup/pre-production-2026-11-15` holds the repository as it was before the first deployment.

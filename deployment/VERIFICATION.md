# Deployment verification — 15 November 2026

Live URL: https://helpyy.mahindra07022008.workers.dev/

## Passed

- Production React build and full-workspace TypeScript checks.
- Dependency audit: 0 critical, high, moderate, low, or informational findings after updates (506 dependencies).
- Four automated API regression tests covering payment blocking, authentication requirements, validation and public pricing/security headers.
- Live `/api/healthz`: HTTP 200, database connected.
- Two disposable QA users: password login, refresh and sign-out tested through the real Supabase Auth service.
- Authenticated coupon creation: correct server/database-controlled price despite forged client price/seller fields.
- Public listing contains no private redemption code.
- Seller can read their own code; second account cannot read another seller's listing or code.
- Direct Supabase REST query with second user's token also cannot retrieve private codes.
- Live purchase and payout writes return HTTP 403.
- Dashboard summary returns zero actual earnings, no fabricated transactions.
- Live desktop home, pricing navigation and sign-in page inspected. Original marketplace styling retained; login provider form changed to site-styled email/password.
- No application errors observed in the inspected browser pages (browser extension metadata errors are unrelated).
- Disposable QA listings withdrawn; QA accounts banned and refresh tokens revoked after tests. Permanent cleanup was not completed because the database tool confirmation expired.

## Not yet verified / remaining work

- Real registration email delivery, confirmation redirect and full browser login-to-listing journey. Email signup is enabled and confirmation remains required, but the Supabase URL configuration requires dashboard sign-in not available through the connector.
- Mobile visual/end-to-end test. Responsive CSS retained; local browser runner could not start in this execution environment. Do not interpret desktop checks as mobile verification.
- Supabase security advisor reports leaked-password protection disabled and an existing SECURITY DEFINER moderation function. The existing function checks `private.is_admin()`; it was not modified. New coupon RPC is SECURITY INVOKER and both new tables have RLS. The dependency audit is not a comprehensive penetration test.
- Existing Clerk/Replit accounts, listings and transaction history were not imported from the original hosted database, which was not included in the ZIP.

## Scope and fixes

- Removed mandatory Replit-only PORT/BASE_PATH build assumptions for Helpyy.
- Added deployable source, reproducible API deployment script, env example and secret ignore rules.
- Replaced Replit Clerk dependency in active UI with Supabase email auth; active backend uses caller-scoped REST/RLS.
- Added same-origin API routing, SPA deep-link fallback and response security headers.
- Removed active payment QR/UPI submission UI, disabled payouts and payment approvals server-side, including legacy Express routes.
- Fixed known vulnerable dependency versions and pnpm build-script approval compatibility.
- Preserved original non-deployed workspace artifacts and existing repository ZIP/README history.
- Backup branch: `backup/pre-production-2026-11-15`.

Payments, bank linking, UPI activation and custom domain setup remain deliberately excluded. This is a deployed application with remaining launch checks, not a claim that all production-readiness checks are complete.

## Update — 16 November 2026

Added: password reset (`/reset-password`, linked from sign-in), seller withdraw of own listings (migration 002 + `POST /api/seller/coupons/:id/withdraw`), sellers can see their own codes, database-side search, server validation messages on the listing form, IST-correct minimum expiry date.

Checked locally, against a stand-in for Supabase (not the real database or the live site):

- Production build, typecheck, and 7 Worker tests.
- 34 browser checks on the built site, desktop and Pixel 7 viewport: home, sign-up, wrong-password error, sign-in, sign-out, session after refresh, protected-route redirects, listing creation and persistence, search, brand filter, empty state, payments-disabled checkout, second account cannot see or withdraw the first account's listings or codes, admin endpoints 401/403, owner withdraw, password change, reset request, 404 and pricing pages, no horizontal overflow on mobile, no uncaught browser errors.

Not verified: everything above on the live URL; migration 002 and its RLS policy on the real database; the PostgREST search filter against real Supabase; real reset and confirmation emails.

Deployed the same day (Worker deployment `d8b9d5ea952d414292f136336a8eee39`, inline-assets mode; previous version `c4fda940-e17a-4aa6-9d9d-ba8f670d5455` is the rollback target).

Checked on the live URL: home, deep links, `/api/healthz` (database connected), `/api/coupons` including a search with hostile characters against the real database, pricing, security headers, Brotli compression; in a browser at desktop and Pixel 7 sizes: home renders without horizontal overflow, `/seller` and `/admin` redirect to sign-in when signed out, forgot-password link opens the reset form, no console errors.

Still not verified live: sign-up, sign-in, sign-out, listing creation, ownership checks and withdraw with real accounts (the test environment could not reach the Supabase project host); reset and confirmation emails. Migration 002 is **not yet applied**, so Withdraw returns an error on the live site until it is.

## Update 2 — 16 November 2026: manual UPI payments enabled

Live Worker deployment `057929e19beb4e00881af33dabb9370d` with `UPI_ID` set. Migration 003 applied to helpay-v2 (plus a follow-up fix to the UPI-ID pattern, already folded into the migration file). Migration 002 (withdraw) is still **not applied**.

- Payment rules, run against the real database inside a transaction that was rolled back (no test data left): cannot buy own listing; malformed and reused references refused; listing reserved while pending; code hidden until verified; only a reviewer can verify or mark paid; seller cannot verify their own sale; no payout before verified earnings; one pending payout at a time; earnings arithmetic; signed-out callers and direct table reads refused.
- Browser, local stand-in database: checkout shows QR and UPI ID, reference submission, pending state, reviewer page, code release, seller earnings, payout request (14 checks), desktop and Pixel 7.
- Live URL: config reports payments on, payment and reviewer endpoints return 401 when signed out, QR image served, pages render without console errors.

Not verified: a real UPI payment end to end on the live site with real accounts; reviewer sign-in (the owner account's email is not yet confirmed).

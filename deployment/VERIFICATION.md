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

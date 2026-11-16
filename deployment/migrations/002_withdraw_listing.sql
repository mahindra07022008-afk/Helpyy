-- Lets a seller withdraw their own listing. Additive and idempotent; no rows change.
-- The column-level grant means `status` is the only column a signed-in user can
-- update, and the policy means only on their own rows, and only to 'withdrawn'.
grant update (status) on public.helpyy_coupons to authenticated;
drop policy if exists own_coupon_withdraw on public.helpyy_coupons;
create policy own_coupon_withdraw on public.helpyy_coupons for update to authenticated
 using (seller_id = (select auth.uid()) and status = 'available')
 with check (seller_id = (select auth.uid()) and status = 'withdrawn');

-- Rollback:
--   drop policy own_coupon_withdraw on public.helpyy_coupons;
--   revoke update (status) on public.helpyy_coupons from authenticated;

-- Manual UPI payments: a buyer pays the published UPI ID in their own UPI app,
-- submits the transaction reference, and a reviewer confirms the money arrived
-- before the coupon code is released. No payment gateway is involved.
-- Additive: existing rows are untouched. Every write goes through the functions
-- below; the two new tables have RLS on and no direct client access at all.

alter table public.helpyy_coupons drop constraint helpyy_coupons_status_check;
alter table public.helpyy_coupons add constraint helpyy_coupons_status_check
 check (status in ('available','withdrawn','reserved','sold'));

-- Reviewer accounts, by email. Add one with:
--   insert into private.helpyy_admins(email) values ('you@example.com');
create schema if not exists private;
create table private.helpyy_admins (email text primary key check (email = lower(email)));
revoke all on private.helpyy_admins from public, anon, authenticated;

create function private.helpyy_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from auth.users u join private.helpyy_admins a on a.email = lower(u.email)
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function private.helpyy_is_admin() from public, anon, authenticated;

create table public.helpyy_purchases (
 id bigint generated always as identity primary key,
 coupon_id bigint not null references public.helpyy_coupons(id),
 buyer_id uuid not null references auth.users(id),
 seller_id uuid not null references auth.users(id),
 payment_reference text not null check (payment_reference ~ '^[A-Z0-9]{6,40}$'),
 amount integer not null check (amount > 0),
 commission integer not null,
 seller_earnings integer not null,
 status text not null default 'pending' check (status in ('pending','verified','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 check (buyer_id <> seller_id)
);
-- One live purchase per coupon, and a UPI reference can back only one live purchase.
create unique index helpyy_purchase_live_coupon on public.helpyy_purchases(coupon_id) where status in ('pending','verified');
create unique index helpyy_purchase_live_reference on public.helpyy_purchases(payment_reference) where status in ('pending','verified');
create index helpyy_purchase_buyer_idx on public.helpyy_purchases(buyer_id, created_at desc);
create index helpyy_purchase_seller_idx on public.helpyy_purchases(seller_id, created_at desc);
create index helpyy_purchase_reviewer_idx on public.helpyy_purchases(reviewed_by);

create table public.helpyy_payout_requests (
 id bigint generated always as identity primary key,
 seller_id uuid not null references auth.users(id),
 upi_id text not null check (upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9._-]{2,64}$'),
 amount integer not null check (amount > 0),
 status text not null default 'pending' check (status in ('pending','paid','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create unique index helpyy_payout_one_pending on public.helpyy_payout_requests(seller_id) where status = 'pending';
create index helpyy_payout_seller_idx on public.helpyy_payout_requests(seller_id, created_at desc);
create index helpyy_payout_reviewer_idx on public.helpyy_payout_requests(reviewed_by);

alter table public.helpyy_purchases enable row level security;
alter table public.helpyy_payout_requests enable row level security;
revoke all on public.helpyy_purchases, public.helpyy_payout_requests from public, anon, authenticated;

-- Messages prefixed HELPYY: are safe to show to the person; the API passes them through.

create function public.helpyy_create_purchase(p_coupon_id bigint, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.helpyy_coupons; p public.helpyy_purchases; uid uuid := auth.uid();
 ref text := upper(regexp_replace(coalesce(p_reference,''), '\s', '', 'g'));
begin
 if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if ref !~ '^[A-Z0-9]{6,40}$' then raise exception 'HELPYY:Enter the transaction reference exactly as your UPI app shows it (6–40 letters or digits).'; end if;
 select * into c from public.helpyy_coupons where id = p_coupon_id for update;
 if not found or c.status <> 'available' or c.expiry_date < (now() at time zone 'Asia/Kolkata')::date then
  raise exception 'HELPYY:This offer is no longer available.'; end if;
 if c.seller_id = uid then raise exception 'HELPYY:You can’t buy your own listing.'; end if;
 if (select count(*) from public.helpyy_purchases where buyer_id = uid and status = 'pending') >= 3 then
  raise exception 'HELPYY:You already have 3 payments waiting for review. Please wait for those first.'; end if;
 if exists (select 1 from public.helpyy_purchases where payment_reference = ref and status in ('pending','verified')) then
  raise exception 'HELPYY:That transaction reference has already been used.'; end if;
 insert into public.helpyy_purchases(coupon_id, buyer_id, seller_id, payment_reference, amount, commission, seller_earnings)
 values (c.id, uid, c.seller_id, ref, c.sale_price, c.commission, c.seller_earnings) returning * into p;
 update public.helpyy_coupons set status = 'reserved' where id = c.id;
 return jsonb_build_object('id', p.id, 'couponId', c.id, 'title', c.title, 'brand', c.brand, 'amount', p.amount,
  'sellerEarnings', p.seller_earnings, 'commission', p.commission, 'status', p.status, 'direction', 'purchase',
  'paymentReference', p.payment_reference, 'couponCode', null, 'createdAt', p.created_at);
end; $$;

create function public.helpyy_review_purchase(p_id bigint, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.helpyy_purchases; c public.helpyy_coupons;
begin
 if not private.helpyy_is_admin() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
 if p_status not in ('verified','rejected') then raise exception 'HELPYY:Choose verified or rejected.'; end if;
 select * into p from public.helpyy_purchases where id = p_id for update;
 if not found or p.status <> 'pending' then raise exception 'HELPYY:This payment has already been reviewed.'; end if;
 update public.helpyy_purchases set status = p_status, reviewed_at = now(), reviewed_by = auth.uid() where id = p.id returning * into p;
 update public.helpyy_coupons set status = case when p_status = 'verified' then 'sold' else 'available' end
  where id = p.coupon_id returning * into c;
 return jsonb_build_object('id', p.id, 'couponId', c.id, 'brand', c.brand, 'title', c.title, 'paymentReference', p.payment_reference,
  'amount', p.amount, 'sellerEarnings', p.seller_earnings, 'commission', p.commission, 'status', p.status, 'createdAt', p.created_at);
end; $$;

create function public.helpyy_seller_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
 with s as (
  select coalesce(sum(seller_earnings) filter (where status = 'verified'), 0) earned,
         coalesce(sum(seller_earnings) filter (where status = 'pending'), 0) pending,
         count(*) filter (where status = 'verified') sold
  from public.helpyy_purchases where seller_id = (select auth.uid())),
 r as (select coalesce(sum(amount), 0) requested from public.helpyy_payout_requests
  where seller_id = (select auth.uid()) and status in ('pending','paid'))
 select jsonb_build_object('totalEarned', s.earned, 'availableToClaim', greatest(0, s.earned - r.requested),
  'pendingPayments', s.pending, 'couponsSold', s.sold) from s, r;
$$;

create function public.helpyy_create_payout(p_upi_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); upi text := trim(coalesce(p_upi_id,'')); available integer; r public.helpyy_payout_requests;
begin
 if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if upi !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9._-]{2,64}$' then raise exception 'HELPYY:Enter a valid UPI ID, like name@bank.'; end if;
 perform pg_advisory_xact_lock(hashtext('helpyy_payout:' || uid::text));
 if exists (select 1 from public.helpyy_payout_requests where seller_id = uid and status = 'pending') then
  raise exception 'HELPYY:You already have a payout request waiting for review.'; end if;
 available := (public.helpyy_seller_summary()->>'availableToClaim')::integer;
 if available <= 0 then raise exception 'HELPYY:There are no earnings to claim yet.'; end if;
 insert into public.helpyy_payout_requests(seller_id, upi_id, amount) values (uid, upi, available) returning * into r;
 return jsonb_build_object('id', r.id, 'amount', r.amount, 'status', r.status, 'createdAt', r.created_at);
end; $$;

create function public.helpyy_review_payout(p_id bigint, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.helpyy_payout_requests;
begin
 if not private.helpyy_is_admin() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
 if p_status not in ('paid','rejected') then raise exception 'HELPYY:Choose paid or rejected.'; end if;
 update public.helpyy_payout_requests set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_id and status = 'pending' returning * into r;
 if not found then raise exception 'HELPYY:This payout request has already been reviewed.'; end if;
 return jsonb_build_object('id', r.id, 'sellerId', r.seller_id, 'upiId', r.upi_id, 'amount', r.amount, 'status', r.status, 'createdAt', r.created_at);
end; $$;

-- The caller's purchases and sales. A coupon code appears only on the buyer's own verified purchase.
create function public.helpyy_transactions() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb) from (
  select p.created_at, jsonb_build_object('id', p.id, 'couponId', c.id, 'title', c.title, 'brand', c.brand,
   'amount', case when p.buyer_id = (select auth.uid()) then p.amount else p.seller_earnings end,
   'sellerEarnings', p.seller_earnings, 'commission', p.commission, 'status', p.status,
   'direction', case when p.buyer_id = (select auth.uid()) then 'purchase' else 'sale' end,
   'paymentReference', case when p.buyer_id = (select auth.uid()) then p.payment_reference end,
   'couponCode', case when p.buyer_id = (select auth.uid()) and p.status = 'verified' then k.code end,
   'createdAt', p.created_at) j
  from public.helpyy_purchases p join public.helpyy_coupons c on c.id = p.coupon_id
  left join public.helpyy_coupon_codes k on k.coupon_id = c.id
  where p.buyer_id = (select auth.uid()) or p.seller_id = (select auth.uid())
  order by p.created_at desc limit 200) t;
$$;

create function public.helpyy_my_payouts() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'status', status, 'createdAt', created_at) order by created_at desc), '[]'::jsonb)
 from public.helpyy_payout_requests where seller_id = (select auth.uid());
$$;

create function public.helpyy_admin_purchases() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.helpyy_is_admin() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'couponId', c.id, 'brand', c.brand, 'title', c.title,
   'paymentReference', p.payment_reference, 'amount', p.amount, 'sellerEarnings', p.seller_earnings, 'commission', p.commission,
   'status', p.status, 'createdAt', p.created_at) order by p.created_at), '[]'::jsonb)
  from public.helpyy_purchases p join public.helpyy_coupons c on c.id = p.coupon_id where p.status = 'pending');
end; $$;

create function public.helpyy_admin_payouts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.helpyy_is_admin() then raise exception 'Reviewer access required' using errcode = '42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sellerId', seller_id, 'upiId', upi_id, 'amount', amount,
   'status', status, 'createdAt', created_at) order by created_at), '[]'::jsonb)
  from public.helpyy_payout_requests where status = 'pending');
end; $$;

revoke all on function public.helpyy_create_purchase(bigint, text), public.helpyy_review_purchase(bigint, text),
 public.helpyy_seller_summary(), public.helpyy_create_payout(text), public.helpyy_review_payout(bigint, text),
 public.helpyy_transactions(), public.helpyy_my_payouts(), public.helpyy_admin_purchases(), public.helpyy_admin_payouts()
 from public, anon;
grant execute on function public.helpyy_create_purchase(bigint, text), public.helpyy_review_purchase(bigint, text),
 public.helpyy_seller_summary(), public.helpyy_create_payout(text), public.helpyy_review_payout(bigint, text),
 public.helpyy_transactions(), public.helpyy_my_payouts(), public.helpyy_admin_purchases(), public.helpyy_admin_payouts()
 to authenticated;

-- Rollback (only while both new tables are empty; otherwise export them first):
--   drop function public.helpyy_create_purchase(bigint, text), public.helpyy_review_purchase(bigint, text),
--    public.helpyy_seller_summary(), public.helpyy_create_payout(text), public.helpyy_review_payout(bigint, text),
--    public.helpyy_transactions(), public.helpyy_my_payouts(), public.helpyy_admin_purchases(), public.helpyy_admin_payouts();
--   drop table public.helpyy_payout_requests, public.helpyy_purchases;
--   drop function private.helpyy_is_admin(); drop table private.helpyy_admins;
--   update public.helpyy_coupons set status = 'available' where status = 'reserved';
--   alter table public.helpyy_coupons drop constraint helpyy_coupons_status_check;
--   alter table public.helpyy_coupons add constraint helpyy_coupons_status_check check (status in ('available','withdrawn'));

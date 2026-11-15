-- Additive schema for the empty helpay-v2 database; no existing data is replaced.
create table public.helpyy_coupons (
 id bigint generated always as identity primary key,
 seller_id uuid not null default auth.uid() references auth.users(id),
 brand text not null check(length(brand) between 1 and 80),
 category text not null check(category in ('discount','worth')),
 title text not null check(length(trim(title)) between 3 and 160),
 discount_percent integer, coupon_value integer,
 expiry_date date not null,
 sale_price integer not null, commission integer not null, seller_earnings integer not null,
 status text not null default 'available' check(status in ('available','withdrawn')),
 created_at timestamptz not null default now(),
 constraint valid_value check ((category='discount' and discount_percent is not null and discount_percent between 10 and 100 and coupon_value is null) or (category='worth' and coupon_value is not null and coupon_value between 0 and 1000 and discount_percent is null)),
 constraint valid_price check (
 (category='discount' and discount_percent<50 and sale_price=10 and commission=7 and seller_earnings=3) or
 (category='discount' and discount_percent>=50 and sale_price=50 and commission=35 and seller_earnings=15) or
 (category='worth' and coupon_value<=100 and sale_price=20 and commission=14 and seller_earnings=6) or
 (category='worth' and coupon_value>100 and coupon_value<=500 and sale_price=60 and commission=42 and seller_earnings=18) or
 (category='worth' and coupon_value>500 and sale_price=100 and commission=70 and seller_earnings=30))
);
create table public.helpyy_coupon_codes (
 coupon_id bigint primary key references public.helpyy_coupons(id) on delete cascade,
 seller_id uuid not null default auth.uid() references auth.users(id),
 code text not null check(length(trim(code)) between 1 and 200)
);
create index helpyy_coupon_seller_idx on public.helpyy_coupons(seller_id);
create index helpyy_coupon_expiry_idx on public.helpyy_coupons(status,expiry_date);
create index helpyy_code_seller_idx on public.helpyy_coupon_codes(seller_id);
alter table public.helpyy_coupons enable row level security;
alter table public.helpyy_coupon_codes enable row level security;
revoke all on public.helpyy_coupons,public.helpyy_coupon_codes from anon, authenticated;
grant select on public.helpyy_coupons to anon,authenticated;
grant insert on public.helpyy_coupons to authenticated;
grant select,insert on public.helpyy_coupon_codes to authenticated;
grant usage on sequence public.helpyy_coupons_id_seq to authenticated;
create policy visible_coupons on public.helpyy_coupons for select to anon,authenticated using ((status='available' and expiry_date >= (now() at time zone 'Asia/Kolkata')::date) or seller_id=(select auth.uid()));
create policy own_coupon_insert on public.helpyy_coupons for insert to authenticated with check(seller_id=(select auth.uid()) and status='available' and expiry_date >= (now() at time zone 'Asia/Kolkata')::date);
create policy own_codes_read on public.helpyy_coupon_codes for select to authenticated using(seller_id=(select auth.uid()));
create policy own_codes_insert on public.helpyy_coupon_codes for insert to authenticated with check(seller_id=(select auth.uid()) and exists(select 1 from public.helpyy_coupons c where c.id=coupon_id and c.seller_id=(select auth.uid())));
create function public.helpyy_create_coupon(payload jsonb) returns setof public.helpyy_coupons language plpgsql security invoker set search_path='' as $$
declare c public.helpyy_coupons; v integer; price integer; earnings integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from public.helpyy_coupons where seller_id=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception 'Daily listing limit reached'; end if;
 if payload->>'category'='discount' then
 v=(payload->>'discountPercent')::integer; price=case when v<50 then 10 else 50 end; earnings=case when v<50 then 3 else 15 end;
 else
 v=(payload->>'couponValue')::integer; price=case when v<=100 then 20 when v<=500 then 60 else 100 end; earnings=case when v<=100 then 6 when v<=500 then 18 else 30 end;
 end if;
 insert into public.helpyy_coupons(brand,category,title,discount_percent,coupon_value,expiry_date,sale_price,commission,seller_earnings)
 values(payload->>'brand',payload->>'category',trim(payload->>'title'),(payload->>'discountPercent')::integer,(payload->>'couponValue')::integer,(payload->>'expiryDate')::date,price,price-earnings,earnings) returning * into c;
 insert into public.helpyy_coupon_codes(coupon_id,code) values(c.id,trim(payload->>'code'));
 return next c;
end; $$;
revoke all on function public.helpyy_create_coupon(jsonb) from public,anon;
grant execute on function public.helpyy_create_coupon(jsonb) to authenticated;

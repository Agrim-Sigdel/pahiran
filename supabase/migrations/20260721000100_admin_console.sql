-- Admin console — vendor approval gate + an audit trail for admin actions.
-- Run in the Supabase SQL editor, after 20260720000200_item_codes.sql.
--
-- Phase 1 of the approval/wallet direction: this migration adds the outer
-- approval gate only. The catalog-plan / try-on-credit-wallet split is a
-- separate, later migration.

-- ── Vendor approval status ──────────────────────────────────────────────────
-- New shops land in 'pending' and cannot add catalog items until an admin
-- approves them. Every shop that already exists is grandfathered to
-- 'approved', so this ships without interrupting a single live vendor.
alter table shops add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected', 'suspended'));
alter table shops add column if not exists status_note text;
alter table shops add column if not exists status_changed_at timestamptz;

update shops set status = 'approved', status_changed_at = now()
  where status = 'pending' and created_at < now();

create index if not exists shops_status_idx on shops (status, created_at desc);

-- ── Admin action audit trail ────────────────────────────────────────────────
-- Every state change an admin makes from the console is recorded here. Written
-- with the service role only; no RLS policy is granted, so the anon and
-- authenticated roles can never read it.
create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,          -- the ADMIN_EMAILS account that acted
  action text not null,               -- 'shop.approve' | 'user.delete' | ...
  target_type text not null,          -- 'shop' | 'user' | 'garment' | 'request'
  target_id text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_recent_idx on admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on admin_actions (target_type, target_id);

alter table admin_actions enable row level security;

-- ── Status transitions ──────────────────────────────────────────────────────
create or replace function set_shop_status(p_shop_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'approved', 'rejected', 'suspended') then
    raise exception 'invalid_shop_status: %', p_status;
  end if;
  update shops set
    status = p_status,
    status_note = p_note,
    status_changed_at = now()
  where id = p_shop_id;
end $$;

-- ── Approval gates catalog writes ───────────────────────────────────────────
-- Redefines the trigger function from 20260719000100 to check approval first,
-- then the plan's garment cap exactly as before.
create or replace function enforce_garment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
  lim integer;
  cnt integer;
begin
  select status into st from shops where id = new.shop_id;
  if st is distinct from 'approved' then
    raise exception 'shop_not_approved'
      using errcode = 'check_violation',
            hint = 'This shop is awaiting admin approval.';
  end if;

  select p.max_garments into lim
    from shop_subscriptions s
    join plans p on p.id = s.plan_id
    where s.shop_id = new.shop_id;
  if lim is null then
    return new; -- unlimited plan, or no subscription row yet
  end if;
  select count(*) into cnt from garments where shop_id = new.shop_id;
  if cnt >= lim then
    raise exception 'garment_limit_reached'
      using errcode = 'check_violation',
            hint = 'Upgrade the shop plan to add more garments.';
  end if;
  return new;
end $$;

-- ── Approval gates try-on ───────────────────────────────────────────────────
-- Redefines consume_tryon from 20260716000100 with approval as the outermost
-- check: a shop that isn't approved has no entitlement at all, so this runs
-- before the period roll and before any plan lookup. The try-on route uses the
-- service role and so bypasses RLS entirely — this function is the only thing
-- standing between an unapproved shop and a paid generation.
create or replace function consume_tryon(p_shop_id uuid, p_studio boolean)
returns table (allowed boolean, reason text, tryons_left integer, studio_left integer)
language plpgsql security definer set search_path = public as $$
declare
  sub shop_subscriptions%rowtype;
  pl  plans%rowtype;
  st  text;
begin
  select status into st from shops where id = p_shop_id;
  if st is distinct from 'approved' then
    -- Deliberately reports zero remaining: an unapproved shop holds no
    -- allowance to spend, whatever its plan row happens to say.
    return query select false, 'not_approved', 0, 0;
    return;
  end if;

  select * into sub from shop_subscriptions where shop_id = p_shop_id for update;
  if not found then
    insert into shop_subscriptions (shop_id) values (p_shop_id)
      on conflict (shop_id) do nothing;
    select * into sub from shop_subscriptions where shop_id = p_shop_id for update;
  end if;

  -- Roll the billing period if it has elapsed.
  if now() >= sub.period_end then
    update shop_subscriptions
      set period_start = now(), period_end = now() + interval '30 days',
          tryons_used = 0, studio_used = 0
      where shop_id = p_shop_id
      returning * into sub;
  end if;

  select * into pl from plans where id = sub.plan_id;
  if not found then select * into pl from plans where id = 'free'; end if;

  if sub.status <> 'active' then
    return query select false, 'subscription_inactive',
      greatest(pl.tryon_limit - sub.tryons_used, 0),
      greatest(pl.studio_limit - sub.studio_used, 0);
    return;
  end if;

  if sub.tryons_used >= pl.tryon_limit then
    return query select false, 'tryon_limit',
      0, greatest(pl.studio_limit - sub.studio_used, 0);
    return;
  end if;

  if p_studio and sub.studio_used >= pl.studio_limit then
    return query select false, 'studio_limit',
      greatest(pl.tryon_limit - sub.tryons_used, 0), 0;
    return;
  end if;

  update shop_subscriptions
    set tryons_used = tryons_used + 1,
        studio_used = studio_used + (case when p_studio then 1 else 0 end)
    where shop_id = p_shop_id
    returning * into sub;

  return query select true, 'ok',
    greatest(pl.tryon_limit - sub.tryons_used, 0),
    greatest(pl.studio_limit - sub.studio_used, 0);
end $$;

-- ── Approval gates public reads ─────────────────────────────────────────────
-- Until a shop is approved it is invisible to anon: no storefront, no kiosk, no
-- listing on the directory. The vendor still sees their own shop and catalog
-- throughout — the "own shop" / "own garments" policies are separate permissive
-- policies keyed on auth.uid(), and permissive policies combine with OR.
drop policy if exists "public shops read" on shops;
create policy "public shops read" on shops
  for select using (status = 'approved');

drop policy if exists "public garments read" on garments;
create policy "public garments read" on garments
  for select using (
    exists (select 1 from shops s where s.id = garments.shop_id and s.status = 'approved')
  );

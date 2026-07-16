-- Plans + per-shop credit metering + atomic guards.
-- Run in the Supabase SQL editor. New installs get this via schema.sql.
--
-- Every shop is on a plan (default: free). Each 30-day period includes a
-- try-on allowance and a studio-finish sub-allowance; a studio finish spends
-- one of each. Cache hits are free and never metered. Enforcement is atomic
-- (row lock) so concurrent try-ons can't overshoot the allowance.

-- ── Plan catalog ────────────────────────────────────────────────────────────
create table if not exists plans (
  id text primary key,                 -- 'free' | 'starter' | 'growth' | 'pro'
  name text not null,
  price_npr integer not null default 0, -- 0 = free or custom (see pro)
  tryon_limit integer not null,        -- included try-ons per 30-day period
  studio_limit integer not null,       -- included studio finishes (subset of tryons)
  max_garments integer,                -- null = unlimited
  listed_allowed boolean not null default true,
  sort integer not null default 0
);

insert into plans (id, name, price_npr, tryon_limit, studio_limit, max_garments, listed_allowed, sort) values
  ('free',    'Free',    0,     100,  10,   50, true, 0),
  ('starter', 'Starter', 3000,  300,  20,  200, true, 1),
  ('growth',  'Growth',  5000,  800,  60, null, true, 2),
  ('pro',     'Pro',     0,    3000, 300, null, true, 3)
on conflict (id) do update set
  name = excluded.name, price_npr = excluded.price_npr,
  tryon_limit = excluded.tryon_limit, studio_limit = excluded.studio_limit,
  max_garments = excluded.max_garments, listed_allowed = excluded.listed_allowed,
  sort = excluded.sort;

-- ── Per-shop subscription + current-period usage ────────────────────────────
create table if not exists shop_subscriptions (
  shop_id uuid primary key references shops (id) on delete cascade,
  plan_id text not null references plans (id) default 'free',
  status text not null default 'active',        -- active | past_due | canceled
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '30 days'),
  tryons_used integer not null default 0,
  studio_used integer not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-provision a free subscription for every shop.
create or replace function ensure_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into shop_subscriptions (shop_id) values (new.id)
  on conflict (shop_id) do nothing;
  return new;
end $$;

drop trigger if exists shops_subscription on shops;
create trigger shops_subscription after insert on shops
  for each row execute function ensure_subscription();

-- Backfill any shops that predate this migration.
insert into shop_subscriptions (shop_id)
  select id from shops on conflict (shop_id) do nothing;

-- ── Atomic try-on reservation ───────────────────────────────────────────────
-- Locks the shop's row, rolls the period if expired, checks the allowance and
-- (for studio) the studio sub-allowance, then increments. Returns whether the
-- spend is allowed plus what remains. Denials never increment.
create or replace function consume_tryon(p_shop_id uuid, p_studio boolean)
returns table (allowed boolean, reason text, tryons_left integer, studio_left integer)
language plpgsql security definer set search_path = public as $$
declare
  sub shop_subscriptions%rowtype;
  pl  plans%rowtype;
begin
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

-- Give a reserved try-on back when the generation ultimately failed.
create or replace function refund_tryon(p_shop_id uuid, p_studio boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shop_subscriptions
    set tryons_used = greatest(tryons_used - 1, 0),
        studio_used = greatest(studio_used - (case when p_studio then 1 else 0 end), 0)
    where shop_id = p_shop_id;
end $$;

-- ── Atomic rate-limit bucket ────────────────────────────────────────────────
-- Single-statement increment (upsert) so concurrent requests can't all read the
-- same count and slip past. Returns the new count for the caller to compare.
create or replace function incr_rate_limit(p_key text, p_window_ms bigint)
returns integer language plpgsql set search_path = public as $$
declare new_count integer;
begin
  insert into rate_limits (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now()
                      then now() + make_interval(secs => p_window_ms / 1000.0)
                      else rate_limits.reset_at end
    returning count into new_count;
  return new_count;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table plans enable row level security;
alter table shop_subscriptions enable row level security;

drop policy if exists "plans public read" on plans;
create policy "plans public read" on plans for select using (true);

-- Vendors read their own subscription for the dashboard; writes are service-role only.
drop policy if exists "own subscription read" on shop_subscriptions;
create policy "own subscription read" on shop_subscriptions
  for select using (shop_id in (select id from shops where owner = auth.uid()));

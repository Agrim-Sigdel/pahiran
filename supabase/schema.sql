-- Pahiran — Phase 1 schema (run in the Supabase SQL editor)
-- Multi-tenant: one shop per vendor account, RLS keeps catalogs isolated,
-- storefronts get public read access.

create table shops (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  slug text unique not null,          -- pahiran.app/k/{slug}, /s/{slug}
  name text not null,
  area text,
  whatsapp text,                      -- order-link number shown on storefront/kiosk
  listed boolean not null default false, -- opt-in: show on the landing page directory
  lat double precision,               -- OSM map pin (null = not placed yet)
  lng double precision,
  created_at timestamptz not null default now()
);

create table garments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  name text not null,
  category text not null,
  price_npr integer not null default 0,
  image_url text not null,            -- Supabase Storage public URL, not data URLs
  sizes text[] not null default '{}', -- e.g. {S,M,L}; empty = free size
  tryon_enabled boolean not null default true,   -- false for fabric-only listings
  stitched_to_order boolean not null default false,
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

-- Try-on result cache (same person + garment = free repeat, survives restarts).
-- Renders are private: result_path points into the private 'results' bucket and
-- is served via short-lived signed URLs. result_url is a legacy fallback.
create table tryon_results (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,     -- sha256(person|garment|category)
  shop_id uuid references shops (id) on delete set null,
  garment_id uuid references garments (id) on delete set null,
  result_url text not null default '',
  result_path text,                   -- object path in the private 'results' bucket
  created_at timestamptz not null default now()
);

-- One row per try-on tap (cached or not) — the "most-tried items" analytics source
create table tryon_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops (id) on delete cascade,
  garment_id uuid references garments (id) on delete cascade,
  cached boolean not null default false,
  session_id text,                    -- anonymous per-kiosk-session id
  created_at timestamptz not null default now()
);

-- "I'm interested" leads from the kiosk result screen
create table leads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  garment_id uuid references garments (id) on delete set null,
  name text,
  phone text,
  size text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Rate-limit buckets, keyed by scope ("tryon:ip:…", "tryon:global:…",
-- "lead:ip:…", "log:ip:…"). Server-only via service role.
create table rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- Error monitoring: server + client failures land here (see /api/log)
create table error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'tryon-api' | 'kiosk' | 'dashboard' | ...
  message text not null,
  detail jsonb,
  shop_id uuid,
  created_at timestamptz not null default now()
);

create index garments_shop_idx on garments (shop_id);
create index tryon_results_garment_idx on tryon_results (garment_id);
create index tryon_events_shop_idx on tryon_events (shop_id, garment_id);
create index leads_shop_idx on leads (shop_id, handled, created_at desc);

alter table shops enable row level security;
alter table garments enable row level security;
alter table tryon_results enable row level security;
alter table tryon_events enable row level security;
alter table rate_limits enable row level security; -- no policies: service role only
alter table error_logs enable row level security;  -- written by service role only
alter table leads enable row level security;       -- written by service role only

-- Vendors manage their own shop + catalog
create policy "own shop" on shops
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

create policy "own garments" on garments
  for all using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

-- Public read for kiosk + storefront pages
create policy "public shops read" on shops for select using (true);
create policy "public garments read" on garments for select using (true);

-- tryon_results / tryon_events: written only by the server (service role
-- bypasses RLS); vendors can read their own for analytics
create policy "own tryon cache" on tryon_results
  for select using (shop_id in (select id from shops where owner = auth.uid()));
create policy "own tryon analytics" on tryon_events
  for select using (shop_id in (select id from shops where owner = auth.uid()));

-- Leads: written by the server; vendors read + mark handled
create policy "own leads read" on leads
  for select using (shop_id in (select id from shops where owner = auth.uid()));
create policy "own leads update" on leads
  for update using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

-- Vendors can read their own error logs in the dashboard
create policy "own errors read" on error_logs
  for select using (shop_id in (select id from shops where owner = auth.uid()));

-- Garment photo storage: public-read bucket, vendors write under their shop id
insert into storage.buckets (id, name, public) values ('garments', 'garments', true);

-- Private bucket for try-on renders: signed-URL access only, no public read.
insert into storage.buckets (id, name, public) values ('results', 'results', false);

create policy "garment images public read" on storage.objects
  for select using (bucket_id = 'garments');
create policy "garment images owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'garments'
    and (storage.foldername(name))[1] in
        (select id::text from shops where owner = auth.uid())
  );
create policy "garment images owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'garments'
    and (storage.foldername(name))[1] in
        (select id::text from shops where owner = auth.uid())
  );

-- ── Plans + per-shop credit metering ────────────────────────────────────────
-- Every shop is on a plan (default: free). Each 30-day period includes a
-- try-on allowance and a studio-finish sub-allowance; a studio finish spends
-- one of each. Cache hits are free and never metered. Enforcement is atomic.

create table plans (
  id text primary key,                 -- 'free' | 'starter' | 'growth' | 'pro'
  name text not null,
  price_npr integer not null default 0,
  tryon_limit integer not null,        -- included try-ons per 30-day period
  studio_limit integer not null,       -- included studio finishes (subset of tryons)
  max_garments integer,                -- null = unlimited
  listed_allowed boolean not null default true,
  sort integer not null default 0
);

insert into plans (id, name, price_npr, tryon_limit, studio_limit, max_garments, listed_allowed, sort) values
  ('free',    'Free',    0,      50,   5,   50, true, 0),
  ('starter', 'Starter', 3000,  300,  20,  200, true, 1),
  ('growth',  'Growth',  5000,  800,  60, null, true, 2),
  ('pro',     'Pro',     0,    3000, 300, null, true, 3);

create table shop_subscriptions (
  shop_id uuid primary key references shops (id) on delete cascade,
  plan_id text not null references plans (id) default 'free',
  status text not null default 'active',        -- active | past_due | canceled
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '30 days'),
  tryons_used integer not null default 0,
  studio_used integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function ensure_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into shop_subscriptions (shop_id) values (new.id)
  on conflict (shop_id) do nothing;
  return new;
end $$;

create trigger shops_subscription after insert on shops
  for each row execute function ensure_subscription();

-- Atomic try-on reservation: locks the shop row, rolls the period if expired,
-- checks the allowance (and studio sub-allowance), increments. Denials never
-- increment. Returns whether the spend is allowed plus what remains.
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

create or replace function refund_tryon(p_shop_id uuid, p_studio boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shop_subscriptions
    set tryons_used = greatest(tryons_used - 1, 0),
        studio_used = greatest(studio_used - (case when p_studio then 1 else 0 end), 0)
    where shop_id = p_shop_id;
end $$;

-- Atomic rate-limit bucket: single-statement upsert so concurrent requests
-- can't all read the same count and slip past. Returns the new count.
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

alter table plans enable row level security;
alter table shop_subscriptions enable row level security;

create policy "plans public read" on plans for select using (true);
create policy "own subscription read" on shop_subscriptions
  for select using (shop_id in (select id from shops where owner = auth.uid()));

-- ── Plan payments (Khalti / eSewa) ──────────────────────────────────────────
create table payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  plan_id text not null references plans (id),
  provider text not null,                 -- 'khalti' | 'esewa'
  amount_npr integer not null,
  status text not null default 'pending', -- pending | paid | failed
  provider_ref text,                      -- khalti pidx / esewa transaction_uuid
  transaction_id text,                    -- provider's final settlement id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_shop_idx on payments (shop_id, created_at desc);
create index payments_ref_idx on payments (provider_ref);

alter table payments enable row level security;
create policy "own payments read" on payments
  for select using (shop_id in (select id from shops where owner = auth.uid()));

-- Switch a shop to a plan and start a fresh 30-day period (post-payment).
create or replace function activate_plan(p_shop_id uuid, p_plan_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into shop_subscriptions (shop_id, plan_id, status, period_start, period_end, tryons_used, studio_used)
    values (p_shop_id, p_plan_id, 'active', now(), now() + interval '30 days', 0, 0)
    on conflict (shop_id) do update set
      plan_id = excluded.plan_id, status = 'active',
      period_start = now(), period_end = now() + interval '30 days',
      tryons_used = 0, studio_used = 0;
end $$;

-- Manual-billing inbox: vendors request a plan upgrade / credit top-up, the
-- admin fulfils by hand. Used while live checkout is dormant.
create table plan_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  kind text not null default 'plan' check (kind in ('plan', 'credits')),
  plan_id text references plans (id),
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'open', -- open | done
  created_at timestamptz not null default now()
);
create index plan_requests_open_idx on plan_requests (status, created_at desc);
-- At most one OPEN request of each kind per shop — blocks duplicate-spam.
create unique index plan_requests_one_open on plan_requests (shop_id, kind) where status = 'open';

alter table plan_requests enable row level security;
create policy "own plan_requests read" on plan_requests
  for select using (shop_id in (select id from shops where owner = auth.uid()));
create policy "own plan_requests insert" on plan_requests
  for insert with check (shop_id in (select id from shops where owner = auth.uid()));

-- Admin top-up: raise a shop's current-period headroom by lowering *_used.
create or replace function grant_credits(p_shop_id uuid, p_tryons integer, p_studio integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shop_subscriptions set
    tryons_used = greatest(tryons_used - coalesce(p_tryons, 0), 0),
    studio_used = greatest(studio_used - coalesce(p_studio, 0), 0)
  where shop_id = p_shop_id;
end $$;

-- Enforce the shop's plan garment cap on insert. null max_garments = unlimited.
create or replace function enforce_garment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  cnt integer;
begin
  select p.max_garments into lim
    from shop_subscriptions s join plans p on p.id = s.plan_id
    where s.shop_id = new.shop_id;
  if lim is null then return new; end if;
  select count(*) into cnt from garments where shop_id = new.shop_id;
  if cnt >= lim then
    raise exception 'garment_limit_reached'
      using errcode = 'check_violation', hint = 'Upgrade the shop plan to add more garments.';
  end if;
  return new;
end $$;

create trigger garments_limit before insert on garments
  for each row execute function enforce_garment_limit();

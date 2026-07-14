-- Phase B: vendor try-on history, anonymous sessions, leads inbox,
-- vendor-readable error logs. Run in the Supabase SQL editor.
-- (New installs get all of this via schema.sql.)

-- Anonymous per-kiosk-session id → distinguishes 12 shoppers from 1 shopper x12
alter table tryon_events add column session_id text;

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
create index leads_shop_idx on leads (shop_id, handled, created_at desc);

alter table leads enable row level security;

-- Written by the server (service role bypasses RLS); vendors read + mark handled
create policy "own leads read" on leads
  for select using (shop_id in (select id from shops where owner = auth.uid()));
create policy "own leads update" on leads
  for update using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

-- Vendors can read their own error logs in the dashboard
create policy "own errors read" on error_logs
  for select using (shop_id in (select id from shops where owner = auth.uid()));

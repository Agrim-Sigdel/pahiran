-- Pahiran — Phase 1 schema (run in the Supabase SQL editor)
-- Multi-tenant: one shop per vendor account, RLS keeps catalogs isolated,
-- storefronts get public read access.

create table shops (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  slug text unique not null,          -- pahiran.app/k/{slug}, /s/{slug}
  name text not null,
  area text,
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

-- Try-on result cache (same person + garment = free repeat, survives restarts)
create table tryon_results (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,     -- sha256(person|garment|category)
  shop_id uuid references shops (id) on delete set null,
  garment_id uuid references garments (id) on delete set null,
  result_url text not null,
  created_at timestamptz not null default now()
);

-- One row per try-on tap (cached or not) — the "most-tried items" analytics source
create table tryon_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops (id) on delete cascade,
  garment_id uuid references garments (id) on delete cascade,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per-IP generation rate limits (server-only via service role)
create table rate_limits (
  ip text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

create index garments_shop_idx on garments (shop_id);
create index tryon_results_garment_idx on tryon_results (garment_id);
create index tryon_events_shop_idx on tryon_events (shop_id, garment_id);

alter table shops enable row level security;
alter table garments enable row level security;
alter table tryon_results enable row level security;
alter table tryon_events enable row level security;
alter table rate_limits enable row level security; -- no policies: service role only

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

-- Garment photo storage: public-read bucket, vendors write under their shop id
insert into storage.buckets (id, name, public) values ('garments', 'garments', true);

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

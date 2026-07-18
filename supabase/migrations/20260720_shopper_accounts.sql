-- Shopper accounts — cross-device saved looks, cart/wishlist sync, checkout
-- prefill, and a remembered try-on photo.
--
-- Shoppers and vendors share Supabase Auth. profiles.role tells them apart so
-- a shopper never gets a shop auto-provisioned (the app sets 'vendor' only at
-- vendor entry points, 'shopper' everywhere else). A shopper's likeness
-- (looks + remembered photo) lives in PRIVATE buckets, served via short-lived
-- signed URLs, and is fully deletable by the owner.

-- ── profile: one row per auth user ──────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'shopper',   -- 'shopper' | 'vendor'
  name text,                              -- checkout / lead prefill
  phone text,
  photo_path text,                        -- remembered try-on photo (private bucket)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── cloud-saved try-on looks ────────────────────────────────────────────────
create table if not exists saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  shop_id uuid references shops (id) on delete set null,
  garment_id uuid references garments (id) on delete set null,
  garment_name text not null,
  shop_name text,
  price_npr integer not null default 0,
  image_path text not null,               -- object in the private 'looks' bucket
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── cart + wishlist, per user per shop (mirrors the localStorage JSON shape) ──
create table if not exists shopper_bags (
  user_id uuid not null references auth.users (id) on delete cascade,
  shop_slug text not null,
  cart jsonb not null default '[]'::jsonb,
  wishlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, shop_slug)
);

create index if not exists saved_looks_user_idx on saved_looks (user_id, created_at desc);

alter table profiles enable row level security;
alter table saved_looks enable row level security;
alter table shopper_bags enable row level security;

-- A user can only ever touch their own rows.
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own looks" on saved_looks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bag" on shopper_bags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── private storage buckets ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('looks', 'looks', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('shopper-photos', 'shopper-photos', false)
  on conflict (id) do nothing;

-- Objects are namespaced by owner: {uid}/<file>. A user may only read/write/
-- delete objects under their own uid prefix.
create policy "own look files read" on storage.objects
  for select using (bucket_id = 'looks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own look files write" on storage.objects
  for insert with check (bucket_id = 'looks' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own look files delete" on storage.objects
  for delete using (bucket_id = 'looks' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photo read" on storage.objects
  for select using (bucket_id = 'shopper-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo write" on storage.objects
  for insert with check (bucket_id = 'shopper-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo update" on storage.objects
  for update using (bucket_id = 'shopper-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo delete" on storage.objects
  for delete using (bucket_id = 'shopper-photos' and (storage.foldername(name))[1] = auth.uid()::text);

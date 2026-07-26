-- Made-to-order: fabrics as listings, styles as the cuts they can become.
--
-- A bespoke suit or lehenga has no photograph until somebody picks. The shop
-- sells a *fabric*, and the fabric can be stitched into any of several *styles*
-- — so the fabric is the browsable product and the style is the variant axis.
-- That inverts the garments model, where one row is one photographed piece.
--
-- This migration lands the two pools only. The rendered fabric x style variant
-- (fabric_styles) arrives with the compose pipeline in the next step; nothing
-- here calls an image model or spends a rupee.
--
-- Three deliberate choices:
--
--  1. Styles are global by default. shop_id null = platform-curated, readable
--     by every shop, so a new suit vendor has a dozen cuts on day one without
--     photographing a single reference. A shop can add its own signature cuts
--     (shop_id set) and hide the global ones it can't stitch
--     (shop_disabled_styles). That last table is not optional decoration: a
--     shop shown 12 cuts it doesn't make will take orders it can't fulfil.
--
--  2. A cut needs words or a picture — at least one, not both. A vendor can
--     define a cut three ways: take a default, photograph one of their own
--     stitched samples, or just describe it. The global library ships with
--     words only (which is why it needs no image assets); a vendor
--     photographing their house cut shouldn't then be forced to write an
--     essay about it. The check constraint below is what enforces "at least
--     one", rather than a NOT NULL on either column alone.
--
--  3. Fabrics draw item codes from shops.item_seq — the same counter garments
--     use — so a fabric bolt's printed tag can never collide with a hanger
--     tag. It also means the QR ends up where it belongs for made-to-order:
--     on the bolt itself. Scan the navy wool, see every cut available in it.

-- ── families ────────────────────────────────────────────────────────────────
-- The shared taxonomy that pairs a fabric with the cuts it can become. One
-- column on both tables instead of a join table: a suit fabric offers suit
-- cuts, and that covers essentially every real shop. Keep in sync with
-- FAMILIES in src/lib/constants.ts.

-- ── styles ──────────────────────────────────────────────────────────────────
create table if not exists styles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops (id) on delete cascade, -- null = platform-global
  slug text,                          -- stable id for global styles; null for shop styles
  family text not null check (family in (
    'suit', 'lehenga', 'kurtha', 'daura-suruwal', 'sari-blouse', 'sherwani'
  )),
  name text not null,
  prompt_hint text not null default '', -- the cut in words — what the compose step reads
  ref_image_url text,                 -- a photographed sample of the cut
  active boolean not null default true, -- retire a global cut without deleting it
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  -- A cut with neither words nor a picture tells the compose step nothing.
  constraint styles_describable check (prompt_hint <> '' or ref_image_url is not null)
);

-- Global styles are seeded by slug on every deploy, so they need a stable key
-- to upsert against. Shop styles have no slug and aren't covered by the index.
create unique index if not exists styles_global_slug_key
  on styles (slug) where shop_id is null;

create index if not exists styles_family_idx on styles (family, sort);
create index if not exists styles_shop_idx on styles (shop_id);

-- ── per-shop hiding of global styles ────────────────────────────────────────
create table if not exists shop_disabled_styles (
  shop_id uuid not null references shops (id) on delete cascade,
  style_id uuid not null references styles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shop_id, style_id)
);

-- ── fabrics ─────────────────────────────────────────────────────────────────
create table if not exists fabrics (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  item_code text,                     -- {VENDOR}-{0001}; assigned by trigger below
  name text not null,
  family text not null check (family in (
    'suit', 'lehenga', 'kurtha', 'daura-suruwal', 'sari-blouse', 'sherwani'
  )),
  image_url text not null,            -- Storage public URL of the bolt/swatch photo
  price_npr integer not null default 0,
  unit text not null default 'meter' check (unit in ('meter', 'piece', 'set')),
  composition text,                   -- 'wool 120s', 'banarasi silk', 'raw cotton'
  color text,
  -- The vendor's own knowledge about this cloth: "gold border runs along one
  -- edge only — it goes on the pallu", "heavy brocade, holds structure". This
  -- feeds the compose prompt, and it is worth more than any wording we could
  -- invent: border and motif placement is exactly where generated saris and
  -- lehengas go wrong, and the shop already knows where the border goes.
  note text,
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists fabrics_shop_idx on fabrics (shop_id);
create index if not exists fabrics_family_idx on fabrics (shop_id, family);

-- ── item codes for fabrics ──────────────────────────────────────────────────
-- assign_item_code() and freeze_item_code() (20260720000200) are written
-- against new.shop_id / new.item_code, and PL/pgSQL trigger functions aren't
-- bound to a table — so both apply to fabrics unchanged. The "one function per
-- table" note in that migration was about vendor_code vs item_code having
-- different column names on shops vs garments; here the columns match.
--
-- Sharing shops.item_seq is the point: garment 0007 and fabric 0008 come off
-- the same counter, so two printed tags in one shop can never read the same.
create unique index if not exists fabrics_item_code_key on fabrics (item_code);
create index if not exists fabrics_item_code_upper_idx on fabrics (upper(item_code));

drop trigger if exists fabrics_zz_item_code on fabrics;
create trigger fabrics_zz_item_code before insert on fabrics
  for each row execute function assign_item_code();

drop trigger if exists fabrics_freeze_code on fabrics;
create trigger fabrics_freeze_code before update on fabrics
  for each row execute function freeze_item_code();

-- ── approval gate + catalog cap ─────────────────────────────────────────────
-- A fabric is a listing, so it counts as a catalog item. Both limit triggers
-- now count garments + fabrics against plans.max_garments, which keeps one
-- honest meaning for "catalog items" and closes the hole a fabrics-only shop
-- would otherwise have. No live vendor changes behaviour today: fabrics starts
-- empty, so garments + fabrics == garments for every existing shop.
create or replace function catalog_item_count(p_shop_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (select count(*) from garments where shop_id = p_shop_id)
       + (select count(*) from fabrics  where shop_id = p_shop_id);
$$;

-- Redefines 20260721000100's version: approval first, then the shared cap.
create or replace function enforce_garment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
  lim integer;
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
  if catalog_item_count(new.shop_id) >= lim then
    raise exception 'garment_limit_reached'
      using errcode = 'check_violation',
            hint = 'Upgrade the shop plan to add more catalog items.';
  end if;
  return new;
end $$;

create or replace function enforce_fabric_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  st text;
  lim integer;
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
    return new;
  end if;
  if catalog_item_count(new.shop_id) >= lim then
    raise exception 'fabric_limit_reached'
      using errcode = 'check_violation',
            hint = 'Upgrade the shop plan to add more catalog items.';
  end if;
  return new;
end $$;

-- Sorts before fabrics_zz_item_code, so a fabric rejected by the cap doesn't
-- burn a sequence number on its way out — same reasoning as garments_limit.
drop trigger if exists fabrics_limit on fabrics;
create trigger fabrics_limit before insert on fabrics
  for each row execute function enforce_fabric_limit();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table styles enable row level security;
alter table shop_disabled_styles enable row level security;
alter table fabrics enable row level security;

-- Global styles are public to everyone; shop styles follow their shop's
-- approval, exactly like garments.
drop policy if exists "public styles read" on styles;
create policy "public styles read" on styles
  for select using (
    shop_id is null
    or exists (select 1 from shops s where s.id = styles.shop_id and s.status = 'approved')
  );

-- `shop_id in (select ... where owner = auth.uid())` is false for a null
-- shop_id, so a vendor cannot create, edit or delete a platform-global style.
drop policy if exists "own styles" on styles;
create policy "own styles" on styles
  for all using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

-- The storefront has to know which cuts a shop hides, so this reads public.
drop policy if exists "public disabled styles read" on shop_disabled_styles;
create policy "public disabled styles read" on shop_disabled_styles
  for select using (
    exists (select 1 from shops s where s.id = shop_disabled_styles.shop_id and s.status = 'approved')
  );

drop policy if exists "own disabled styles" on shop_disabled_styles;
create policy "own disabled styles" on shop_disabled_styles
  for all using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

drop policy if exists "own fabrics" on fabrics;
create policy "own fabrics" on fabrics
  for all using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

drop policy if exists "public fabrics read" on fabrics;
create policy "public fabrics read" on fabrics
  for select using (
    exists (select 1 from shops s where s.id = fabrics.shop_id and s.status = 'approved')
  );

-- ── storage buckets ─────────────────────────────────────────────────────────
-- Both public-read, both foldered by shop id, same shape as 'garments'.
-- Global style references have no shop-id folder, so the vendor-write policy
-- won't accept them — they go in via the service role, which is correct for a
-- platform-owned asset.
insert into storage.buckets (id, name, public) values ('fabrics', 'fabrics', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('styles', 'styles', true)
  on conflict (id) do nothing;

drop policy if exists "fabric images public read" on storage.objects;
create policy "fabric images public read" on storage.objects
  for select using (bucket_id in ('fabrics', 'styles'));

drop policy if exists "fabric images owner write" on storage.objects;
create policy "fabric images owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('fabrics', 'styles')
    and (storage.foldername(name))[1] in
        (select id::text from shops where owner = auth.uid())
  );

drop policy if exists "fabric images owner delete" on storage.objects;
create policy "fabric images owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('fabrics', 'styles')
    and (storage.foldername(name))[1] in
        (select id::text from shops where owner = auth.uid())
  );

-- ── global style library ────────────────────────────────────────────────────
-- Upserted by slug, so re-running this migration refreshes wording without
-- duplicating rows or breaking fabric_styles that already point at a style.
-- Keep in sync with GLOBAL_STYLES in src/lib/style-library.ts, which serves
-- the same list in local (no-Supabase) mode.
insert into styles (shop_id, slug, family, name, prompt_hint, sort) values
  (null, 'suit-2pc-notch', 'suit', 'Two-piece · notch lapel',
   'Two-piece single-breasted suit. Two-button notch lapel, straight flap pockets, single rear vent, flat-front tapered trousers.', 10),
  (null, 'suit-2pc-peak', 'suit', 'Two-piece · peak lapel',
   'Two-piece single-breasted suit. One-button peak lapel, jetted pockets, double side vents, flat-front tapered trousers.', 20),
  (null, 'suit-3pc-notch', 'suit', 'Three-piece · notch lapel',
   'Three-piece suit. Two-button notch-lapel jacket, five-button V-neck waistcoat, flat-front trousers, all in the same cloth.', 30),
  (null, 'suit-3pc-peak', 'suit', 'Three-piece · peak lapel',
   'Three-piece suit. Peak-lapel jacket, matching lapelled waistcoat, tapered trousers, all in the same cloth.', 40),
  (null, 'suit-double-breasted', 'suit', 'Double-breasted',
   'Double-breasted six-button peak-lapel jacket, structured shoulder, double side vents, wide straight-leg trousers.', 50),
  (null, 'suit-tuxedo-shawl', 'suit', 'Tuxedo · shawl collar',
   'Single-button tuxedo with a satin shawl collar, jetted pockets, and trousers with a satin side stripe.', 60),
  (null, 'suit-blazer', 'suit', 'Blazer only',
   'Single blazer, no trousers. Two-button notch lapel, patch pockets, unstructured soft shoulder.', 70),

  (null, 'lehenga-a-line', 'lehenga', 'A-line',
   'A-line lehenga. Gently flared floor-length skirt, fitted cropped blouse, matching dupatta draped over one shoulder.', 10),
  (null, 'lehenga-mermaid', 'lehenga', 'Mermaid',
   'Mermaid lehenga. Body-hugging from waist to knee, then flaring into a fishtail hem. Fitted blouse, long dupatta.', 20),
  (null, 'lehenga-circular', 'lehenga', 'Circular flare',
   'Circular flared lehenga with a full 360-degree ghera and heavy pleating at the waist. Cropped blouse, wide dupatta.', 30),
  (null, 'lehenga-panelled', 'lehenga', 'Panelled (kali)',
   'Panelled kali lehenga. Vertical gored panels with contrast border seams, moderate flare, fitted blouse.', 40),
  (null, 'lehenga-sharara', 'lehenga', 'Sharara',
   'Sharara set. Wide trousers flaring sharply from the knee, short flared kurti to mid-thigh, dupatta.', 50),
  (null, 'lehenga-straight', 'lehenga', 'Straight cut',
   'Straight-cut lehenga. Narrow column skirt with minimal flare and a side slit, fitted blouse.', 60),

  (null, 'kurtha-straight', 'kurtha', 'Straight cut',
   'Straight-cut kurtha to the knee, side slits, mandarin collar, full sleeves, worn over matching churidar.', 10),
  (null, 'kurtha-anarkali', 'kurtha', 'Anarkali',
   'Anarkali. Fitted bodice flaring from a high empire waist into a floor-length frock, full sleeves, churidar beneath.', 20),
  (null, 'kurtha-a-line', 'kurtha', 'A-line',
   'A-line kurtha widening gently from shoulder to a calf-length hem, round neck, three-quarter sleeves.', 30),
  (null, 'kurtha-short-kurti', 'kurtha', 'Short kurti',
   'Short kurti to the hip, boat neck, cap sleeves, straight cut.', 40),

  (null, 'daura-classic', 'daura-suruwal', 'Classic',
   'Classic daura suruwal. Closed-neck cross-over daura with eight ties and a mandarin collar, churidar suruwal gathered at the ankle.', 10),
  (null, 'daura-modern', 'daura-suruwal', 'Modern slim',
   'Modern slim daura suruwal. Trimmed close-fitting daura, tapered suruwal, worn with a fitted waistcoat in the same cloth.', 20),

  (null, 'blouse-round-short', 'sari-blouse', 'Round neck · short sleeve',
   'Sari blouse. Round neck, short sleeves, standard closed back, cropped at the ribcage.', 10),
  (null, 'blouse-deep-back', 'sari-blouse', 'Deep back',
   'Sari blouse with a deep U-shaped open back and tie fastening, elbow-length sleeves.', 20),
  (null, 'blouse-sleeveless', 'sari-blouse', 'Sleeveless',
   'Sleeveless cropped sari blouse, square neckline, fitted.', 30),
  (null, 'blouse-elbow', 'sari-blouse', 'Elbow sleeve',
   'Sari blouse with elbow-length sleeves and a sweetheart neckline.', 40),

  (null, 'sherwani-classic', 'sherwani', 'Classic',
   'Classic sherwani. Knee-length closed-neck coat with a mandarin collar and full button placket, over churidar.', 10),
  (null, 'sherwani-indo-western', 'sherwani', 'Indo-western',
   'Indo-western sherwani. Asymmetric hem, open front worn over a contrasting inner kurta, tapered trousers.', 20)
on conflict (slug) where shop_id is null do update set
  family = excluded.family,
  name = excluded.name,
  prompt_hint = excluded.prompt_hint,
  sort = excluded.sort;

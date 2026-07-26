-- Compositions: a rendered garment that nobody photographed.
--
-- A fabric plus a cut is a sellable thing the shop can stitch, but no camera
-- has ever seen it. This table is that thing: one row per (fabric, cut) the
-- vendor decided to offer, holding the render that stands in for a photograph.
--
-- It is NOT a cache. The vendor authors these deliberately, prices them, and
-- publishes them — every row is a product the tailor has agreed to make. That
-- is the whole reason this design beats generating on demand: a shopper can
-- only ever see combinations a human signed off on.
--
-- ── why parts, when fabric x style needs only two ids ──────────────────────
-- The same machinery has to assemble outfits later: jacket + trousers +
-- waistcoat rendered into one look, so a shopper's photo takes exactly one
-- try-on pass instead of three stacked ones (each pass over a generated image
-- compounds identity drift, which is what makes chaining unusable). Outfits
-- need N inputs and named slots. Building that shape now costs one extra table
-- and saves rewriting the compose step, the cache key and the try-on resolver
-- once outfits arrive.
--
-- The fabric_id / style_id columns are kept alongside parts deliberately: the
-- fabric x style case is the overwhelming majority, and a plain unique index on
-- (shop_id, fabric_id, style_id) is a far better duplicate guard than hashing
-- a recipe. Outfits carry null in both and live entirely in the parts table.

-- ── compositions ────────────────────────────────────────────────────────────
create table if not exists compositions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  kind text not null default 'fabric_style' check (kind in ('fabric_style', 'outfit')),

  -- fabric x style fast path; both null for an outfit
  fabric_id uuid references fabrics (id) on delete cascade,
  style_id uuid references styles (id) on delete restrict,

  image_url text,                     -- the render; null until status = 'ready'
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  error_note text,                    -- why it failed, shown to the vendor

  price_npr integer not null default 0,
  published boolean not null default false, -- vendor reviews before shoppers see it
  created_at timestamptz not null default now(),

  -- style_id is restrict-on-delete, not cascade: a cut with renders hanging off
  -- it must be retired (active = false), never deleted out from under them.
  constraint compositions_fabric_style_shape check (
    (kind = 'fabric_style' and fabric_id is not null and style_id is not null)
    or (kind = 'outfit' and fabric_id is null and style_id is null)
  )
);

-- One render per fabric-and-cut. Deliberately NOT a partial index: PostgREST's
-- upsert names only the conflict columns, and Postgres cannot infer a partial
-- index without also being given its predicate — so `where kind =
-- 'fabric_style'` here would make every compose write fail with "no unique or
-- exclusion constraint matching the ON CONFLICT specification".
-- It doesn't need to be partial anyway: nulls compare as distinct in a unique
-- index, so outfit rows (both ids null) never collide with each other.
create unique index if not exists compositions_fabric_style_key
  on compositions (shop_id, fabric_id, style_id);

create index if not exists compositions_shop_idx on compositions (shop_id, created_at desc);
create index if not exists compositions_fabric_idx on compositions (fabric_id);
create index if not exists compositions_published_idx
  on compositions (shop_id, published) where status = 'ready';

-- ── parts (outfits) ─────────────────────────────────────────────────────────
-- Slots are what let a shopper swap one piece and keep the rest — three blouse
-- cuts against one skirt is three compositions sharing two parts. Unused by the
-- fabric x style path; here so outfits don't need a schema change.
create table if not exists composition_parts (
  id uuid primary key default gen_random_uuid(),
  composition_id uuid not null references compositions (id) on delete cascade,
  slot text not null,                 -- 'jacket', 'trousers', 'blouse', 'skirt', 'dupatta'…
  garment_id uuid references garments (id) on delete cascade,
  fabric_id uuid references fabrics (id) on delete cascade,
  style_id uuid references styles (id) on delete restrict,
  sort integer not null default 0,
  -- a part is either a photographed garment or a fabric-and-cut, never neither
  constraint composition_parts_source check (
    garment_id is not null or fabric_id is not null
  )
);

create index if not exists composition_parts_comp_idx
  on composition_parts (composition_id, sort);

-- ── compose metering ────────────────────────────────────────────────────────
-- A third meter beside tryon_limit / studio_limit. Composes are spent by the
-- vendor at authoring time, not by shoppers, so this bounds a cost the vendor
-- controls — unlike try-ons, where the crowd decides.
alter table plans add column if not exists compose_limit integer not null default 30;
alter table shop_subscriptions add column if not exists compose_used integer not null default 0;

update plans set compose_limit = case id
  when 'free'    then 15
  when 'starter' then 120
  when 'growth'  then 400
  when 'pro'     then 2000
  else compose_limit
end;

-- Mirrors consume_tryon (20260716000100 / 20260721000100): approval outermost,
-- then the period roll, then the allowance. Fail-closed — any error blocks the
-- spend, because the caller is about to pay an image model.
create or replace function consume_compose(p_shop_id uuid)
returns table (allowed boolean, reason text, composes_left integer)
language plpgsql security definer set search_path = public as $$
declare
  st text;
  sub shop_subscriptions%rowtype;
  pl plans%rowtype;
begin
  select status into st from shops where id = p_shop_id;
  if st is distinct from 'approved' then
    return query select false, 'not_approved', 0;
    return;
  end if;

  select * into sub from shop_subscriptions where shop_id = p_shop_id for update;
  if not found then
    return query select false, 'no_subscription', 0;
    return;
  end if;

  -- roll the 30-day period if it has lapsed, exactly as consume_tryon does
  if sub.period_end < now() then
    update shop_subscriptions
      set period_start = now(), period_end = now() + interval '30 days',
          tryons_used = 0, studio_used = 0, compose_used = 0
      where shop_id = p_shop_id
      returning * into sub;
  end if;

  select * into pl from plans where id = sub.plan_id;
  if not found then
    return query select false, 'no_plan', 0;
    return;
  end if;

  if sub.status <> 'active' then
    return query select false, 'subscription_inactive', 0;
    return;
  end if;

  if sub.compose_used >= pl.compose_limit then
    return query select false, 'compose_limit', 0;
    return;
  end if;

  update shop_subscriptions set compose_used = compose_used + 1 where shop_id = p_shop_id;
  return query select true, 'ok', greatest(pl.compose_limit - sub.compose_used - 1, 0);
end $$;

/* Return a reserved compose when the render ultimately failed. */
create or replace function refund_compose(p_shop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shop_subscriptions
    set compose_used = greatest(compose_used - 1, 0)
    where shop_id = p_shop_id;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table compositions enable row level security;
alter table composition_parts enable row level security;

drop policy if exists "own compositions" on compositions;
create policy "own compositions" on compositions
  for all using (shop_id in (select id from shops where owner = auth.uid()))
  with check (shop_id in (select id from shops where owner = auth.uid()));

-- Shoppers see only what the vendor published, from an approved shop, that
-- actually rendered. An unreviewed render is not a product.
drop policy if exists "public compositions read" on compositions;
create policy "public compositions read" on compositions
  for select using (
    published
    and status = 'ready'
    and exists (select 1 from shops s where s.id = compositions.shop_id and s.status = 'approved')
  );

drop policy if exists "own composition parts" on composition_parts;
create policy "own composition parts" on composition_parts
  for all using (composition_id in (
    select c.id from compositions c
    join shops s on s.id = c.shop_id
    where s.owner = auth.uid()
  ))
  with check (composition_id in (
    select c.id from compositions c
    join shops s on s.id = c.shop_id
    where s.owner = auth.uid()
  ));

drop policy if exists "public composition parts read" on composition_parts;
create policy "public composition parts read" on composition_parts
  for select using (composition_id in (
    select c.id from compositions c
    join shops s on s.id = c.shop_id
    where c.published and c.status = 'ready' and s.status = 'approved'
  ));

-- ── storage ─────────────────────────────────────────────────────────────────
-- Renders are catalog imagery — a garment on a mannequin, no person in frame —
-- so they belong in a public bucket beside 'garments', not in the private
-- 'results' bucket that holds try-ons of real people.
insert into storage.buckets (id, name, public) values ('renders', 'renders', true)
  on conflict (id) do nothing;

-- storage.objects is owned by supabase_storage_admin, so creating a policy on
-- it needs ownership the SQL editor's role may not have. That failure must not
-- take the rest of this migration with it: the editor runs the file in one
-- transaction, so an error here would roll back the tables, the functions and
-- the bucket too — leaving compose exactly as broken as before, for a policy
-- that is belt-and-braces anyway. A bucket marked public is already readable
-- over its public URL without it.
do $$
begin
  drop policy if exists "render images public read" on storage.objects;
  create policy "render images public read" on storage.objects
    for select using (bucket_id = 'renders');
exception
  when insufficient_privilege then
    raise notice 'skipped storage.objects policy (needs supabase_storage_admin); the renders bucket is public, so reads still work';
end $$;

-- Written by the compose route under the service role; vendors only read.

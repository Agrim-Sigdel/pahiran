-- Shop type: who gets try-on at all.
--
-- peeq started apparel-only, but the catalog, kiosk, QR tags and leads work for
-- any retailer. A 'general' shop pays for the catalog side and never sees
-- try-on; 'apparel' keeps the full product. This is separate from the credit
-- balance — a general shop has no try-on entitlement to spend in the first
-- place, whatever its plan says.

alter table shops add column if not exists type text not null default 'apparel'
  check (type in ('apparel', 'general'));

-- Every existing shop is a clothing shop, so the default grandfathers them
-- correctly and no backfill is needed.

create index if not exists shops_type_idx on shops (type);

-- ── Type gates try-on ───────────────────────────────────────────────────────
-- Redefines consume_tryon from 20260721000100 with the type check alongside the
-- approval check. Both are entitlement questions, so both sit ahead of the
-- period roll and the plan lookup. The try-on route runs as the service role
-- and bypasses RLS, so this function is the enforcement point.
create or replace function consume_tryon(p_shop_id uuid, p_studio boolean)
returns table (allowed boolean, reason text, tryons_left integer, studio_left integer)
language plpgsql security definer set search_path = public as $$
declare
  sub shop_subscriptions%rowtype;
  pl  plans%rowtype;
  st  text;
  ty  text;
begin
  select status, type into st, ty from shops where id = p_shop_id;

  if st is distinct from 'approved' then
    -- Deliberately reports zero remaining: an unapproved shop holds no
    -- allowance to spend, whatever its plan row happens to say.
    return query select false, 'not_approved', 0, 0;
    return;
  end if;

  if ty is distinct from 'apparel' then
    -- A catalog-only shop never had a try-on entitlement to spend.
    return query select false, 'tryon_not_enabled', 0, 0;
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

-- ── Storefront needs the remaining balance before rendering ─────────────────
-- The storefront hides/disables the "see it on you" button when a shop is out
-- of try-ons, which means anon has to read the remaining count. Exposing
-- shop_subscriptions to anon would leak plan and usage history, so this
-- function returns only the derived booleans the page actually needs.
create or replace function shop_tryon_availability(p_shop_id uuid)
returns table (tryon_enabled boolean, tryons_left integer)
language plpgsql security definer set search_path = public stable as $$
declare
  sub shop_subscriptions%rowtype;
  pl  plans%rowtype;
  st  text;
  ty  text;
begin
  select status, type into st, ty from shops where id = p_shop_id;
  if st is distinct from 'approved' or ty is distinct from 'apparel' then
    return query select false, 0;
    return;
  end if;

  select * into sub from shop_subscriptions where shop_id = p_shop_id;
  if not found then
    -- No subscription row yet: the free plan's allowance applies on first use.
    select * into pl from plans where id = 'free';
    return query select true, coalesce(pl.tryon_limit, 0);
    return;
  end if;

  select * into pl from plans where id = sub.plan_id;
  if not found then select * into pl from plans where id = 'free'; end if;

  if sub.status <> 'active' then
    return query select true, 0;
    return;
  end if;

  -- A period that has already elapsed rolls on next use, so report the full
  -- allowance rather than the stale used-up count.
  if now() >= sub.period_end then
    return query select true, pl.tryon_limit;
    return;
  end if;

  return query select true, greatest(pl.tryon_limit - sub.tryons_used, 0);
end $$;

grant execute on function shop_tryon_availability(uuid) to anon, authenticated;

-- One shop per owner.
--
-- shops.owner had no unique constraint, and loadShop() used maybeSingle() while
-- discarding its error. maybeSingle() *errors* on more than one row, so a
-- duplicate read like "no shop yet" — and the client then provisioned another
-- blank shop and showed the vendor the setup form again. That created a third
-- row on the next load, and so on. The client fix is in src/lib/storage.ts;
-- this migration cleans up the rows already created and stops it recurring.

-- ── Remove the blank duplicates ─────────────────────────────────────────────
-- Deliberately conservative: only rows that are (a) not the keeper for their
-- owner, (b) blank-named, and (c) carrying no vendor data whatsoever. A
-- duplicate that someone actually used is left alone for a human to look at —
-- the unique index below will fail loudly rather than delete it.
--
-- Every shop_id FK is `on delete cascade`, so anything still attached to a row
-- deleted here goes with it. That is why payments and plan_requests are in the
-- guard despite a blank shop realistically never having either: they are the
-- one class of record that can't be reconstructed afterwards.
-- shop_subscriptions is deliberately NOT checked — the shops_subscription
-- trigger creates one for every shop, so it's present on blank rows too and
-- would veto every deletion.
with keepers as (
  select distinct on (owner) id, owner
  from shops
  order by owner, (case when coalesce(name, '') <> '' then 0 else 1 end), created_at
)
delete from shops s
where coalesce(s.name, '') = ''
  and s.id not in (select id from keepers)
  and not exists (select 1 from garments g where g.shop_id = s.id)
  and not exists (select 1 from tryon_events e where e.shop_id = s.id)
  and not exists (select 1 from leads l where l.shop_id = s.id)
  and not exists (select 1 from payments p where p.shop_id = s.id)
  and not exists (select 1 from plan_requests r where r.shop_id = s.id);

-- ── Prevent it recurring ────────────────────────────────────────────────────
-- If this fails with a uniqueness violation, two non-blank shops share an owner
-- and need merging by hand — check the admin console's shop list before
-- re-running. Failing here is the intended behaviour; it is not safe to guess
-- which of two real shops to discard.
create unique index if not exists shops_owner_key on shops (owner);

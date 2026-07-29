-- Fabric colours as two named slots, each with the shade behind it.
--
-- `fabrics.color` was one free-text box, which meant "Navy", "navy blue",
-- "N.Blue" and "गाढा निलो" were four different colours as far as any query was
-- concerned — unfilterable, and useless to the render prompt. It's replaced by
-- two slots drawn from a fixed palette (FABRIC_COLORS in src/lib/constants.ts).
-- What the weave *carries* — border, zari, print — stays in fabrics.note,
-- where the vendor was already describing it in their own words.
--
-- Four notes on the shape:
--
--  1. Text, not an enum or a lookup table. A vendor whose cloth has no word in
--     our palette types their own, and it stores as itself — the palette is a
--     fast path, not a gate. An enum would reject exactly the fabric that most
--     needed describing.
--
--  2. The word and the shade both, and neither replaces the other. The word is
--     what the render prompt reads, what the storefront filters on and what a
--     vendor searches at the counter; a hex is none of those. The shade is what
--     the vendor picked off the photo, and it's display-only — two bolts both
--     correctly called maroon are not the same maroon.
--
--  3. `color` stays, and stays written. It is the human-readable join of the
--     two slots ("Navy · Gold"), and three display paths plus the counter's
--     search index already read it. Keeping it a derived column means none of
--     them change, and a shop searching "gold" at the counter still finds the
--     bolt.
--
--  4. Nothing here is NOT NULL. All of it is optional by design: the upload
--     form asks, warns once if it's skipped, and saves anyway. A vendor holding
--     a queue at the counter must always be able to get a bolt listed.

alter table public.fabrics add column if not exists color_primary       text;
alter table public.fabrics add column if not exists color_secondary     text;
alter table public.fabrics add column if not exists color_primary_hex   text;
alter table public.fabrics add column if not exists color_secondary_hex text;

-- Belt and braces: a stray value here ends up interpolated into an inline style
-- on the storefront, so the column only accepts a literal #rrggbb.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fabrics'::regclass
       and conname  = 'fabrics_color_hex_format'
  ) then
    alter table public.fabrics
      add constraint fabrics_color_hex_format check (
        (color_primary_hex   is null or color_primary_hex   ~ '^#[0-9a-fA-F]{6}$')
        and
        (color_secondary_hex is null or color_secondary_hex ~ '^#[0-9a-fA-F]{6}$')
      );
  end if;
end $$;

-- Whatever the old box said becomes the primary colour, unchanged. It won't be
-- a palette id, and that's correct — it's still the shop's own word for the
-- cloth, and every lookup falls back to showing the stored text as-is. No shade
-- comes with it: there was never one to migrate, and inventing one from the
-- word would put a colour on the card the vendor never chose.
update public.fabrics
   set color_primary = color
 where color_primary is null
   and coalesce(color, '') <> '';

-- Storefront and counter filtering by colour.
create index if not exists fabrics_color_idx on public.fabrics (shop_id, color_primary);

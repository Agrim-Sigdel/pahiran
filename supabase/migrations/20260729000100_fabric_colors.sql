-- A cloth's colours, as a weighted list.
--
-- `fabrics.color` was one free-text box, which meant "Navy", "navy blue",
-- "N.Blue" and "गाढा निलो" were four different colours as far as any query was
-- concerned — unfilterable, and useless to the render prompt. It's replaced by
-- an ordered list of {id, hex, share}, read off the bolt photo and then
-- corrected by the vendor. What the weave *carries* — border, zari, print —
-- stays in fabrics.note, where the vendor was already describing it in their
-- own words.
--
-- Five notes on the shape:
--
--  1. A list, not a primary/secondary pair. Cloth does not come in twos: plain
--     suiting has one colour, a banarasi has five. Two slots throw away the
--     difference between a gold border and a gold-dominant weave, and force a
--     vendor with three colours to drop one.
--
--  2. The share is the reason this exists. Given two bare words an image model
--     decides for itself which dominates, and decides differently on different
--     runs — that is how a gold border becomes a gold garment. "78% maroon,
--     22% gold" cannot be read two ways. The app keeps the list summing to 1
--     through every add, edit and delete.
--
--  3. jsonb, not a child table. It is a short ordered list always read and
--     written whole, never joined against. The GIN index below still serves
--     "which of our bolts have gold in them" via containment.
--
--  4. Text ids, not an enum. A vendor whose cloth has no word in our palette
--     types their own and it stores as itself — the palette is a fast path,
--     not a gate. An enum would reject exactly the fabric that most needed
--     describing. The hex rides alongside because two bolts both correctly
--     called maroon are not the same maroon.
--
--  5. `color` stays, and stays written: the human-readable join ("Navy · Gold")
--     that three display paths and the counter's search index already read.
--     Keeping it derived means none of them change, and a shop searching
--     "gold" at the counter still finds the bolt.
--
-- Nothing here is NOT NULL beyond the empty-array default. All of it is
-- optional by design: the upload form asks, warns once if it's skipped, and
-- saves anyway. A vendor holding a queue at the counter must always be able to
-- get a bolt listed.

alter table public.fabrics add column if not exists colors jsonb not null default '[]'::jsonb;

-- It has to be an array, or every consumer that maps over it breaks on one bad
-- row. The contents stay unpoliced on purpose — shares are re-based by the app
-- on each write, and a check constraint that recomputed them here would be a
-- second implementation to keep in step with the first.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fabrics'::regclass
       and conname  = 'fabrics_colors_is_array'
  ) then
    alter table public.fabrics
      add constraint fabrics_colors_is_array check (jsonb_typeof(colors) = 'array');
  end if;
end $$;

-- Whatever the old box said becomes the whole cloth, which is what it always
-- claimed to be. The word is kept exactly as typed — it won't be a palette id,
-- and that's correct, it's still the shop's own word — and no hex is invented
-- for it, because putting a colour on the card the vendor never chose is worse
-- than showing none.
update public.fabrics
   set colors = jsonb_build_array(jsonb_build_object('id', color, 'hex', '', 'share', 1))
 where colors = '[]'::jsonb
   and coalesce(color, '') <> '';

-- Storefront and counter filtering: `colors @> '[{"id":"maroon"}]'`.
create index if not exists fabrics_colors_idx on public.fabrics using gin (colors);

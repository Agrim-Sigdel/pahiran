-- Per-vendor storefront customisation.
--
-- Every shop's /s/{slug} page renders the same hardcoded copy and the same
-- automatic image slices. One jsonb column holds a shop's overrides — section
-- text, which picture fills which slot, section order and visibility, and an
-- accent choice. Null means "all defaults": a shop that never opens the editor
-- renders exactly as it does today, and the app-side normaliser
-- (normalizeStorefront in src/lib/types.ts) turns whatever is stored into a
-- complete config, so a column written by an older client never breaks a
-- newer renderer.
--
-- jsonb rather than columns because the shape is a page description, not a
-- record: sections are an ordered list, image slots are a tagged union, and
-- every field is optional. The same call fabrics.colors made.
--
-- No RLS changes: "own shop" already covers the vendor writing it, and
-- "public shops read" is exactly right — the storefront config is the public
-- page, there is nothing secret in it.

alter table public.shops
  add column if not exists storefront jsonb;

-- Same guard as fabrics.colors and compositions.rendered_colors: an object or
-- nothing, or every reader that walks it breaks on one hand-edited row.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.shops'::regclass
       and conname  = 'shops_storefront_is_object'
  ) then
    alter table public.shops
      add constraint shops_storefront_is_object
      check (storefront is null or jsonb_typeof(storefront) = 'object');
  end if;
end $$;

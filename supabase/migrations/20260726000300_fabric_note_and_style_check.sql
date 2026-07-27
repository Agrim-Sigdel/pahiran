-- Repairs two additions that were written directly into 20260726000100 after
-- that migration had already been applied. Editing an applied migration is a
-- no-op against the database that ran it, so staging ended up without
-- fabrics.note and without the styles_describable constraint while the file on
-- disk claimed otherwise. The compose route selects fabrics.note, so the
-- missing column failed every render request.
--
-- Both statements are written to be idempotent rather than conditional on
-- environment: a fresh database gets these from 000100 and finds nothing to do
-- here, while an already-migrated one picks them up now. Either path converges
-- on the same schema, which is the point.

-- The vendor's own knowledge about a cloth (where a border sits, how heavily it
-- drapes). Feeds the compose prompt; optional, because most fabrics won't have
-- one at first.
alter table public.fabrics add column if not exists note text;

-- A cut has to be describable by words or by a photo, at least one, or the
-- compose step has nothing to work from. Guarded because add-constraint has no
-- "if not exists" form.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.styles'::regclass
       and conname  = 'styles_describable'
  ) then
    alter table public.styles
      add constraint styles_describable
      check (prompt_hint <> '' or ref_image_url is not null);
  end if;
end $$;

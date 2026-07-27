-- Let a vendor edit their own cuts, and make the renders admit it.
--
-- Editing a cut is not like renaming a garment. prompt_hint, coverage and the
-- reference photo are the inputs the render was made from, so changing any of
-- them means every existing render of that cut is now a picture of something
-- the shop no longer offers — and those renders are published to shoppers.
-- Silently leaving them up is the exact failure the whole review-before-publish
-- design exists to prevent.
--
-- So a cut carries a revision, and a composition records which revision it was
-- rendered at. They differ → the render is stale, and the studio says so. Same
-- shape as note vs rendered_note from 20260726000500; this generalises it from
-- the pairing to the cut.
--
-- The bump is a trigger rather than something the app remembers to do: there
-- is more than one path to an update (the studio, a future admin tool, a hand
-- fix in the SQL editor) and a forgotten bump is a silent lie.

alter table public.styles add column if not exists revision integer not null default 1;

alter table public.compositions
  add column if not exists rendered_style_revision integer;

/* Only the fields the compose step actually reads. Renaming a cut or
   reordering it changes nothing about the picture, and bumping for those would
   send vendors to re-render for no reason — the fastest way to teach someone
   to ignore a staleness warning. */
create or replace function bump_style_revision()
returns trigger language plpgsql as $$
begin
  if new.prompt_hint  is distinct from old.prompt_hint
  or new.coverage     is distinct from old.coverage
  or new.ref_image_url is distinct from old.ref_image_url then
    new.revision := old.revision + 1;
  end if;
  return new;
end $$;

drop trigger if exists styles_bump_revision on public.styles;
create trigger styles_bump_revision
  before update on public.styles
  for each row execute function bump_style_revision();

/* Renders that predate this column keep a null revision. Null is read as "not
   known to be stale" rather than "stale": we genuinely cannot tell what they
   were made from, and marking a shop's entire back catalogue as needing a paid
   re-render on the strength of a guess is not a warning, it's noise. They
   settle onto a real revision the next time they are stitched. */

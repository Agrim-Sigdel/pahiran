-- A cloth's colours are read at upload and corrected against a render.
--
-- 20260729000100 gave a bolt a weighted colour list and let the vendor edit it
-- on the upload form. That was the wrong moment to ask. A vendor filling in a
-- form has nothing to judge the reading against except the photo it was read
-- off — the two agree by construction — so the question either got a shrug or
-- an answer no better than the measurement. The colour only becomes worth
-- arguing about once there's a garment on screen that looks wrong beside the
-- bolt in their hand.
--
-- So the reading is applied silently at upload, the studio stitches one cut,
-- and the correction is asked for there. Two columns make that work:
--
--  1. `fabrics.colors_corrected` — the shop has looked at a render and set
--     these colours themselves. It is the only thing that lets the render
--     prompt put the words above the sample photo. Without it the prompt
--     cannot tell a vendor's verdict from a measurement taken off the very
--     photo it would be overruling, and "correcting" an orange-lit maroon bolt
--     would command orange louder. Set by one writer (setFabricColors), and
--     never by the fabric form.
--
--  2. `compositions.rendered_colors` — which colours this image was actually
--     made under. Same two-values-compared rule as rendered_note: correcting a
--     bolt's colours marks every preview of it as needing a re-stitch, with no
--     trigger and no flag to keep in sync. Until this existed a colour
--     correction changed nothing anyone could see — the previews still looked
--     current, and the corrected words never reached a prompt.
--
-- Nullable, not defaulted to '[]'. Null means "made before this column", which
-- is unknowable rather than stale — the same call 20260726000600 made for
-- rendered_style_revision, and for the same reason: a vendor does not come
-- back to a catalog that has decided overnight that all of it needs paying for
-- again.

alter table public.fabrics
  add column if not exists colors_corrected boolean not null default false;

alter table public.compositions
  add column if not exists rendered_colors jsonb;

--  3. `compositions.rendered_fabric_image` — which photo of the bolt this
--     image was stitched from. The same rule again, and it exists because the
--     studio now offers re-shooting the photo as the answer to "the colour is
--     wrong": a bolt shot under a tube light is warm in every render made from
--     it, and no amount of correcting words fixes the picture they were read
--     off. Advice to replace the photo is worth nothing if the previews made
--     from the old one go on looking current.
alter table public.compositions
  add column if not exists rendered_fabric_image text;

-- Same guard as fabrics.colors: an array or nothing, or every consumer that
-- maps over it breaks on one hand-edited row.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.compositions'::regclass
       and conname  = 'compositions_rendered_colors_is_array'
  ) then
    alter table public.compositions
      add constraint compositions_rendered_colors_is_array
      check (rendered_colors is null or jsonb_typeof(rendered_colors) = 'array');
  end if;
end $$;

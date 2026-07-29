-- Tell a render it came out wrong, and say what was wrong with it.
--
-- Until now a vendor looking at a preview that missed had two options: publish
-- it anyway, or delete it and stitch the identical prompt again and hope. Both
-- are bad. The second is worse, because it spends a render on the same
-- instructions that just failed.
--
-- So: every finished preview is asked a question — does this look right? —
-- and a no is allowed to carry a reason. The reason goes into the next
-- attempt's prompt as a correction, which is the one thing that makes stitching
-- again worth paying for.
--
-- ── why two scopes ─────────────────────────────────────────────────────────
-- "The colour came out too orange, it's maroon" is true of the cloth, and will
-- be just as true of every other cut stitched from it. "The lapel is too wide"
-- is true of this pairing only. Filing both in the same place would mean the
-- vendor retyping the colour complaint for all eight cuts, or a note about one
-- lapel quietly steering every other garment. So a correction lands either on
-- the fabric or on the composition, and the vendor picks which when they
-- write it.
--
-- ── why rendered_* mirrors, not flags ──────────────────────────────────────
-- Exactly the mechanism 20260726000500 used for note/rendered_note, for the
-- same reason: a render is stale when what it was made from no longer matches
-- what it should be made from. Two values compared, no trigger, no flag to
-- keep in sync, and nothing to get wrong when a write half-fails. A fabric
-- correction propagates for free — every composition of that cloth is holding
-- the old text, so every one of them reads stale until it's stitched again.

-- ── the verdict ─────────────────────────────────────────────────────────────
-- Deliberately separate from `published`. Publishing is a commercial act with
-- a price attached; this is only "I have looked at this and it is the cloth".
-- Defaulting false means previews made before this migration read as
-- unreviewed, which is exactly what they are.
alter table public.compositions add column if not exists approved boolean not null default false;

-- ── the correction, per pairing ─────────────────────────────────────────────
alter table public.compositions add column if not exists correction text;
alter table public.compositions add column if not exists rendered_correction text;

-- ── the correction, per cloth ───────────────────────────────────────────────
-- Mirrored onto the composition so a render knows which version of the cloth's
-- correction it was actually made under.
alter table public.fabrics       add column if not exists correction text;
alter table public.compositions  add column if not exists rendered_fabric_correction text;

/* Nothing to backfill. Existing previews have null in every column added here,
   and null = null on both comparisons, so none of them is retroactively
   declared stale — a vendor does not come back to a catalog that has decided
   overnight that all of it needs paying for again. This comment exists so that
   reads as a decision rather than an oversight. */

-- Which pieces a cut actually makes, and a note for one specific pairing.
--
-- ── why coverage is a column and not prose ─────────────────────────────────
-- The seeded cuts already carry this idea, inconsistently, in their wording:
-- 'Single blazer, no trousers' is explicit, 'worn over matching churidar' is a
-- guess the image model gets to make, and the A-line kurtha simply never
-- mentions a lower garment. So the same shop asking for two kurthas gets a
-- churidar in one render and not the other.
--
-- Prose could be tightened, but it still would not reach the second consumer:
-- try-on. That step has to tell the model whether it is placing a top, a
-- bottom or a whole outfit on the shopper, and it cannot read a sentence. A
-- suruwal-only render sent up as 'auto' gets hung on the torso. So coverage is
-- structured, and both the compose prompt and the try-on placement read it.
--
-- It belongs on the cut rather than the pairing because the unique index is
-- (shop_id, fabric_id, style_id): a per-composition coverage would let one
-- fabric-and-cut mean two different renders and collide on that key. It also
-- matches the trade — 'kurtha' and 'kurtha with churidar' are two things a
-- tailor offers, at two prices, published separately.
--
-- ── why the note is on the composition ─────────────────────────────────────
-- fabrics.note describes the cloth and styles.prompt_hint describes the cut.
-- Neither can say something true of one pairing only ('this border wants a
-- deeper hem on the A-line'). rendered_note records what the render was
-- actually made from, so note <> rendered_note means the render is stale — no
-- trigger, no flag to keep in sync, just the two values compared.

alter table public.styles add column if not exists coverage text not null default 'set';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.styles'::regclass and conname = 'styles_coverage_valid'
  ) then
    alter table public.styles
      add constraint styles_coverage_valid check (coverage in ('top', 'bottom', 'set'));
  end if;
end $$;

/* Seeded globals, by slug. 'set' is the column default and already correct for
   suits, lehengas, daura suruwal and sherwani, so only the tops are named
   here. The two ambiguous kurthas are pinned deliberately: 'worn over matching
   churidar' and 'churidar beneath' both describe a complete outfit, so they
   become 'set' explicitly rather than staying a coin toss.

   Only global rows (shop_id is null) are touched — a shop's own cuts keep
   whatever the vendor chose. */
update public.styles set coverage = 'top'
 where shop_id is null
   and slug in (
     'suit-blazer',           -- 'Single blazer, no trousers'
     'kurtha-a-line',         -- no lower garment in the wording
     'kurtha-short-kurti',
     'blouse-round-short',    -- a sari blouse is a top, always
     'blouse-deep-back',
     'blouse-sleeveless',
     'blouse-elbow'
   );

-- ── per-pairing note ────────────────────────────────────────────────────────
alter table public.compositions add column if not exists note text;
alter table public.compositions add column if not exists rendered_note text;

/* Existing renders were made before notes existed, so their note and
   rendered_note are both null — equal, therefore not stale. Nothing to
   backfill; this comment is here so that reads as intentional. */

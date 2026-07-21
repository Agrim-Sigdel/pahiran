-- Belt-and-braces backfill for shops.type.
--
-- 20260721000300 adds the column with `not null default 'apparel'`, which fills
-- every existing row as part of the DDL — so on a clean run this migration is a
-- no-op, and that is the expected outcome.
--
-- It exists for one case that migration can't cover: `add column if not exists`
-- does nothing at all if a `type` column is already present, so a column added
-- by hand or by an earlier draft — without a default, or without the NOT NULL —
-- would leave nulls behind and every such shop would be treated as non-apparel
-- by consume_tryon, silently losing try-on. This makes that state converge.
--
-- Safe to re-run.

update shops set type = 'apparel' where type is null;

-- Re-assert the constraints in case the column arrived without them. Both are
-- no-ops when 20260721000300 created the column normally.
alter table shops alter column type set default 'apparel';

do $$
begin
  alter table shops alter column type set not null;
exception
  when others then
    -- Already NOT NULL, or rows still null despite the update above (which
    -- would mean a concurrent writer) — don't fail the migration over it.
    raise notice 'shops.type NOT NULL not applied: %', sqlerrm;
end $$;

do $$
begin
  alter table shops add constraint shops_type_check check (type in ('apparel', 'general'));
exception
  when duplicate_object then null;  -- constraint already present
  when others then raise notice 'shops.type check not applied: %', sqlerrm;
end $$;

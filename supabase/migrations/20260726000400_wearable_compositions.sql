-- Let a shopper wear a composition, not just a photographed garment.
--
-- A published fabric x cut is a sellable product the shop will stitch, so it
-- has to behave like one everywhere a garment does: tried on in the kiosk,
-- counted in the vendor's history, saved to a shopper's looks, and — the part
-- that actually matters commercially — attached to the lead when someone says
-- "i want this".
--
-- garment_id could not carry it. It is a foreign key to garments, and a
-- composition is not a row there; writing one would either violate the key or,
-- if the key were dropped, quietly point at nothing. So each of the three
-- tables gains a second, equally typed reference and the two stay distinct.
-- Exactly one of the pair is set on any given row.
--
-- Requires 20260726000200 (compositions) to have been applied first.

alter table tryon_events add column if not exists composition_id uuid
  references compositions (id) on delete set null;

alter table leads add column if not exists composition_id uuid
  references compositions (id) on delete set null;

alter table saved_looks add column if not exists composition_id uuid
  references compositions (id) on delete set null;

-- The result cache denormalises the same pair for reporting. Keyed by
-- cache_key, so this column is attribution rather than lookup — but a cached
-- composition try-on that claimed no product at all would quietly under-count
-- exactly the renders the vendor paid to make.
alter table tryon_results add column if not exists composition_id uuid
  references compositions (id) on delete set null;

-- The vendor's leads inbox and history both group by product, and a made-to-
-- order shop's whole catalog can live in this column, so it is worth indexing
-- rather than scanning. Partial: most rows are photographed garments.
create index if not exists leads_composition_idx
  on leads (composition_id) where composition_id is not null;

create index if not exists tryon_events_composition_idx
  on tryon_events (composition_id) where composition_id is not null;

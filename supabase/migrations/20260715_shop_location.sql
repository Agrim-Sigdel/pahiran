-- Shop map location (OpenStreetMap pin) — vendors set it in onboarding or
-- Settings; listed shops with a pin appear on the landing page map.
alter table shops
  add column if not exists lat double precision,
  add column if not exists lng double precision;

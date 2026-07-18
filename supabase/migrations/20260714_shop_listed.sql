-- Vendor opt-in directory: shops with listed = true appear on the landing
-- page with links to their storefront and kiosk.
-- Idempotent: safe to re-run. New installs get this via schema.sql.

alter table shops add column if not exists listed boolean not null default false;

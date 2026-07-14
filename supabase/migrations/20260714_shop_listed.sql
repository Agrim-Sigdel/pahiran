-- Vendor opt-in directory: shops with listed = true appear on the landing
-- page with links to their storefront and kiosk.
-- Run in the Supabase SQL editor. New installs get this via schema.sql.

alter table shops add column listed boolean not null default false;

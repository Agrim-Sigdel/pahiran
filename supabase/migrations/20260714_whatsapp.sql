-- Phase D polish: shop WhatsApp number for storefront/kiosk order links.
-- Idempotent: safe to re-run. New installs get this via schema.sql.

alter table shops add column if not exists whatsapp text;

-- Phase D polish: shop WhatsApp number for storefront/kiosk order links.
-- Run in the Supabase SQL editor. New installs get this via schema.sql.

alter table shops add column whatsapp text;

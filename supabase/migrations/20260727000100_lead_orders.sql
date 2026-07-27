-- A bag checkout is one order, not N unrelated leads.
--
-- The storefront cart submits one row per line, so a shopper who buys three
-- pieces lands in the vendor's inbox as three rows with the same name, phone
-- and timestamp — and the vendor has to reconstruct the order by eye. Worse,
-- the quantity was dropped entirely: 2x a kurta arrived as a single lead, so
-- the inbox understated what the shopper actually asked for.
--
-- order_ref is minted client-side at checkout and shared by every line of that
-- bag, which is what lets the inbox group them back into one order. It is
-- deliberately not a foreign key: there is no orders table, and a lead has to
-- keep working when it is a lone kiosk "i want this" (order_ref null).
--
-- kind separates the two checkout buttons. Both record the order; "enquiry"
-- additionally opened WhatsApp, so the vendor knows to check their messages
-- rather than make the first call themselves.

alter table leads add column if not exists order_ref text;
alter table leads add column if not exists qty integer not null default 1;
alter table leads add column if not exists kind text not null default 'order';

alter table leads drop constraint if exists leads_qty_check;
alter table leads add constraint leads_qty_check check (qty between 1 and 99);

alter table leads drop constraint if exists leads_kind_check;
alter table leads add constraint leads_kind_check check (kind in ('order', 'enquiry'));

-- The inbox reads a shop's leads newest-first and groups by order_ref, so the
-- lookup is always scoped to one shop. Partial: kiosk leads carry no ref.
create index if not exists leads_order_ref_idx
  on leads (shop_id, order_ref) where order_ref is not null;

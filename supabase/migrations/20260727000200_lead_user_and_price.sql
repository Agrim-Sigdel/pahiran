-- Give a shopper their own order history, and stop old orders from being
-- re-priced by later catalog edits.
--
-- user_id is stamped by the server from the shopper's verified access token,
-- never from the request body — a client-sent id would let anyone write orders
-- into someone else's history. Null is the normal case: guest checkout stays a
-- first-class path, so an order is never blocked on having an account.
--
-- on delete set null, not cascade: a shopper closing their account must not
-- delete orders the vendor is still filling.
--
-- unit_price snapshots what one piece cost when the order was placed. Both the
-- vendor inbox and the shopper's history read it instead of joining to the
-- current garments row, so a vendor raising a price tomorrow does not silently
-- rewrite what an order was worth today. Null on rows written before this
-- migration; readers fall back to the catalog price for those.

alter table leads add column if not exists user_id uuid
  references auth.users (id) on delete set null;
alter table leads add column if not exists unit_price integer;

create index if not exists leads_user_idx
  on leads (user_id, created_at desc) where user_id is not null;

-- Shoppers read their own orders. Deliberately select-only: the vendor owns
-- the handled flag, and a shopper cannot mark their own order dealt with.
drop policy if exists "own orders read" on leads;
create policy "own orders read" on leads
  for select using (auth.uid() = user_id);

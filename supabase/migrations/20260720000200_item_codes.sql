-- Vendor-scoped item codes for printed QR tags.
--
-- Every shop gets an immutable 4-char vendor_code at insert; every garment gets
-- an immutable item_code of the form {VENDOR}-{0001}. Both are frozen on write
-- and rejected on update, because they end up on printed hanger tags that we
-- can never reach again — a code that drifts from its label is a lost garment.
--
-- Numbering comes from shops.item_seq, a monotonic per-shop counter, NOT from
-- count(garments). Deleting garment 0005 must never let a later piece reuse
-- 0005 while the old tag is still hanging in the shop. Gaps are fine; reuse is
-- not.

-- ── columns ─────────────────────────────────────────────────────────────────
alter table shops add column if not exists vendor_code text;
alter table shops add column if not exists item_seq integer not null default 0;
alter table garments add column if not exists item_code text;

-- ── vendor code generator ───────────────────────────────────────────────────
-- Crockford-style base32 minus 0/1/I/L/O (misread off a printed tag) and U
-- (keeps four random chars from spelling something unfortunate). 30^4 = 810k.
create or replace function gen_vendor_code() returns text as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := '';
    for _i in 1..4 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from shops where vendor_code = candidate);
    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'gen_vendor_code: no free code after 50 attempts';
    end if;
  end loop;
  return candidate;
end;
$$ language plpgsql security definer set search_path = public;

-- ── backfill: existing shops ────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select id from shops where vendor_code is null loop
    update shops set vendor_code = gen_vendor_code() where id = r.id;
  end loop;
end $$;

-- ── backfill: existing garments, oldest piece per shop = 0001 ───────────────
with numbered as (
  select g.id,
         s.vendor_code,
         row_number() over (partition by g.shop_id order by g.created_at, g.id) as n
  from garments g
  join shops s on s.id = g.shop_id
  where g.item_code is null
)
update garments g
set item_code = numbered.vendor_code || '-' || lpad(numbered.n::text, 4, '0')
from numbered
where g.id = numbered.id;

-- Park each shop's counter past everything already numbered.
update shops s
set item_seq = coalesce((select count(*) from garments g where g.shop_id = s.id), 0)
where s.item_seq = 0;

-- ── constraints (only safe now that every row is populated) ─────────────────
alter table shops alter column vendor_code set not null;
alter table garments alter column item_code set not null;

create unique index if not exists shops_vendor_code_key on shops (vendor_code);
create unique index if not exists garments_item_code_key on garments (item_code);

-- ── assignment triggers ─────────────────────────────────────────────────────
create or replace function assign_vendor_code() returns trigger as $$
begin
  if new.vendor_code is null then
    new.vendor_code := gen_vendor_code();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists shops_vendor_code on shops;
create trigger shops_vendor_code before insert on shops
  for each row execute function assign_vendor_code();

-- security definer: bumping shops.item_seq is a write to a different table than
-- the one being inserted into. The caller's own RLS on garments has already
-- proven they own this shop_id, so there is nothing further to authorize.
create or replace function assign_item_code() returns trigger as $$
declare
  vcode text;
  seq integer;
begin
  if new.item_code is not null then
    return new;
  end if;
  -- Single statement: locks the shop row, so concurrent inserts for the same
  -- shop serialize here and can't hand out the same number twice.
  update shops set item_seq = item_seq + 1
  where id = new.shop_id
  returning item_seq, vendor_code into seq, vcode;

  if vcode is null then
    raise exception 'assign_item_code: shop % has no vendor_code', new.shop_id;
  end if;
  new.item_code := vcode || '-' || lpad(seq::text, 4, '0');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Named to sort after garments_limit so a garment rejected by the plan cap
-- doesn't burn a sequence number on its way out.
drop trigger if exists garments_zz_item_code on garments;
create trigger garments_zz_item_code before insert on garments
  for each row execute function assign_item_code();

-- ── immutability ────────────────────────────────────────────────────────────
-- One function per table, deliberately. A single shared function guarded by
-- tg_table_name does NOT work: PL/pgSQL compiles the whole IF condition into
-- one expression against the record type, so `new.item_code` fails to resolve
-- on a shops row before the tg_table_name guard can short-circuit it.
create or replace function freeze_vendor_code() returns trigger as $$
begin
  if new.vendor_code is distinct from old.vendor_code then
    raise exception 'vendor_code is immutable (printed on tags)';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function freeze_item_code() returns trigger as $$
begin
  if new.item_code is distinct from old.item_code then
    raise exception 'item_code is immutable (printed on tags)';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists shops_freeze_code on shops;
create trigger shops_freeze_code before update on shops
  for each row execute function freeze_vendor_code();

drop trigger if exists garments_freeze_code on garments;
create trigger garments_freeze_code before update on garments
  for each row execute function freeze_item_code();

drop function if exists freeze_codes();

-- ── lookup index ────────────────────────────────────────────────────────────
-- Vendors type codes in any case; match on upper() so the index is usable.
create index if not exists garments_item_code_upper_idx on garments (upper(item_code));

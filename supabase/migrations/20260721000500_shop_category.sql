-- What the shop sells.
--
-- shops.type answers one question — does this shop get try-on — and that stays
-- the enforcement flag inside consume_tryon. This column answers a different
-- one: what kind of business is it. They're separate on purpose. A category
-- picks the *default* type at signup, but an admin can grant try-on to a
-- footwear shop, or revoke it from a clothing shop, without rewriting what the
-- shop says it sells.
--
-- Existing shops are all clothing shops, so the default grandfathers them and
-- keeps them consistent with the 'apparel' type they already got from
-- 20260721000300.

alter table shops add column if not exists category text not null default 'clothing'
  check (category in (
    'clothing', 'footwear', 'jewellery', 'beauty', 'electronics',
    'home', 'grocery', 'sports', 'books', 'other'
  ));

create index if not exists shops_category_idx on shops (category);

-- Same belt-and-braces convergence as 20260721000400: `if not exists` skips a
-- column that already exists, so make sure it ends up populated either way.
update shops set category = 'clothing' where category is null;

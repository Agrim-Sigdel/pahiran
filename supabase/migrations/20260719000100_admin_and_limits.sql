-- Admin top-up helper + per-plan garment-count enforcement.
-- Run in the Supabase SQL editor.

-- Grant extra headroom in the CURRENT period (used by the admin view to fulfil
-- a credit top-up request). Lowering *_used raises what's left.
create or replace function grant_credits(p_shop_id uuid, p_tryons integer, p_studio integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update shop_subscriptions set
    tryons_used = greatest(tryons_used - coalesce(p_tryons, 0), 0),
    studio_used = greatest(studio_used - coalesce(p_studio, 0), 0)
  where shop_id = p_shop_id;
end $$;

-- Enforce the shop's plan garment cap on insert. null max_garments = unlimited.
create or replace function enforce_garment_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim integer;
  cnt integer;
begin
  select p.max_garments into lim
    from shop_subscriptions s
    join plans p on p.id = s.plan_id
    where s.shop_id = new.shop_id;
  if lim is null then
    return new; -- unlimited plan, or no subscription row yet
  end if;
  select count(*) into cnt from garments where shop_id = new.shop_id;
  if cnt >= lim then
    raise exception 'garment_limit_reached'
      using errcode = 'check_violation',
            hint = 'Upgrade the shop plan to add more garments.';
  end if;
  return new;
end $$;

drop trigger if exists garments_limit on garments;
create trigger garments_limit before insert on garments
  for each row execute function enforce_garment_limit();

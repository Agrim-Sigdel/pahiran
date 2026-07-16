-- Plan payments (Khalti / eSewa). Depends on plans + shop_subscriptions from
-- 20260716_plans_credits.sql. Run in the Supabase SQL editor.

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  plan_id text not null references plans (id),
  provider text not null,                 -- 'khalti' | 'esewa'
  amount_npr integer not null,
  status text not null default 'pending', -- pending | paid | failed
  provider_ref text,                      -- khalti pidx / esewa transaction_uuid
  transaction_id text,                    -- provider's final settlement id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_shop_idx on payments (shop_id, created_at desc);
create index if not exists payments_ref_idx on payments (provider_ref);

alter table payments enable row level security;

-- Vendors see their own payment history; all writes are service-role only.
drop policy if exists "own payments read" on payments;
create policy "own payments read" on payments
  for select using (shop_id in (select id from shops where owner = auth.uid()));

-- Switch a shop to a plan and start a fresh 30-day period. Called by the
-- server after a verified payment (idempotent per subscription row).
create or replace function activate_plan(p_shop_id uuid, p_plan_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into shop_subscriptions (shop_id, plan_id, status, period_start, period_end, tryons_used, studio_used)
    values (p_shop_id, p_plan_id, 'active', now(), now() + interval '30 days', 0, 0)
    on conflict (shop_id) do update set
      plan_id = excluded.plan_id, status = 'active',
      period_start = now(), period_end = now() + interval '30 days',
      tryons_used = 0, studio_used = 0;
end $$;

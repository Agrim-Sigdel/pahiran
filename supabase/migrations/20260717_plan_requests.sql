-- Manual-billing inbox: vendors REQUEST a plan upgrade or a credit top-up and
-- the admin fulfils it by hand (run activate_plan / adjust shop_subscriptions).
-- Used while live Khalti/eSewa checkout is dormant. Run in the SQL editor.

create table if not exists plan_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops (id) on delete cascade,
  kind text not null default 'plan',   -- 'plan' | 'credits'
  plan_id text references plans (id),  -- set for plan-upgrade requests
  note text,
  status text not null default 'open', -- open | done
  created_at timestamptz not null default now()
);

create index if not exists plan_requests_open_idx on plan_requests (status, created_at desc);

alter table plan_requests enable row level security;

-- Vendors create + read their own requests; the admin reads all via service role.
drop policy if exists "own plan_requests read" on plan_requests;
create policy "own plan_requests read" on plan_requests
  for select using (shop_id in (select id from shops where owner = auth.uid()));

drop policy if exists "own plan_requests insert" on plan_requests;
create policy "own plan_requests insert" on plan_requests
  for insert with check (shop_id in (select id from shops where owner = auth.uid()));

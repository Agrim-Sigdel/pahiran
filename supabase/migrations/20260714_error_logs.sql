-- Migration for projects that already ran schema.sql before 2026-07-14.
-- Idempotent: safe to re-run. New installs get this via schema.sql.

create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,               -- 'tryon-api' | 'kiosk' | 'dashboard' | ...
  message text not null,
  detail jsonb,
  shop_id uuid,
  created_at timestamptz not null default now()
);

-- Service-role only (no policies): written by the server, read in the
-- Supabase dashboard when debugging.
alter table error_logs enable row level security;

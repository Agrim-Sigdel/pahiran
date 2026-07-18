-- Hardening: generalize rate_limits from per-IP-only to arbitrary bucket keys
-- ("tryon:ip:1.2.3.4", "tryon:global:2026-07-14", "lead:ip:…", "log:ip:…").
-- Idempotent: renames only when the old column is still present.
-- New installs get this via schema.sql.

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'rate_limits' and column_name = 'ip') then
    alter table rate_limits rename column ip to key;
  end if;
end $$;

-- Hardening: generalize rate_limits from per-IP-only to arbitrary bucket keys
-- ("tryon:ip:1.2.3.4", "tryon:global:2026-07-14", "lead:ip:…", "log:ip:…").
-- Run in the Supabase SQL editor. New installs get this via schema.sql.

alter table rate_limits rename column ip to key;

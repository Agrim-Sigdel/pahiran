-- Privacy: try-on renders of a shopper's body/face move to a PRIVATE bucket,
-- served only via short-lived signed URLs. Previously studio results went to
-- the public 'garments' bucket and quick results were public provider URLs.
-- Run in the Supabase SQL editor. New installs get this via schema.sql.

-- Private bucket (public = false → no anonymous read; access is signed-URL only).
insert into storage.buckets (id, name, public)
  values ('results', 'results', false)
  on conflict (id) do nothing;

-- The cached render now lives at a storage path we re-sign on each read.
-- result_url is kept for backward compatibility with rows created before this.
alter table tryon_results add column if not exists result_path text;

-- No storage.objects policies for 'results': the server (service role) uploads
-- and signs; nobody else can read it.

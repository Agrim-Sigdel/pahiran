-- Lower the Free tier to 50 try-ons / 5 studio finishes, and harden the manual
-- billing inbox against junk rows. Run in the Supabase SQL editor.

update plans set tryon_limit = 50, studio_limit = 5 where id = 'free';

-- plan_requests: only the two known kinds, and a bounded note.
alter table plan_requests
  drop constraint if exists plan_requests_kind_chk,
  add constraint plan_requests_kind_chk check (kind in ('plan', 'credits'));

alter table plan_requests
  drop constraint if exists plan_requests_note_len_chk,
  add constraint plan_requests_note_len_chk check (note is null or char_length(note) <= 200);

-- At most one OPEN request of each kind per shop — blocks duplicate-spam.
create unique index if not exists plan_requests_one_open
  on plan_requests (shop_id, kind) where status = 'open';

# Environments

Two isolated deployments, each with its own Supabase project. No code differs
between them — every Supabase reference in the app reads
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY`, so which database you hit is purely an env-var
question.

| | branch | Supabase project | payments |
|---|---|---|---|
| **production** | `main` | `pahiran` | live Khalti + eSewa |
| **staging** | `stage` | `pahiran-stage` | sandbox |

Staging exists so schema changes and payment-flow work can be exercised against
real auth, storage and RLS without touching vendor or shopper data.

## Bootstrapping a fresh Supabase project

### 1. Schema

`supabase/schema.sql` is a **consolidated snapshot**, not a starting point that
migrations build on. It already contains every object from the migrations up to
and including `20260719000100_admin_and_limits.sql` — all tables, the `plans` /
`shop_subscriptions` pair, and the `ensure_subscription`, `consume_tryon`,
`refund_tryon`, `incr_rate_limit`, `activate_plan`, `grant_credits` and
`enforce_garment_limit` functions.

In the SQL editor, run the snapshot, then **every migration dated after it**, in
filename order:

```
supabase/schema.sql
supabase/migrations/20260720000100_shopper_accounts.sql
supabase/migrations/20260720000200_item_codes.sql
supabase/migrations/20260721000100_admin_console.sql
supabase/migrations/20260721000200_shop_owner_unique.sql
supabase/migrations/20260721000300_shop_type.sql
supabase/migrations/20260721000400_shop_type_backfill.sql
supabase/migrations/20260721000500_shop_category.sql
supabase/migrations/20260726000100_fabrics_styles.sql
supabase/migrations/20260726000200_compositions.sql
supabase/migrations/20260726000300_fabric_note_and_style_check.sql
supabase/migrations/20260726000400_wearable_compositions.sql
supabase/migrations/20260726000500_style_coverage_and_notes.sql
supabase/migrations/20260726000600_editable_cuts.sql
```

The rule is "snapshot, then everything newer" — not a fixed list. `schema.sql`
folds in migrations only up to `20260719000100`, so anything dated later is
genuinely missing from a fresh project. When you fold newer migrations into the
snapshot (see below), shorten this list to match.

Do **not** replay migrations dated *before* the snapshot. Most of their
statements are idempotent (`create table if not exists`, `create or replace
function`), but the 17 `create policy` statements in `schema.sql` are not —
Postgres has no `create policy if not exists`, so a replay aborts on the first
duplicate.

Storage buckets come from that SQL too: `garments`, `fabrics`, `styles` and
`renders` (public read), and `results`, `looks`, `shopper-photos` (private,
signed-URL access only).

> One statement can fail on a locked-down project: `20260726000200` creates a
> policy on `storage.objects`, which is owned by `supabase_storage_admin`. It's
> wrapped so an ownership error is caught and skipped rather than rolling back
> the whole migration — the `renders` bucket is public, so reads still work.

### 2. Auth

Not covered by SQL — configure by hand in the new project:

- **Authentication → URL Configuration**: set Site URL to the environment's
  domain, and add `<domain>/**` as a redirect URL. Magic links and confirmation
  emails land on the wrong host otherwise.
- **Authentication → Email Templates**: paste in
  `supabase/email-templates/confirm-signup.html`.

Google OAuth is deferred on both environments (see the note in `.env.example`).

### 3. Environment variables

Set the three Supabase vars per environment. On Vercel that means scoping them
to **Production** and **Preview** separately in Project Settings → Environment
Variables; `main` deploys then read prod and `stage` deploys read staging, with
no branching logic in the app.

The complete per-environment sets live in `.env.stage.local` and
`.env.prod.local` (both gitignored) and can be imported into Vercel directly.
`.env.stage.example` is the committed template — keep it in sync when you add a
var, and never put real values in it. `.env.local` stays as the local-dev file.

These non-Supabase vars must also diverge — see `.env.example` for what each
one means:

| var | why it differs |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | builds payment return/callback URLs; wrong value sends gateway redirects to prod |
| `ALLOWED_ORIGINS` | `/api/tryon` and `/api/lead` reject cross-site calls from unlisted hosts. Staging uses `*`, which disables the guard so rotating Vercel preview URLs work; production must list real hostnames only |
| `KHALTI_*`, `ESEWA_*` | staging stays on sandbox credentials so no real money moves |
| `TRYON_DAILY_CAP` | fal.ai bills one account regardless of environment; keep staging low |
| `FAL_KEY` | issue a second key for staging so its spend is traceable and separately revocable |

`ADMIN_EMAILS` can stay the same in both.

### 4. Seed data

`npm run seed` builds a demo store from photos in `images/`. Safe and useful on
staging; never run it against production.

## Adding a migration

1. Write it as a new timestamped file in `supabase/migrations/`.
2. Apply it to staging first and exercise the affected flows.
3. Apply the same file to production.
4. Periodically fold the applied migrations into `supabase/schema.sql` and bump
   the "folds in every migration up to" line in its header. That header is the
   only record of which migrations are already inside the snapshot — if it goes
   stale, bootstrapping a new project silently breaks.

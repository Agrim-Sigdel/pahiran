# Security & Scale Remediation Plan

**Status:** open · **Created:** 2026-07-30 · **Source:** full-codebase security + scale audit (six investigations, cross-confirmed)

This document is the fix plan for the audit. It is ordered by priority: **P0** must ship before real traffic, **P1** before scaling marketing, **P2/scale/cleanup** as fast-follows. Each item has a severity, the exact location, why it matters, and a concrete fix. Check items off as they land.

> **The one-paragraph summary.** The application code is disciplined and mostly correct — strong table RLS, private buckets, server-side pricing, atomic metering, no leaked secrets. The real risk is concentrated in **the Postgres layer being a second, unlocked front door**: privileged `SECURITY DEFINER` functions and one over-broad `shops` policy are reachable directly with the public anon key, bypassing every `/api/*` check. The single P0 migration below closes the worst of it.

---

## P0 — Critical (ship first)

### ☐ P0-1 · Revoke execute on privileged RPCs (anon can currently call them)
**Where:** `supabase/schema.sql` + migrations; there is **no `REVOKE` anywhere** except one deliberate `grant` at `20260721000300_shop_type.sql:141`.
**Why:** Postgres grants `EXECUTE` to `PUBLIC` by default and Supabase exposes every `public` function as `POST /rest/v1/rpc/<fn>`. With only the browser-shipped anon key, an attacker can call:
`activate_plan` (free Pro plan), `grant_credits` (unlimited credits), `set_shop_status` (self-approve / suspend a competitor), `consume_tryon`/`consume_compose` (drain a rival's allowance), `refund_tryon`/`refund_compose` (free generations).
**Verified safe:** all 9 server `.rpc()` calls run under the service role; **no browser code calls any RPC** except `shop_tryon_availability`. So revoking from `anon`/`authenticated` breaks nothing.

**Fix — new migration `supabase/migrations/20260730000100_lock_down_rpcs.sql`:**
```sql
-- Close the PostgREST RPC front door. anon/authenticated inherit EXECUTE from
-- PUBLIC by default; revoke it, keep the service role working, and re-grant only
-- the one function the storefront legitimately calls as anon.
revoke execute on all functions in schema public from public, anon, authenticated;

-- The server calls every privileged RPC under the service role — keep it working.
grant execute on all functions in schema public to service_role;

-- The only deliberately-anon RPC: returns derived booleans only (see 20260721000300:100).
grant execute on function shop_tryon_availability(uuid) to anon, authenticated;

-- Any SECURITY DEFINER function added later is NOT auto-exposed.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
```
> ⚠️ **Test in staging first.** Supabase role-grant defaults vary by project age. After applying, (a) confirm the app's try-on, billing, and admin flows still work (they run as `service_role`), and (b) verify the hole is closed with the anon key:
> ```bash
> curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/grant_credits" \
>   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"p_shop_id":"<any-shop-uuid>","p_tryons":1,"p_studio":0}'
> # expect 401/403/404 — NOT 200/204
> ```

### ☐ P0-2 · Lock the `shops` status columns against vendor writes
**Where:** `supabase/schema.sql:114` — `create policy "own shop" on shops for all ...`. `for all` covers UPDATE on every column, including `status` (added later at `20260721000100_admin_console.sql:12`).
**Why:** a vendor runs `supabase.from('shops').update({status:'approved'}).eq('id', myShop)` in devtools and bypasses the entire admin approval gate — going live, gaining try-on entitlement, and undoing suspensions. (`type`/`listed` self-writes become harmless once `status` is locked, because `consume_tryon` requires `status='approved'` which the vendor can no longer self-grant.)
**Verified safe:** the client's `saveShop` (`src/lib/storage.ts:133`) writes `name/area/whatsapp/listed/lat/lng/type/category` and `updateShopSlug` writes `slug` — never `status`. Column-revoking the status set breaks nothing. `set_shop_status` is `SECURITY DEFINER`, so it bypasses the column grant and still works for admins.

**Fix — add to the same migration:**
```sql
revoke update (status, status_note, status_changed_at, vendor_code, item_seq)
  on shops from authenticated;
```
**Follow-up (P2):** move the `listed` toggle behind a check on `plans.listed_allowed`, and decide whether `type` changes after approval should re-trigger review (today they don't, but a locked `status` blocks the abuse).

### ☐ P0-3 · eSewa: fail closed instead of using the public test secret
**Where:** `src/lib/billing.ts:120` — `esewaSecret = () => process.env.ESEWA_SECRET || "8gBm/:&EnhH.1/q("`.
**Why:** that default is eSewa's **published UAT secret**. Verification is fully local (no server-to-server confirmation). If prod sets `ESEWA_BASE` but forgets `ESEWA_SECRET`, anyone can self-sign a `COMPLETE` payload for their own pending payment and activate a plan for zero rupees.
**Fix:**
1. Throw when the secret is missing in production:
   ```ts
   const esewaSecret = () => {
     const s = process.env.ESEWA_SECRET;
     if (!s) {
       if (process.env.NODE_ENV === "production")
         throw new Error("ESEWA_SECRET is required in production");
       return "8gBm/:&EnhH.1/q("; // UAT sandbox only
     }
     return s;
   };
   ```
2. In `esewaVerify` (`billing.ts:159`), pin `signed_field_names` to the expected set instead of trusting the payload, and verify the decoded `product_code === esewaProductCode()`.
3. Add the server-to-server status check via the already-named-but-unused `ESEWA_STATUS_BASE` before activating.

---

## P1 — High

### ☐ P1-1 · Try-on renders are undeletable and kept forever
**Where:** `tryon_results` + private `results` bucket; `clearAllLooks()` (`src/lib/looks.ts:243`) never touches them, and `tryon_results` has **no `user_id`**.
**Why:** these are generated images of the shopper's body; "delete everything" doesn't delete them, and they can't even be located per-user for a deletion request. This regresses the cloud-likeness privacy commitment.
**Fix:** add `user_id uuid` (and/or `session_id`) to `tryon_results`; include it in the delete-everything path; add a retention sweep (see Scale-3).

### ☐ P1-2 · `category` is injected unbounded into the paid image prompt
**Where:** `src/app/api/tryon/route.ts:229` (`subject = category`) → `src/lib/studio.ts:91`.
**Why:** prompt-injection + guaranteed paid generation billed to the **victim garment's** shop; each distinct string is a fresh cache key. Contrast `/api/counter`, which caps its prompt at 400 chars.
**Fix:** cap length (`category.slice(0, 60)`) and validate against the known category set; prefer deriving `subject` server-side from the garment's own metadata, as `/api/compose` does.

### ☐ P1-3 · Rate-limit identity is spoofable
**Where:** `src/lib/ratelimit.ts:45` — trusts the leftmost `X-Forwarded-For`.
**Why:** `lead:ip:`, `log:ip:`, `tryon:ip:` limits are all bypassable by rotating the header; `/api/lead` has no other control against inbox flooding.
**Fix:** use the platform's real client IP. On Vercel, take the rightmost trusted hop or `request.ip`; never the raw leftmost XFF.

### ☐ P1-4 · `/api/log` — unauthenticated, no origin guard, caller-chosen shop
**Where:** `src/app/api/log/route.ts:19,35`.
**Why:** any site writes unbounded service-role rows into `error_logs`; `shop_id` is attacker-chosen, so forged errors appear in any vendor's dashboard (log injection / false evidence). It's the only route with no `badOrigin()`.
**Fix:** add `badOrigin(req)`, drop or validate the client `shop_id` (must belong to the caller or be null), and combine with P1-3.

### ☐ P1-5 · `public fabrics read` / `public styles read` leak vendor internals
**Where:** `20260726000100_fabrics_styles.sql:234` (fabrics) and `:203` (styles).
**Why:** unlike `compositions` (gated on `published AND status='ready'`), `fabrics`/`styles` have no publication gate, so anon `select *` returns internal `note`, `correction`, `prompt_hint`, `price_npr`, and stock — one-query competitor scraping.
**Fix:** gate these reads on a publication flag, or expose only public columns through a view and keep the internal columns behind the owner policy.

### ☐ P1-6 · Vendor can inject an arbitrary composition `image_url` and skip the compose meter
**Where:** `20260726000200_compositions.sql:169` (`own compositions for all`, no column/status constraint) → trusted at `src/app/api/tryon/route.ts:243`.
**Why:** a vendor inserts `{status:'ready', published:true, image_url:'https://attacker/x'}` directly — `compose_used` never moves (meter bypass), and the try-on route then fetches that URL as the paid garment input, defeating the "catalog's own URL only" guarantee (also the SSRF vector in P2-4).
**Fix:** `with check` constraining `image_url` to your `renders` storage prefix, and constrain `status`/`published` so only `consume_compose`/`saveCounterRun` can publish. Keep `saveCounterRun` (`storage.ts:917`) working by matching its URL shape.

---

## P2 — Medium (money, spend-control, correctness)

### ☐ P2-1 · eSewa amount check breaks on thousands separators
`src/app/api/billing/esewa/verify/route.ts:31` — `parseFloat("3,000.0") === 3`; every plan is ≥1000, so a genuinely-paid upgrade is rejected and flipped to `failed` **after the customer paid**. Strip separators before comparing.

### ☐ P2-2 · Payment idempotency is a read-then-write race
Both verify routes check `status==='paid'` then update unconditionally; two concurrent callbacks both run `activate_plan` (re-zeroing usage, extending the period). Fix with a conditional update:
```ts
const { data } = await sb.from("payments")
  .update({ status: "paid", transaction_id, updated_at })
  .eq("id", pay.id).eq("status", "pending").select("id").maybeSingle();
if (data) await activatePlan(sb, pay.shop_id, pay.plan_id); // only the winner activates
```

### ☐ P2-3 · `appOrigin()` trusts the `Host` header
`src/lib/billing.ts:26` — when `NEXT_PUBLIC_SITE_URL` is unset, a forged `Host` turns the gateway callbacks and verify redirects into an open redirect. Require `NEXT_PUBLIC_SITE_URL` in production.

### ☐ P2-4 · SSRF via vendor-written image URLs
`src/lib/compose.ts:77`, `src/lib/studio.ts:118` fetch `fabrics.image_url` / `styles.ref_image_url` / `compositions.image_url` with no scheme allowlist, private-IP block, timeout, or size cap; failure text lands in `error_logs` the vendor reads back → host/port oracle. Allowlist `https`, block link-local/RFC-1918, add a timeout + size cap. (P1-6 also constrains the source.)

### ☐ P2-5 · Meters fail *open* when the RPC is missing
`src/lib/plan.ts:61,103` — an unapplied/dropped migration silently disables billing **and** the approval gate; the `does not exist` regex is broad. Narrow the match; consider failing closed once migrations are guaranteed applied (see Cleanup-4 migration ledger).

### ☐ P2-6 · `failClosed` is a no-op — the "money circuit-breaker" fails open
`src/lib/ratelimit.ts:31` accepts `_opts` and ignores it, yet `src/app/api/tryon/route.ts:335` comments "fail closed so a DB blip can't leak spend." On a DB blip the global daily cap degrades to per-instance in-memory (real cap = N×instances). Honor `failClosed` (block on DB error for the global cap), or delete the param and correct the comment.

### ☐ P2-7 · Paid calls run before cheap checks; `counter`/`compose` lack caps
- `/api/tryon`: OpenAI moderation (`:320`) runs before the per-IP limit (`:328`) — reorder so the cheap limit gates first.
- `/api/counter`: **no per-IP limit at all**, and it increments the shared 500/day global bucket even on calls later refused by the meter — one over-quota vendor can exhaust everyone's try-on budget. Add a `counter:ip:` limit and only touch the global bucket after the meters reserve.
- `/api/compose`: add a `compose:global:<day>` cap (it has none).

### ☐ P2-8 · No request body-size limit
`/api/counter` accepts three 4 MB data URLs (~12 MB JSON buffered before any auth check) on a `maxDuration=300` function. Add an explicit size guard before/around `req.json()`.

### ☐ P2-9 · Admin identity skips email confirmation
`src/lib/admin.ts:39` — check `data.user.email_confirmed_at` before honoring the `ADMIN_EMAILS` match, so an unconfirmed registration of an admin address can't take the console.

### ☐ P2-10 · No security headers
No `middleware.ts` and no `headers()` in `next.config.mjs`. Add CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY` (dashboard/checkout clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` via `next.config.mjs` `headers()` or a middleware.

### ☐ P2-11 · Raw DB/gateway errors returned to clients
`src/app/api/compose/route.ts:77`, `src/app/api/billing/initiate/route.ts:73` (echoes Khalti's raw body), and the admin routes. Log server-side; return generic messages.

---

## Scale — will it hold at ~1M users?

### ☐ Scale-1 · Missing foreign-key indexes → deletes become full scans
Add covering indexes for: `tryon_events.garment_id`, `tryon_results.shop_id`, `tryon_results.composition_id`, `leads.garment_id`, `saved_looks.shop_id`, `saved_looks.garment_id`, `saved_looks.composition_id`, `composition_parts.{garment_id,fabric_id,style_id}`, `shop_disabled_styles.style_id`, `plan_requests.shop_id`, and a plain `error_logs (shop_id, created_at desc)` (see Scale-5). Deleting one garment currently scans every shopper's saved looks and the whole render cache.

### ☐ Scale-2 · `auth.uid()` re-evaluated per row (~14 policies)
Rewrite `... where owner = auth.uid()` as `... where owner = (select auth.uid())` throughout `schema.sql` and the RLS migrations so the planner hoists it to an InitPlan instead of a per-row nested loop — the documented Supabase performance anti-pattern.

### ☐ Scale-3 · No retention/cleanup on unbounded tables
`rate_limits` (a row per IP forever), `tryon_events`, `error_logs`, `tryon_results` + the `results` bucket have no cleanup. Add scheduled purges (Supabase `pg_cron`):
```sql
select cron.schedule('purge-rate-limits','*/30 * * * *',
  $$delete from rate_limits where reset_at < now() - interval '1 day'$$);
-- plus TTL sweeps for tryon_events / error_logs / stale results renders
```
Add an index on `rate_limits (reset_at)` to serve the purge.

### ☐ Scale-4 · Admin search & counts break past the first page
`/api/admin/users` and `/api/admin/shops` filter `role`/`q` in JS over one fetched page, count garments by pulling every row, and resolve owner emails by sweeping ≤4000 `auth.users` (`emailsFor`, `src/lib/admin.ts:89`) — beyond which emails resolve to `""`. Push search/counts into SQL/RPC; denormalize email into `profiles` and a `garment_count` onto `shops`.

### ☐ Scale-5 · `error_logs` unindexed + attacker-sized
No index on `shop_id`/`created_at`, so the vendor dashboard's `.eq(shop_id).order(created_at).limit(50)` is a full scan + sort of a table whose size an unauthenticated caller controls (P1-4). Add the index and fix P1-4.

### ☐ Scale-6 · No bucket size/MIME limits; unbounded `shopper_bags` jsonb
Set `file_size_limit` + `allowed_mime_types` on all 7 buckets. Add `check (pg_column_size(cart) < 65536)` (and wishlist) on `shopper_bags`, plus a length cap / FK on the free-text `shop_slug`.

### ☐ Scale-7 · Nominatim called directly from the browser
`src/components/LocationPicker.tsx:107` — no debounce/throttle; at scale users' IPs get blocked per OSM's 1 req/s policy. Proxy through a `/api/geocode` route with a real `User-Agent`, a server rate limit (reuse `overLimit`), and a short cache.

---

## Privacy

### ☐ Priv-1 · Customer face persists in the shop tablet's localStorage
`src/components/CounterTryOn.tsx:85` writes the counter try-on image (customer's face, as a data URL) to `localStorage["peeq-counter-recent"]` with no TTL and no wipe on sign-out — while the UI (`:452`) promises "the photo stays private to this shop." Add a short TTL on read (`readRecent`) and include the key in the sign-out / idle wipe.

---

## Consistency & backend cleanup

### ☐ Cleanup-1 · De-duplicate helpers
`serviceClient()` (`billing.ts:13` vs `tryon/route.ts:50` + inlined in lead/log), `dailyCap()`, `MAX_IMAGE_CHARS`, route-local `logError()`, `bearer()`, `openaiKey()`, and the admin email `contact@agrimsigdel.com.np` (hardcoded in **6** files). Extract each into `src/lib/` and import.

### ☐ Cleanup-2 · Re-fold `schema.sql` and fix its header
The snapshot claims it folds through `20260719000100` but already carries newer `leads` columns while **missing** `composition_id` on `tryon_results`/`tryon_events`/`leads`, the `shops` `status`/`type`/`vendor_code` columns, `compose_limit`/`compose_used`, and whole feature tables (`compositions`, `fabrics`, `styles`, `saved_looks`, `admin_actions`, shopper accounts). Re-fold cleanly and correct the header date. This also removes the duplicate-CHECK-constraint drift on `leads`/`plan_requests`.

### ☐ Cleanup-3 · Update `docs/environments.md` bootstrap list
It ends at `20260726000600` and omits the five newest migrations — a fresh bootstrap from the docs is missing `fabrics.colors`, `fabrics.correction`, `compositions.approved`, and `leads.composition_id`.

### ☐ Cleanup-4 · Adopt a migration ledger
Migrations are hand-run with no `schema_migrations` tracking, so "what's applied where" is unknowable (two existing files are already repair-migrations for edited-after-apply files). Move to the Supabase CLI migration flow.

### ☐ Cleanup-5 · Decommission the retired studio meter
`src/lib/plan.ts:8` documents it as retired, but `studioLeft` is still produced and rendered in the admin UI (`src/app/admin/shops/page.tsx:241`) and in the vendor plan comparison — showing an entitlement that no longer exists. Remove it, or hide it explicitly.

### ☐ Cleanup-6 · Settle on one product name
Code is split across **peeq** (UI), **Pahiran** (package + `pahiran:` localStorage prefixes), and **EasyFitCheck** (`STATUS.md`). Pick one.

### ☐ Cleanup-7 · Misc
- `profiles.role`: add `check (role in ('shopper','vendor'))` (`20260720000100:11`); today inert (admin is env-based) but a self-promotion trap for any future feature that trusts it.
- `own garments` is `for all`, so a suspended shop can still re-price its catalog (triggers are INSERT-only). Add an approval check to updates if that matters.
- `consume_tryon` null-propagation branch fails open (`allowed=true` with null counters) if the subscription row is missing — add `if sub is null then return false`.
- Delete/relocate root scratch docs (`ARCHITECTURE_REVIEW.md`, `CHANGES.md`, `UX_AUDIT.md`, `STATUS.md`, `peeq-brand-direction.html`) into `docs/`; rewrite the stale `STATUS.md`.
- Collapse the vestigial `result_url` dual cache path; drop or document `APP_URL`.
- Add `import "server-only"` to `billing.ts` / `compose.ts` / `studio.ts` / `admin.ts` so an accidental client import becomes a build error.

---

## Suggested sequencing

1. **P0-1 + P0-2** in one migration (`20260730000100_lock_down_rpcs.sql`) — closes self-provisioning and self-approval together. Test in staging with the anon-key curl check.
2. **P0-3** (eSewa fail-closed) — one file, ships independently.
3. **P1** batch — renders retention/deletion, `category` cap, real client-IP, `/api/log` guard, fabrics/styles read gate, composition `image_url` constraint.
4. **Scale-1/2/3/5** — indexes, `(select auth.uid())`, purge jobs (all low-risk SQL, big payoff).
5. **P2** correctness batch (payment idempotency + eSewa amount parsing first — they touch real money).
6. **Cleanup** as capacity allows; **Cleanup-2/3/4** (schema drift + ledger) before onboarding a second environment.

## What NOT to touch (already correct)

All 20 tables have RLS enabled. Payment integration is genuinely careful (server-side pricing, authoritative Khalti lookup, eSewa HMAC+status, idempotent) — only undermined by the reachable RPCs (P0-1). Credit metering is race-safe (`SELECT … FOR UPDATE`, single-statement upserts). All 14 `SECURITY DEFINER` functions set `search_path`. Private buckets are correctly per-uid scoped. Admin is an env allowlist (not a DB role) with every mutation audited. XSS sinks are escaped. No secrets are committed or exposed to the browser.

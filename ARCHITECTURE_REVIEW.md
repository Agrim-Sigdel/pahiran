# peeq — architecture & code review

_27 July 2026. Companion to [`UX_AUDIT.md`](UX_AUDIT.md) / [`UX_FIXES.md`](UX_FIXES.md),
which cover the interface. This one covers everything underneath it: design-system
mechanics, component architecture, API safety, data model, tooling._

Scope: 98 files, ~20,800 lines, 34 routes.

---

## The honest summary

This is a well-designed codebase carrying an unusual amount of *recorded reasoning* —
`globals.css` alone explains why a token exists, what broke before it did, and what
must never read it. That's rare and genuinely valuable; most of this review is about
the gap between how carefully the system was **designed** and how loosely it is
**enforced**.

The three structural problems, in order of what they cost:

1. **The design system is documented but not enforced.** 1,106 lines of tokens
   against 1,381 inline `style={{}}` objects. The system is advisory.
2. **Nothing is checked automatically.** No linter, no tests, no migration runner.
   `tsc --noEmit` is the entire gate on a codebase that spends money per request.
3. **The dual-mode (localStorage / Supabase) split has outlived its purpose** and now
   taxes every storage function, plus a dozen "un-migrated project" fallbacks.

Everything below is ranked by cost-to-fix ÷ value.

---

## 1 · Design patterns

### 1.1 The token system is bypassed by the app that defines it — **biggest issue**

| | |
|---|---|
| `globals.css` | 1,106 lines, ~60 tokens, a documented surface ramp, semantic status colours, a radius scale, a z-index ladder |
| Actual usage | **1,381 inline `style={{}}` literals** across 45 client components |
| Worst offenders | `Dashboard.tsx` 168 · `CounterTryOn.tsx` 120 · `KioskV2.tsx` 115 · `storefront.tsx` 114 |

Four concrete consequences, not stylistic objections:

- **Inline styles cannot express `:hover`, `:focus-visible`, `@media`, or
  `prefers-reduced-motion`.** The carefully-narrowed reduced-motion block at
  `globals.css:995` can only reach elements styled by *class*. Anything styled inline
  is invisible to it.
- **27 of 232 `<button>`s carry no `className`** and therefore get no focus ring —
  `.ph-btn:focus-visible` can't reach them. (The other 205 do use `.ph-btn`, which is
  why this is 27 bugs and not 232.)
- **Tokens are untyped strings in JS.** `var(--card)` is just text; a typo renders as
  nothing. This is precisely the failure mode `UX_FIXES.md` documents from the retired
  `--camel` / `--mut` aliases — the mechanism that caused it is still fully in place.
- **Every render allocates fresh style objects**, so any child receiving one as a prop
  can never memoize.

**Fix — incremental, no big-bang rewrite:**

1. Pull the ~20 recurring inline shapes into classes next to the ones that already
   exist (`.panel`, `.field`, `.sheet` prove the pattern works): `.stat-tile`,
   `.meta`, `.price`, `.row`, `.card-actions`, `.empty`.
2. Adopt **CSS Modules** for new component work — Next supports them with zero config,
   they keep styles beside the component, and they restore pseudo-classes and media
   queries.
3. If tokens must be reached from JS, export them once as typed constants
   (`export const ink = "var(--ink)"`) so a typo is a compile error.
4. Migrate one file per PR, highest-inline-count first. `Dashboard.tsx` alone removes
   12% of the problem.

### 1.2 God components and prop-relay pages

| File | Lines |
|---|---|
| `components/Dashboard.tsx` | 1,330 (≈30 props) |
| `components/KioskV2.tsx` | 1,235 |
| `lib/storage.ts` | 1,205 |
| `components/CounterTryOn.tsx` | 1,003 |
| `components/FabricStudio.tsx` | 721 |
| `components/storefront.tsx` | 655 |

`app/dashboard/page.tsx` is a pure relay: it loads six datasets and forwards ~30
callbacks into one component. Every new dashboard feature widens that interface.

**Fix — the seams already exist:**

- `Dashboard.tsx` is already organised by tab, and `OverviewTab` / `LeadsTab` /
  `PlanTab` are already extracted. Finish the job: `CatalogTab`, `FabricsTab`,
  `DesignsTab`, `SettingsTab`. Target ~200 lines each.
- Replace the prop relay with a `useShopData()` hook owning the six loaders and their
  mutators. Each tab calls it directly; `page.tsx` becomes a guard plus a layout.
- `storage.ts` splits cleanly along its own comment banners —
  `storage/shop.ts`, `catalog.ts`, `fabrics.ts`, `compositions.ts`, `counter.ts`,
  `leads.ts`, `plan.ts`. Same public API, seven files of ~170 lines.

### 1.3 Client-rendering the two surfaces that most need speed

45 files are `"use client"`. Only 9 route files are server components — and they're the
public ones (landing, storefront, product, privacy, owner). `/dashboard`, `/account`,
`/kiosk`, `/admin` all follow: ship JS → mount → check session → fetch → render.

That's the slow path on a shop's 3G tablet, for the surfaces used every day.

**Fix:** `app/s/[slug]/page.tsx` already demonstrates the correct pattern — server-fetch,
then hydrate a client island with `initialShop` / `initialCatalog`. Apply it to
`/dashboard` and `/account`.

---

## 2 · API & security

### 2.1 Paid moderation runs *before* the rate limiter — **fix first**

In `app/api/tryon/route.ts` the order is:

```
badOrigin → validate shape → resolve garment (DB) → cache lookup (DB)
  → moderatePerson()      ← paid OpenAI call, accepts up to 4 MB base64
  → overLimit(ip)         ← the per-IP rate limit
  → global daily cap
  → consumeTryon()
```

The control that exists to protect spend sits **behind** a paid call. An
unauthenticated caller posting unique ~3 MB images gets unlimited moderation spend plus
two Postgres round-trips per request and never touches the limiter. Cache hits also skip
the limiter entirely (intentional for cost, but it means a warmed key is an
unmetered endpoint).

**Fix:** move the IP limit and the global daily cap above `moderatePerson`, at
[route.ts:320](src/app/api/tryon/route.ts#L320):

```
badOrigin → validate shape → overLimit(ip) → global cap
  → resolve garment → cache lookup → moderate → meter → generate
```

### 2.2 `clientIp` trusts the leftmost `X-Forwarded-For` entry

```ts
// lib/ratelimit.ts
return (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
```

The leftmost XFF value is client-supplied on most hosting setups. An attacker sending a
random `X-Forwarded-For` per request gets a fresh bucket every time — `IP_LIMIT` stops
applying. Confirm behaviour for your actual host before deploying; on Vercel prefer the
platform-set header.

**Fix:** read `x-real-ip` (or `x-vercel-forwarded-for`) first, or take the *rightmost*
XFF entry, or add a `TRUSTED_PROXY_HOPS` env var and index from the right.

Separately: a whole showroom behind one NAT shares a bucket, and 30 per 10 min may be
tight for a busy shop. Consider adding a per-shop or per-session dimension so one venue
can't lock itself out.

### 2.3 No middleware, no security headers

There is no `middleware.ts` anywhere, and `next.config.mjs` defines no `headers()`.
Missing: CSP, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`,
`Permissions-Policy`, HSTS.

This is a product that **opens the camera and handles photographs of people's bodies**.
`Permissions-Policy: camera=(self)` and a CSP are table stakes here, not hardening.

`/dashboard` and `/admin` are also gated only in a client `useEffect` — the HTML and the
full admin bundle ship to anyone, then redirect. Not an auth hole (every `/api/admin/*`
route independently re-checks the bearer token against `ADMIN_EMAILS`, which is the real
boundary and is correctly done) — but it's a visible flash and needless bytes.

**Fix:** add `headers()` to `next.config.mjs`; add a `middleware.ts` that redirects
unauthenticated `/dashboard` and `/admin` at the edge off the Supabase auth cookie.

### 2.4 What's already right — worth not regressing

- `FAL_KEY` / `OPENAI_API_KEY` are strictly server-side; no `NEXT_PUBLIC_` leakage.
- Try-on resolves the garment image **from the catalog**, never from a client-supplied
  URL. That closes the obvious credit-drain vector.
- `consume_tryon` takes `for update` before mutating — correctly atomic.
- `refundTryon` on every failure path.
- Approval is enforced in the **database** (`consume_tryon`, `enforce_garment_limit`,
  the RLS read policies), not just the UI — so the service role, which bypasses RLS,
  still can't skip it. This is the right place for it.
- `badOrigin` handles the wildcard cases carefully, including the `evil-vercel.app`
  suffix trap.
- Admin is an env allowlist rather than a DB role, so a stolen vendor session can't
  escalate. Every mutation goes through `audit()`.
- Shopper likenesses are in private buckets behind short-lived signed URLs with
  uid-prefixed RLS.

---

## 3 · Data model & migrations

### 3.1 No migration runner

`schema.sql` is a hand-maintained "consolidated snapshot up to `20260719000100`", after
which **12 later migrations** must be applied by hand in order. Nothing records what
version a given database is at.

The code pays for this everywhere — roughly a dozen sites of "un-migrated project"
defensiveness:

```ts
if (error) return [];                     // loadFabrics, loadCompositions, …
if (error.code === "42703") { /* retry without the new columns */ }   // saveShop
if (/does not exist/i.test(msg)) { /* metering OFF */ }               // consumeTryon
select("*")  // "naming a column a un-migrated project lacks would empty the inbox"
```

That is permanent complexity — and real risk, since `consumeTryon` **disables metering
entirely** when it can't find its function — bought to avoid a 20-line tool.

**Fix:** adopt the Supabase CLI (`supabase migration new` / `db push`). Make
`schema.sql` generated (`supabase db dump`) rather than hand-folded. Then start
deleting the fail-soft branches — each one is a place where a broken deploy currently
looks like an empty screen.

### 3.2 Dual-mode storage has outlived its purpose

Every function in `storage.ts` opens with `if (!isSupabaseConfigured())`. That's ~40% of
1,205 lines, and the two modes are **not equivalent** — local mode has no item codes,
no plans, no approval gate, no compositions, no counter, no order history. So "runs with
no backend" means "runs a different, smaller product".

It bought a zero-setup demo. With Supabase now the real target, that trade should be
re-priced. Options, cheapest first: keep it but document the divergence in one place;
or move local mode behind a seeded Supabase project and delete the branch entirely.

### 3.3 Smaller data issues

- **`enforce_garment_limit` has the race `consume_tryon` was written to avoid.** It's a
  `before insert` trigger doing `select count(*)` with no lock — two concurrent inserts
  both pass. Low impact (51 garments on a 50 cap), but it's the same class of bug,
  solved correctly a few functions away. Same for the fabric limit.
- **`plans` seeds `('pro', 'Pro', 0, …)`** — the top tier is priced at zero. Either a
  typo or it needs an explicit "contact us" flag rather than an implicit `0`.
- **`schema.sql:190`** and the admin console can disagree about what a shop's plan
  costs; there's no single source of truth for pricing outside the table.

---

## 4 · Type safety

`strict: true` is on — and then switched off exactly where untrusted data enters:
**50 `: any` + 26 `as any`**, almost all at the Supabase row boundary.

```ts
((data as any[]) || []).map(...)          // getLeads, getPlans, getErrorLogs
function normalizeLead(r: any): Lead      // the whole orders inbox
const d = data as any;                    // getSubscription
```

The hand-written `GarmentRow` / `ShopRow` / `FabricRow` interfaces in `types.ts` are
good discipline, but they're *assertions* — nothing checks them against the real schema,
so a migration that renames a column type-checks fine and fails at runtime.

**Fix — highest-leverage single change available:**

```bash
supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

then `createClient<Database>(...)`. This kills most of the `any`, makes the
snake↔camel mappers checked, and turns "column renamed in a migration" into a compile
error instead of an empty inbox.

---

## 5 · Correctness bugs found

### 5.1 The landing feed's claim is false

`getFeed()` in [page.tsx:60](src/app/page.tsx#L60) filters on `in_stock` and
`shops.listed` — but **not** on `tryon_enabled`, and **not** on `shops.type = 'apparel'`.
The subtitle underneath reads:

> {n} pieces from {m} shops — **every one of them tries on**

A `general`-type shop (electronics, grocery — which by design never gets try-on) or any
garment with `tryon_enabled = false` lands in that grid under that claim.

**Fix:** add `.eq("tryon_enabled", true).eq("shops.type", "apparel")` to the query, or
soften the copy.

### 5.2 The feed stops being cross-shop as catalogs grow

Same query: `.limit(80)` with **no `order by`**. Postgres returns an arbitrary but
effectively stable set, so the shuffle-then-round-robin only ever deals from the same
80 rows. Past a few hundred garments, some listed shops can never appear.

**Fix:** order by `created_at desc` (recency is a defensible bias), or sample properly
in SQL.

### 5.3 `<html lang="en">` is hardcoded in a bilingual product

[layout.tsx:58](src/app/layout.tsx#L58) pins `lang="en"` for the whole app, while the
kiosk and storefront switch fully into Nepali. A screen reader will read Devanagari with
an English voice — a WCAG 3.1.1 failure on the surface the product is actually for.

`/privacy` works around it with `lang={lang}` on `<main>`; nothing else does.

**Fix:** the machinery already exists. `lib/lang.ts` writes the `pq_lang` cookie
specifically so a server component can read it — read it in the root layout and set
`<html lang={lang}>`.

---

## 6 · Tooling — the gap that lets everything above happen

**There is no ESLint config, no `lint` script, and zero test files.**

For a codebase with money-spending API routes, atomic Postgres metering, dual-mode
persistence, and a documented history of exactly the regressions this catches
(`UX_AUDIT.md` is 34 KB of them), `tsc --noEmit` is not enough.

**Fix, in dependency order:**

1. `next lint` + `eslint-plugin-jsx-a11y`. The a11y plugin alone would have flagged the
   27 unstyled buttons and the missing `lang`.
2. **Vitest over the pure logic — it's already isolated and directly testable:**
   `staleReason()`, `groupLeads()`, `garmentTryCounts()`, `normalizeLead()`,
   `badOrigin()`, `coverageCategory()`, `lib/sizing.ts`, `lib/format.ts`, the cache-key
   shape. ~40 tests, no mocking needed, covering the highest-risk pure functions in the
   product.
3. `pgTAP` or plain SQL assertions over `consume_tryon` — concurrency, period roll,
   refund, the approval gate. This function decides whether the company gets paid.
4. One Playwright smoke: kiosk → consent → photo → try-on → lead.
5. CI running all of it.

---

## 7 · Performance

- **The image pipeline round-trips through base64 twice.**
  `File → dataURL → canvas → dataURL → atob → per-byte loop → Blob → upload`. That
  inflates every photo ~33% in memory and runs a synchronous decode loop on the main
  thread. `canvas.toBlob()` returns the Blob directly — the data URL detour only exists
  because `/api/tryon` needs one, which the *upload* path does not.
- **Leaflet's CSS ships on the landing page.** `ShopsMap.tsx` statically imports
  `leaflet/dist/leaflet.css` at module scope, so the stylesheet loads even though the JS
  is correctly dynamic. Import it inside the `useEffect` alongside the JS.
- **60 raw `<img>`** against 3 files using `next/image`. `UX_FIXES.md` correctly
  explains most are `data:` / `blob:` / signed URLs that Next can't optimise — but they
  should all carry explicit `width`/`height` (many now do) so they stop shifting layout.
- **`revalidate = 300` with `Math.random()`** in `getFeed()` means the "random" feed is
  identical for every visitor for 5 minutes. Fine, probably intended — worth a comment
  so nobody "fixes" it into a dynamic render.

---

## 8 · What to do, in order

| # | Item | Effort | Why now |
|---|---|---|---|
| 1 | Reorder rate limit above moderation in `/api/tryon` | 10 min | Unbounded spend today |
| 2 | Fix `clientIp` XFF trust | 30 min | The limiter above only works after this |
| 3 | Security headers + `Permissions-Policy: camera` | 1 h | Camera + body photos, pre-launch |
| 4 | `<html lang>` from the cookie | 30 min | WCAG failure on the core surface |
| 5 | Feed `tryon_enabled` filter + `order by` | 30 min | The landing page states something false |
| 6 | ESLint + jsx-a11y | 1 h | Stops #4-class bugs recurring |
| 7 | `supabase gen types` → typed client | half day | Removes ~76 `any`; catches schema drift |
| 8 | Vitest over the pure helpers | 1 day | First real safety net |
| 9 | Supabase CLI migrations | 1 day | Then delete the fail-soft branches |
| 10 | Split `Dashboard.tsx` / `storage.ts` | 2–3 days | Every feature gets cheaper after |
| 11 | Inline styles → CSS Modules, file by file | ongoing | Makes the design system real |

Items 1–6 are a single afternoon and clear everything that is actually urgent.

---

## Appendix — what's genuinely good

Worth stating, because a review this long reads as harsher than the code deserves:

- **`globals.css` is exceptional.** Tokens that explain their own reasoning, a
  documented surface ramp, semantic status colours that can never be aliased onto
  neutrals, a real z-index ladder, and a reduced-motion block that correctly
  distinguishes decoration from feedback. Most teams never get here.
- **Security fundamentals are right where they matter**: keys server-side, catalog-
  resolved garment images, DB-enforced approval, atomic metering with refunds,
  private buckets for likenesses, audited admin actions.
- **The `Dialog` / `toast` consolidation** (23 hand-rolled overlays → one component with
  focus trap, scroll lock and a dirty guard) is the right kind of refactor.
- **Accessibility is well above average** — skip link, `.sr-only`, `aria-invalid` on
  fields, 24px hit targets on 8px dots, 173 aria attributes. The gaps listed above are
  narrow, not systemic.
- **The comments explain *why*, and cite the bug that motivated them.** That is the
  single most valuable property this codebase has, and it's why this review could be
  written from the source alone.

# peeq — master action plan

**Created 2026-07-30.** One queue, two workstreams. This is the top-level "what do I do next" file; the detail lives in the two source docs and is not duplicated here.

| Workstream | Detail doc | Scope |
|---|---|---|
| 🔒 Security / scale / backend | [docs/SECURITY_REMEDIATION.md](docs/SECURITY_REMEDIATION.md) | anon-reachable RPCs, self-approve, payments, RLS, indexes, retention, cleanup |
| 🎨 UI / UX / content (round 2) | [UX_AUDIT_2.md](UX_AUDIT_2.md) | false claims, money-path friction, language system, design tokens, a11y, admin polish |

Item codes below point back to those docs (e.g. **SEC P0-1**, **UX 0.2**). Where the two audits found the *same* thing it's marked **⚠️ shared** and appears once.

---

## 🔒🎨 Ship-blockers — do before any real traffic

*Nothing here is optional: each one either lets a stranger take money/AI-spend, or makes the product state something false about a shopper's face. The product's whole pitch is trust.*

- [ ] **SEC P0-1** — new migration `20260730000100_lock_down_rpcs.sql`: `revoke execute` on the privileged RPCs from anon/authenticated, re-grant service_role + `shop_tryon_availability`. Closes: free Pro plans, infinite credits, self-approve, competitor suspension. *(SQL is written out in the doc; test in staging with the anon-key curl.)*
- [ ] **SEC P0-2** — same migration: `revoke update (status, status_note, status_changed_at, vendor_code, item_seq) on shops from authenticated`. Closes vendor self-approval.
- [ ] **SEC P0-3** — eSewa `esewaSecret()` must throw in production instead of defaulting to the public UAT test secret; pin `signed_field_names`, verify `product_code`. *(`billing.ts:120`)*
- [ ] **UX 0.1** — landing "how it works" step 2 says the photo *"is never stored"* — false three ways. Reword to match the kiosk consent copy. *(`page.tsx:20`, 15 min)*
- [ ] **⚠️ shared — UX 0.2 / SEC Priv-1** — the counter writes the customer's face to `localStorage["peeq-counter-recent"]` with no expiry and no wipe on close, while the keep-form promises "the photo is not kept." Wipe on dialog close (or minutes-not-never TTL) and add it to the sign-out/idle wipe. *(`CounterTryOn.tsx:85`, 3–4 h)*
- [ ] **UX 0.3** — counter consent is one 11.5px grey sentence aimed at the vendor; give the customer step the kiosk's consent affordance + explicit agreement before `stitch & try on` enables. *(0.5 d)*
- [ ] **UX 0.4** — `?shared=1` writes durable localStorage, so a shopper's own phone stays "shared" forever. Move to sessionStorage; only the in-app toggle writes the durable flag. *(3–4 h)*
- [ ] **UX 0.5** — the 90s idle wipe can fire mid-consent with no visible countdown. Reset on scroll, show a countdown, announce to SR. *(2–3 h)*
- [ ] **UX 0.6** — auth blurbs promise "bag and wishlist" that `/account` doesn't have. Promise what the page shows. *(30 min)*

**Ship-blocker total: security P0 ≈ 0.5 d + test · UX Tier 0 ≈ 2–3 d.** After this, nothing the product says is false and no stranger can provision themselves.

---

## Stage 1 — the money path (high security + high UX)

*Between a shopper and "I want this", or a vendor and getting paid; plus the high-severity security gaps.*

**Security ([SEC P1](docs/SECURITY_REMEDIATION.md)):**
- [ ] **P1-1** — try-on renders are undeletable & kept forever; add `user_id` to `tryon_results`, wire into delete-everything, add retention. **(also a trust item — pairs with UX Tier 0.)**
- [ ] **P1-2** — cap/validate the client `category` string that's injected into the paid image prompt (`tryon/route.ts:229`).
- [ ] **P1-3** — stop trusting raw `X-Forwarded-For`; use the platform's real client IP (all per-IP limits are spoofable).
- [ ] **P1-4** — `/api/log`: add `badOrigin`, drop/validate the caller-chosen `shop_id`.
- [ ] **P1-5** — gate `public fabrics read` / `public styles read` (internal notes, corrections, price, stock leak to anon).
- [ ] **P1-6** — constrain composition `image_url` to the `renders` prefix (arbitrary-URL injection + compose-meter bypass).

**UX money-path friction ([UX Tier 1](UX_AUDIT_2.md)):**
- [ ] **UX 1.1** — QR deep link auto-starts generation and locks the rail; keep the confirm sheet, unlock the rack after first render. *(0.5 d)*
- [ ] **UX 1.3** — the core feature has **eight names**; adopt the glossary rule ("peeq it" = button, "see it on you" = explainer). *(0.5 d — do after 3.1 glossary)*
- [ ] **UX 1.4** — unavailable try-on CTA is `pointer-events:none` + tooltip → keyboard/touch users never see the reason. Make it `aria-disabled` with visible reason text. *(2 h)*
- [ ] **UX 1.7** — cart send: enquiry failure swallowed silently, double-fire submit, hardcoded error ids. *(0.5 d)*
- [ ] **UX 1.8** — storefront "Newest first" sort compares nothing (placebo); sort by `created_at`. *(2–4 h)*
- [ ] **UX 1.10** — approved vendors never find out; poll `shop.status` in `PendingReview`. *(3 h)*
- [ ] **UX 1.2 / 1.5 / 1.6 / 1.9 / 1.11 / 1.12 / 1.13** — kiosk exit context loss, sold-out dead ends, add-to-bag inconsistency, signed-URL expiry mid-session, PlanTab mailto dead-click, non-addressable dashboard tabs, doorless onboarding. *(see doc)*

---

## Stage 2 — scale (safe SQL, big payoff) + correctness

**Scale ([SEC Scale](docs/SECURITY_REMEDIATION.md)):**
- [ ] **Scale-1** — add the missing foreign-key indexes (deletes currently full-scan the largest tables).
- [ ] **Scale-2** — rewrite `owner = auth.uid()` → `owner = (select auth.uid())` across ~14 policies.
- [ ] **Scale-3** — `pg_cron` purge jobs for `rate_limits` / `tryon_events` / `error_logs` / `results` (nothing is pruned today).
- [ ] **Scale-4** — move admin search/counts/email-resolution into SQL (breaks past page 1 today).
- [ ] **Scale-5** — index `error_logs (shop_id, created_at)`.
- [ ] **Scale-6** — bucket size/MIME limits; bound `shopper_bags` jsonb.
- [ ] **Scale-7** — proxy Nominatim through `/api/geocode` with throttle + cache.

**Money correctness ([SEC P2](docs/SECURITY_REMEDIATION.md)) — do the payment ones first:**
- [ ] **P2-1** — eSewa amount parse breaks on thousands separators (`parseFloat("3,000.0")===3`) → real payments rejected.
- [ ] **P2-2** — payment verify idempotency race → conditional `.eq('status','pending')` update.
- [ ] **P2-3…P2-11** — appOrigin host-header trust, SSRF hardening, meter fail-open regex, `failClosed` no-op, spend-check ordering + `counter`/`compose` caps, body-size limit, admin email-confirm check, security headers, error-message leaks.

---

## Stage 3 — the language system + one voice ([UX Tiers 2–3](UX_AUDIT_2.md))

*The bilingual layer is peeq's most distinctive asset and least finished system. Effort ≈ 6–8 d incl. one product decision.*

- [ ] **UX 3.1** — write the glossary (`docs/`) **first** — it gates every copy sweep below.
- [ ] **UX 2.3** — APIs return error *codes*; client maps to localised copy (raw English server strings currently reach shoppers). Do **before** 2.2.
- [ ] **UX 2.2** — move the hardcoded-English kiosk strings into `i18n.ts`; persist lang in a cookie so the shell can localise server-side.
- [ ] **UX 2.1** — decide the "Nenglish" policy for the generation-wait copy (keep the brand lines, make the *functional* strings intelligible in both scripts).
- [ ] **UX 2.4 / 2.5 / 2.6 / 2.7** — reconcile EN≠NE content, set `<html lang>` on the kiosk, unify number formatting, delete dead i18n keys.
- [ ] **UX 3.2 / 3.3 / 3.4 / 3.5** — casing law, mechanical typography (`…`, curly quotes, em-dash rationing), two loading words not eleven, one `validate` source + one Shell.

---

## Stage 4 — design-system drift + accessibility round 2 ([UX Tiers 4–5](UX_AUDIT_2.md))

*The tokens are excellent; the call sites wing it. Effort ≈ 7–8 d, parallelises against Stage 3.*

- [ ] **UX 4.1** — rename `--violet` (it's green) → `--accent`; fix the stale brand doc. Do before the colour sweep.
- [ ] **UX 4.2** — define a type scale (`--text-xs…2xl`) + real heading elements; sweep worst files first.
- [ ] **UX 4.3 / 4.4 / 4.5 / 4.6** — one `.btn`, one `.field`, unify the duplicated components (carousels, size-pickers, dropdowns, not-found screens), sweep hardcoded colours to tokens.
- [ ] **UX 4.7 / 4.8 / 4.9 / 4.10** — PWA metadata drift, unstyled admin nav, Dropdown z-index/clipping, toast stack order + exit + hover-pause.
- [ ] **UX 5.1–5.11** — a11y gaps round 1's skeleton doesn't cover: `hideHeader` dialogs with no accessible name, silent counter wait, `AccountMenu`/size-picker/tab keyboard semantics, focus-on-invalid, sub-24px targets, admin one-click irreversibles. **⚠️ 5.11 overlaps SEC admin-audit intent.**

---

## Stage 5 — admin polish + backend cleanup

- [ ] **UX Tier 6** — admin console: keep-stale-while-refetching, danger-styled error rows with retry, split `busy`/`disabled`, refetch after activate. *(1.5 d)*
- [ ] **SEC Cleanup-1** — de-duplicate helpers (`serviceClient`, `dailyCap`, `MAX_IMAGE_CHARS`, `logError`, `bearer`, `openaiKey`, admin-email constant).
- [ ] **SEC Cleanup-2/3/4** — re-fold `schema.sql` + fix its header, update `docs/environments.md` bootstrap list, adopt a migration ledger (Supabase CLI). *(do before onboarding a second environment.)*
- [ ] **⚠️ shared — SEC Cleanup-5 / UX 0.11 / 1.8** — decommission the retired studio meter; delete stale comments and the placebo sort.
- [ ] **SEC Cleanup-7** — `profiles.role` CHECK, `own garments` update gate, `consume_tryon` null branch, root scratch-doc relocation, `result_url`/`APP_URL` vestiges, `import "server-only"` guards.

---

## Strategic decisions (not tickets — make these once)

1. **⚠️ shared — the name.** peeq (UI) vs Pahiran (package, `pahiran:` storage keys, README) vs EasyFitCheck (`efc-` CSS prefix). Answer is **peeq**; rename docs/package now, migrate storage keys deliberately with a read-old-write-new shim (existing shoppers' looks live under `pahiran:` keys), never half-rename. *(SEC Cleanup-6 = UX Strategic 1.)*
2. **The domain & email.** All trust mail routes to a personal domain `contact@agrimsigdel.com.np`. Buy the peeq domain, move mail. *(ops)*
3. **Landing page's two masters** — consider leading the vendor fork one section earlier (UX Strategic 3).
4. **The Nenglish policy** (UX 2.1) — decide once, write it into the voice doc header.

---

## Rollup

| Phase | Contents | Rough effort |
|---|---|---|
| **Ship-blockers** | SEC P0 + UX Tier 0 | **~3 d** (0.5 d security + 2–3 d UX) |
| **Stage 1** | SEC P1 + UX Tier 1 (money path) | **~1.5 wk** |
| **Stage 2** | SEC Scale + P2 | **~1 wk** |
| **Stage 3** | UX Tiers 2–3 (language + voice) | **~6–8 d** |
| **Stage 4** | UX Tiers 4–5 (design + a11y) | **~7–8 d** |
| **Stage 5** | UX Tier 6 + SEC cleanup | **~4 d** |

**Honest minimums:**
- **~3 days** → ship-blockers only: nothing false, nothing self-provisionable. The bar to put in front of the first shop.
- **~3 weeks** → ship-blockers + Stage 1 + Stage 2 payment/scale: safe, honest, and it holds under load on the money path.
- **~6–7 weeks solo** → the whole queue (Stages 3–5 parallelise; sweeps run against flow work).

**Ordering constraints:** glossary (UX 3.1) before any copy sweep · error codes (UX 2.3) before i18n completion (UX 2.2) · `--accent` rename (UX 4.1) before the colour sweep (UX 4.6) · SEC P0 migration before anything else touches the DB grants.

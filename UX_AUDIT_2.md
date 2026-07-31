# UX / UI / content audit — round 2

**Written 29 July 2026**, against branch `stage` including the uncommitted working tree.
Companion to [`UX_AUDIT.md`](UX_AUDIT.md) (round 1, worked through 27 July) and
[`UX_FIXES.md`](UX_FIXES.md). Round 1 fixed the mechanics — dialogs, tokens, dead
kiosks, false privacy claims. This round is a different altitude: **does the product
tell one coherent story, in one voice, and is every promise it makes true?**

Method: full read of every route and component (this time including `CounterTryOn.tsx`
and `FabricStudio.tsx`, which round 1 only sampled), plus the copy dictionary, the
brand-direction doc and the metadata layer. Findings are organised as a work queue:
each item carries a fix and an effort estimate (one developer who knows this codebase).

---

## The verdict in four sentences

The **system layer is genuinely excellent** — tokenised colour with documented contrast
ratios, a named z-ladder, one Dialog with real focus management, a reduced-motion pass
that keeps feedback while killing decoration. The **copy has a real voice** — lowercase,
warm, bilingual with intent — which most products never achieve. What's wrong now is
**coherence**: the product wears three names, speaks four registers, calls its core
feature eight different things, and in three places **says something about privacy that
the code makes untrue**. None of this needs invention — it needs one glossary, one
brand decision, and a disciplined sweep.

## What must not be broken while fixing

- The consent screen, the honest failure card ("a failed try-on says so"), the
  cancel-a-generation path, the shared-tablet wipe. This is trust machinery.
- The bilingual kicker (`a little look before you buy · किन्नु अघि एक झलक`) and the
  Nepali strings that are rewrites, not translations (`नलगाईकनै, / लगाएर हेर्नुहोस्`).
- The `ee` blink as the only loading motif. No spinners.
- The token discipline in `globals.css` — new work should extend it, not bypass it.

---

# Tier 0 — places the product says something false

*The product's differentiator is trust ("your photo, your call"). Anything that
contradicts that is a ship-blocker regardless of size.*
**Total: ~2–3 days.**

| # | Finding | Fix | Effort |
|---|---|---|---|
| 0.1 | Landing "how it works" step 2: *"Snap a photo of yourself — **it's never stored**"* ([page.tsx:20](src/app/page.tsx#L20)). False three ways: the kiosk offers 7-day on-device remembering, signed-in shoppers sync the photo to their account, and every generation sends it to fal/OpenAI. The kiosk consent copy already says this correctly — the landing regressed to the claim round 1's T1.2 removed elsewhere. | Reword to match the consent screen: "one photo, used only to show clothes on you — kept only if you ask." | 15 min |
| 0.2 | **The counter contradicts its own promise.** The keep-forms say *"The customer's photo is not kept with it"* — but the finished try-on (the customer's face) is written to `localStorage["peeq-counter-recent"]` and shown as **"last fitting"** to whoever opens the panel next, with no expiry and no wipe on close (`CounterTryOn.tsx`). | Wipe the snapshot when the counter dialog closes (or expire it in minutes, not never); if a "last fitting" is genuinely useful, say so on-screen next to the consent line. | 3–4 h |
| 0.3 | **Counter consent is one grey 11.5px sentence aimed at the vendor** ("Ask before you photograph anyone"), vs the kiosk's titled consent block, privacy link, and opt-in. Same face, same servers, different diligence. | Give the customer step a real consent affordance: the kiosk's consent sentence + privacy link, and an explicit "the customer agreed" checkbox before `stitch & try on` enables. | 0.5 d |
| 0.4 | **Shared-mode is sticky in the wrong direction.** `?shared=1` writes `localStorage` permanently, `/kiosk` force-writes it forever — so a shopper's own phone that once opened a shared link *stays* shared (their saves silently stop persisting), and conversely the flag rides along on devices it shouldn't (`KioskV2.tsx:99-104`, `kiosk/page.tsx:73-78`). | `?shared=1` → sessionStorage; only the explicit in-app toggle writes the durable flag; `/kiosk` sets shared per-session, not per-device. | 3–4 h |
| 0.5 | **The idle wipe can eat a shopper mid-consent.** On a shared tablet the 90s wipe is armed on `capture` — a shopper who uploaded a photo and is *reading the consent block* gets wiped at 90s, with a 15s grace toast that shows no countdown (`kiosk/session.ts`). | Reset the idle timer on scroll as well as taps; show a visible countdown in the "still there?" toast; announce the wipe to screen readers. | 2–3 h |
| 0.6 | Auth blurbs promise features that don't exist: shopper sign-in says *"Sign in to your looks, **bag and wishlist**"*, signup says *"Save your try-ons **and bag**"* — `/account` has no bag and no wishlist section (`AuthPage.tsx:29-54`). | Promise what the account page shows: looks, orders, one-tap checkout details. | 30 min |
| 0.7 | FabricStudio empty state: *"Pick a cut or two above — **three is usually plenty** to start"* under a hard `PICK_LIMIT = 2`. | "one or two" | 10 min |
| 0.8 | Error copy points at UI that moved: *"Upgrade in the **Plan tab** for more"* — Plan is no longer a tab, it's a page behind the account menu (`dashboard/page.tsx`, two strings). | "Upgrade under Plan & billing in your account menu." | 15 min |
| 0.9 | Internals leak into user-facing copy: `ADMIN_EMAILS`, `From error_logs`, `Supabase configured`, raw `past_due` / `canceled` / `vendor` / `shopper` pills, `Activate starter` (admin surfaces). | Human labels; keep identifiers for tooltips/logs. | 1–2 h |
| 0.10 | **Local-mode dashboard has no sign-out and a broken menu.** `AccountMenu` renders its signed-in branch with `user === null` when the dashboard passes `extraItems` in local mode (`AccountMenu.tsx:46,109`) — `?` avatar, "signed in" header over a null email. | Guard the header on `user`; render extraItems-only mode without the signed-in framing. | 1–2 h |
| 0.11 | Comments that lie to the next reader: `StorefrontClient.tsx:120-125` documents a most-tried "Featured" ranking that doesn't exist (`sort === "new"` is a no-op `() => 0`); `ProductClient.tsx:126` describes a plural bug that's already fixed. | Delete the stale comments; see 2.7 for making the sort real. | 30 min |

---

# Tier 1 — friction on the money path

*Everything here sits between a shopper and "I want this", or between a vendor and
getting paid.* **Total: ~5 days.**

| # | Finding | Fix | Effort |
|---|---|---|---|
| 1.1 | **The QR hanger tag — the product's physical wedge — delivers the worst version of the kiosk.** A `?g=` deep link auto-starts generation (skipping the confirm sheet every other path requires: it spends a shop credit and a minute of the shopper's time on arrival), and `locked` hides the rail and category chips entirely — one piece, one shot, no browse, no path to the rest of the rack except `start over` (`KioskV2.tsx:951-956`). | Keep the confirm sheet on deep links (it already sets the one-minute expectation); after the first render, unlock the rail — the scanned piece stays selected, the shop's rack is the upsell. | 0.5 d |
| 1.2 | Kiosk exit dumps context: from a product page → try-on → exit lands on `/s/[slug]` top, garment forgotten (`k/[slug]/page.tsx`). | Exit returns to the page that launched it (carry a `return` param or use history). | 2 h |
| 1.3 | **The core feature has eight names**: `see it on you` / `see it on you →` / `see it on you first` / `see it on you anyway` / `peeq it` / `try it on` / `try this on?` / `stitch & try on` — and the disabled state string-concatenates into `see it on you → — unavailable`. | Glossary rule (see Tier 3): **"peeq it"** is the button verb everywhere shoppers act; **"see it on you"** is the explainer line; drop the arrow-in-label. Render unavailability as state, not suffix. | 0.5 d |
| 1.4 | The unavailable try-on CTA is `pointer-events: none` + a `title` tooltip — unfocusable, so keyboard users can't reach the explanation and touch users never see it (`TryOnCta.tsx`). | Keep it focusable (`aria-disabled`), put the reason in visible text under the button. | 2 h |
| 1.5 | Sold-out cards are dead ends: a non-interactive `sold out` div, no CTA (`storefront.tsx`). The product page OOS state does this right ("Ask the shop below — they can often get it in"). | Give the card the same escape: link through to the product page's ask-flow. | 3 h |
| 1.6 | Add-to-bag behaves differently per surface: product page opens the drawer; card quick-add shows a 1400ms label swap with no live region — silent to screen readers, easy to miss sighted (`storefront.tsx`). | Pick one confirmation (a toast with "view bag" action serves both); add the live region. | 3 h |
| 1.7 | Cart send: an **enquiry failure is swallowed silently** (only `order` sets `sendError`); the submit button wires both `form=` submit *and* `onClick={send}` (double-fire risk); error ids are hardcoded (`co-name-err`) in a file that otherwise uses `useId` (`storefront.tsx` CartDrawer). | Surface enquiry failures through the same alert; drop the redundant onClick; `useId` the ids. | 0.5 d |
| 1.8 | Storefront sort is broken: `Newest first` compares nothing (`() => 0`) — order is insertion order, and the sort menu is a placebo (`StorefrontClient.tsx:116-130`). | Sort by `created_at` (or remove the option until it's real). | 2–4 h |
| 1.9 | Kiosk result URLs are signed for 1h; a long session's cached results can expire mid-browse with no refresh path (`looks.ts:34`). | Re-sign on demand when an image 403s, or lengthen the TTL for the session cache. | 0.5 d |
| 1.10 | **An approved vendor never finds out.** `PendingReview` has no polling — the "we'll call you" screen holds until a manual reload. | Poll `shop.status` every ~30s while mounted (or Supabase realtime on the row). | 3 h |
| 1.11 | `PlanTab.requestPlan` navigates the tab to `window.location.href = mailto:` — on devices with no mail handler that's a dead click, and the success notice renders on a page the browser may have left. | Anchor `mailto:` link + fire the `plan_requests` insert independently; keep the SPA where it is. | 2 h |
| 1.12 | Dashboard tabs aren't addressable — reload always lands on Overview; only `plan`/`settings` write the URL (`Dashboard.tsx`). | Write `?tab=` for Orders/Catalog/Fabrics too. | 2 h |
| 1.13 | **Onboarding is a room with no doors**: no nav, no wordmark link, no sign-out, no `#main` (skip link dangles). A vendor who signed in with the wrong account is trapped. | Add the wordmark link + sign out + `id="main"`. | 1 h |

---

# Tier 2 — the language system

*The bilingual layer is the product's most distinctive asset and its least finished
system.* **Total: ~4–5 days, including one product decision.**

| # | Finding | Fix | Effort |
|---|---|---|---|
| 2.1 | **The "English" locale isn't English at the emotional peak.** All seven generation messages are romanised Nepali (`Peeq gardai... 👀`, `ek minute jati laagchha, tara worth it chha hai`). For the Kathmandu shopper this is the best copy in the product; for anyone who chose EN *because they can't read Nepali* (tourists — a real Thamel segment), the wait screen is gibberish at the exact moment they're nervous about their photo. **Decision needed.** | Recommended: keep the Nenglish lines as the brand signature, but make the *functional* strings carry meaning in both scripts — footer becomes `takes about a minute — worth it, promise · ek minute jati laagchha`. The slow-warning (`genSlow`) must be intelligible: it's reassurance against abandoning. | 0.5 d |
| 2.2 | The bilingual kiosk has **hardcoded English holes**: `your saved looks` / `sign in to save your looks`, the account-sync consent sentence, all failure toasts, both WhatsApp prefills, all alt text, the `Discard changes?` dialog, category chips (+ literal `All`), and the `/k/[slug]` loading/empty/404 shell — which renders *before* the language toggle is reachable (`KioskV2.tsx`, `parts.tsx`, `Dialog.tsx`, `k/[slug]/page.tsx`). | Move them into `i18n.ts` (the `ne: typeof en` type already enforces key parity); persist lang in the cookie you already have so the shell can read it server-side. | 1 d |
| 2.3 | **Server error strings reach shoppers verbatim in English** — the failure card swaps its bilingual body for whatever `/api/tryon` sent (`This shop has used up its try-ons for now…`), and `toastFailure` appends ` — please try again.` plus raw `Error.message` in English always (`toast.ts:89-92`). | APIs return stable error *codes*; the client maps codes → localised copy; `toastFailure` takes a t-function. Raw messages go to `reportError`, never to shoppers. | 1 d |
| 2.4 | EN/NE say different things: EN lead-success promises *"They'll text you"* — NE omits the promise; EN remember-note says where to delete (*"from the consent screen"*) — NE drops the location; EN has 7 gen messages, NE has 5. | Reconcile — the NE reading of a promise is still a promise. | 2 h |
| 2.5 | `<html lang="en">` is hardcoded while the kiosk renders Devanagari (`layout.tsx:58`); only `/privacy` sets `lang` locally. Screen readers will read Nepali with English phonology. | Set `lang` on the kiosk root when NE is active (the privacy page already shows the pattern). | 2 h |
| 2.6 | Numbers speak three dialects: admin `en-GB`, PlanTab/`npr()` `en-IN`, privacy NE in Devanagari numerals — and `npr()` puts the Devanagari `रू` inside otherwise-English sentences with Indian digit grouping. | Pick one: `रू` + `en-IN` everywhere user-facing (it's the shopper-native form), `en-GB` nowhere. One formatter, used by all surfaces. | 3 h |
| 2.7 | Dead i18n keys (`pickAPiece`, `thisSession`, `yourMeasurements`, `savingLook`) and `errPhone` says "at least 7 digits" while the validator also rejects >15. | Delete the dead keys; "7–15 digits". | 30 min |

---

# Tier 3 — one voice: the glossary and the casing law

*Every register drift is small; together they read as three different products.*
**Total: ~2–3 days.**

**3.1 — Write the glossary** (0.5 d, a page in `docs/`), then sweep (1–1.5 d). The
decisions that need making, with recommendations:

| Concept | Today | Rule |
|---|---|---|
| The garment | `piece` / `item` / `garment` / `fit` / `wearable` | **piece** everywhere shopper-facing; *garment* survives only in vendor/catalog surfaces |
| The output | `look` / `try-on` / `render` / `preview` / `STYLE PREVIEW` | **look** for the shopper's saved thing, **try-on** for the act, **preview** only for vendor renders |
| The container | `bag` (UI) / `cart` (code) | UI stays **bag**, aria labels included; code keeps cart |
| The act | see 1.3 | **peeq it** = button, **see it on you** = explainer |
| Saved things | `saved` / `Saved` / `Save for later` / wishlist | **saved** (lowercase chip), `save for later` on the heart |
| Commissioned | `MADE TO ORDER` / `made to order` / `stitched to order` / `stitched-to-order` | **made to order** shopper-facing; *stitched to order* vendor-facing (their craft language) |
| Availability | `out of stock` / `sold out` / `This item may have sold out` | **out of stock** everywhere (matches the badge) |
| Contact verbs | `place order` / `enquire` / `ask on WhatsApp` / `tell the shop` / `send` | **place order** (bag), **ask on WhatsApp** (product), **tell the shop** (kiosk lead) — three contexts, one verb each |
| Vendor's inbox | UI `Orders`, code `leads`, auth blurb "leads" | **Orders** everywhere user-facing, kill "leads" in the signup blurb |
| Shared mode | `shop tablet` / `shared mode` / `Shared tablet` | **shop tablet** (the human name); "shared mode" never surfaces |

**3.2 — The casing law** (0.5 d, folded into the sweep). Today: shopper/vendor
surfaces are lowercase-display, admin is Title Case, tab labels are Title Case beside
lowercase page headers that lowercase *the same words* (`Plan & billing` → `plan &
billing` one tap apart), buttons split arbitrarily (`Edit`/`QR` on the card, `cancel`/
`save changes` in the modal it opens), and `YOURS` shouts beside `peeq library`.
Codify: **display headings and buttons lowercase; sentences sentence-case; admin may
keep Title Case as a deliberate back-office register — but consistently, including its
chips and confirms.**

**3.3 — Mechanical conventions** (2 h): `…` never `...` (the Nepali stitch strings use
three dots), curly quotes everywhere or nowhere (currently both, sometimes in the same
file), and ration the em-dash — it appears in ~60 strings and blunts the voice it built.

**3.4 — Loading vocabulary** (2 h): eleven strings for "wait" (`one moment…`,
`loading…`, `Loading your shop…`, `taking a peeq…`, `Generating…`, `Processing photo…`,
`building…`, `submitting…`, `sending…`, `Saving…`, `…`). Keep two: `taking a peeq…`
(brand moment, shopper) and `one moment…` (everything else), with per-action busy
labels only where the action word matters (`saving…`).

**3.5 — Duplicate rule text** (2 h): two password-length messages for the same rule
(`Password must be…` / `Your new password must be…`), `PASSWORD_MIN/MAX` declared in
two files, three hand-rolled `Shell`s (AuthPage, `/reset`, `/account`) with drifting
padding. One `validate` source, one Shell.

---

# Tier 4 — design-system drift

*The tokens are excellent; the call sites are winging it.* **Total: ~5 days.**

| # | Finding | Fix | Effort |
|---|---|---|---|
| 4.1 | `--violet` is not violet — it's `#123A2E` (deep green) in light, `#d3c38f` (sand) in dark, while `peeq-brand-direction.html` still specifies `#6D5BFF`. The token name is a landmine and the brand doc is stale. **Decision**: production green won; update the brand doc. | Rename `--violet` → `--accent` (mechanical), fix the brand doc's swatch. | 2 h |
| 4.2 | **No type scale.** Font sizes are inline literals — 9.5 through 34px with half-pixel steps (`10.5`, `11.5`, `12.5`, `13.5`, `14.5`, `15.5`) dominating body text; the dashboard renders no real `<h1>`/`<h2>` at all (display-styled `<div>`s). | Define `--text-xs…--text-2xl` (6 rungs) + heading elements; sweep incrementally, worst files first (Dashboard, KioskV2, admin). | 1.5–2 d |
| 4.3 | **Six primary-button renderings** (`.btn-solid`, `.btn-violet`, three inline restatements, naked text buttons) with radius split between `--radius-btn` and `--radius-pill`, and font-family split between display and body. Vendor-primary=ink vs shopper-primary=accent is a *good* rule — it's just unwritten. | One `.btn` with `variant=` classes; write the ink/accent rule down; kill the inline copies. | 1 d |
| 4.4 | Five input definitions for the same control (`.field` + four inline restatements with drifting padding/radius) — `FabricModal`'s comment already names inline restatement as the cause of a 2px drift. | Everything through `.field`. | 0.5 d |
| 4.5 | Duplicated components: `Centered` ×3, announce-bar ×2, nav-bag ×2, hero carousels ×2 (different pause models *and* different reduced-motion implementations), size-pickers ×2 (different a11y), admin `Btn` ×2 (different contracts), dropdown systems ×2 (custom listbox + `.ph-select`), `CATEGORY_LABEL` duplicating `SHOP_CATEGORIES`, three not-found screens with three copy variants. | Extract/unify; for the carousels keep `HeroTryOn`'s reduced-motion + pause model (it's the correct one). | 1–1.5 d |
| 4.6 | Hardcoded colours where tokens exist: storefront footer pins light-paper rgba on the inverting `--slab` (dark-mode text risk), admin filter chips use `rgba(47,109,79,.07)` (matches no token, doesn't invert), `SizeBadge` hand-mixes butter literals, QR print sheet declares `var(--font-display)` in a document that defines no variables and loads three Google-font families at print time. | Sweep to tokens; self-contained print CSS. | 0.5 d |
| 4.7 | PWA metadata drift: `manifest theme_color: #00372b` matches no token (viewport says `#FAF6F0`/`#1E1310`); manifest description drops "and shoppers" from the layout description; title patterns vary (`peeq — tagline` / `Privacy · peeq` / `peeq admin`). | One theme colour, one description source, one title pattern (`x · peeq`). | 1 h |
| 4.8 | **Admin nav is unstyled**: `.tabs` only styles `button`, admin renders `<Link>` — UA-default links, no padding, and *no visible active indicator* (only `aria-current`). | Add `.tabs a` rules. | 1 h |
| 4.9 | `Dropdown` list: bare `zIndex: 40` (collides with `--z-kiosk`), absolutely positioned inside a scrolling dialog panel → clipping. | `--z-popover`, portal or overflow handling. | 2 h |
| 4.10 | Toast stack: newest toast renders *furthest* from the screen edge, removal has no exit animation, no pause-on-hover. | Reverse order, add exit transition + hover-pause. | 0.5 d |

---

# Tier 5 — accessibility round 2

*Round 1 built the skeleton (Dialog, skip links, sr-only, reduced motion). These are
the gaps the skeleton doesn't cover.* **Total: ~2–3 days.**

| # | Finding | Fix | Effort |
|---|---|---|---|
| 5.1 | **Dialogs opened with `hideHeader` have no accessible name** — `aria-labelledby` points at an `<h2 id>` the hidden header never renders. Affects GarmentModal, FabricModal, QRModal, TagSheetModal (`Dialog.tsx:~176`). | Fall back to `aria-label={title}` when `hideHeader`. | 1 h |
| 5.2 | **The counter's minute-long wait is silent and inescapable**: `StitchingOverlay` from the counter has no live region, no cancel, no minimize (kiosk has all three). | Pass `onMinimize`, add `role="status"` + a cancel. | 0.5 d |
| 5.3 | `AccountMenu` has menu roles but no keyboard: no Escape, no arrows, no focus-in on open, no focus restore. | Standard menu keyboard pattern. | 3 h |
| 5.4 | Both size "radiogroups" are buttons with `role="radio"` but no roving tabindex/arrow keys; the kiosk's second size picker has no group semantics at all. | One SizePicker component, arrows + single tab stop. | 3 h |
| 5.5 | Validation announces but never moves focus (product size error, cart fields). | Focus the first invalid control on failed submit. | 1 h |
| 5.6 | Dashboard `.tabs` have no `role="tab"`/`aria-selected`/`aria-current`; kiosk category chips have no pressed state (colour-only selection). | `aria-current` on tabs, `aria-pressed` on chips. | 2 h |
| 5.7 | `aria-disabled` vs `disabled` used interchangeably (FindMySize vs WantThis; modal saves deliberately `aria-disabled` — that one's correct, the rest should match it or say why). | One rule: clickable-but-blocked = `aria-disabled` + explain on click; else `disabled`. | 2 h |
| 5.8 | Sub-24px targets survive in the long tail: `CutEditButton` (~19px), `SlugEditor` buttons (11px text), kiosk `retake my photo` (`2px 8px` padding), `forget my saved photo` — while a comment two functions away cites WCAG 2.5.8. | `min-height: 38px` utility on text-buttons. | 3 h |
| 5.9 | The SR wait experience is two announcements in ~90s with the percentage deliberately excluded — under-communicates for a minute-long hold. | Announce quartiles ("about halfway…") through the existing live region. | 2 h |
| 5.10 | Dialog's discard-confirm renders a second `aria-modal` dialog inside the first's scrim (two modals in the tree); CutModal's visible headings are lowercase while its `ariaLabel`s are Title Case (SR hears ≠ user reads — breaks label-in-name). | Render the confirm as the only modal while open; match aria strings to visible strings. | 2–3 h |
| 5.11 | Admin one-click irreversibles: ban/unban, role swap, billing dismiss have no confirm (delete flows are exemplary — type-the-slug). | Lightweight `ConfirmDialog` on all three. | 3 h |

---

# Tier 6 — admin console polish

**Total: ~1.5 days.** Every admin action nulls the list back to `Loading…` (flash);
error states render identically to loading (`Could not load overview.` in the same
grey `<Note>`); no retry affordance anywhere; `busy` doubles as `disabled` so an empty
reason field makes buttons read `working…` when nothing runs; billing `act()` never
refetches, so `Activate` results are unverified; the ops audit trail shows the empty
state *while loading*. Fixes: keep-stale-while-refetching, a danger-styled error row
with `try again`, split `busy`/`disabled` props, refetch after activate.

---

# The strategic layer — decisions, not tickets

1. **The name.** The repo is *Pahiran*, the CSS prefix is EasyFitCheck (`efc-`),
   storage keys are `pahiran:`, the printed hanger tags say `PEEQ.APP`, the README
   opens `# Pahiran`. The user-facing answer is clearly **peeq** — but storage keys
   are a data migration (existing shoppers' looks live under `pahiran:` keys and
   `pahiran-looks` IndexedDB), so: rename docs/package now, migrate keys deliberately,
   never half-rename. (Docs: 1 h. Key migration: 0.5 d with a read-old-write-new shim.)
2. **The domain and the email.** Support, billing, review and privacy all route to
   `contact@agrimsigdel.com.np` — a personal domain as the trust anchor of a marketplace
   asking for faces and phone numbers. `pahiran.app` appears in code comments;
   `PEEQ.APP` on printed tags. Buy the peeq domain, move mail to it. (Ops, not code.)
3. **The landing page serves two masters.** It's documented as vendor-facing
   ([page.tsx:9](src/app/page.tsx#L9)) but leads with the shopper promise and buries
   `for store owners` in nav + a half-slab. That's defensible (vendors need to *see*
   the shopper magic) — but then the hero's secondary CTA (`I own a store →`) is
   carrying the page's actual job, and it's the weakest element on the screen. Consider
   leading the vendor fork one section earlier.
4. **The Nenglish policy** (see 2.1) — decide once, write it into the voice doc in
   `i18n.ts`'s header where the voice is already specified.

---

# How long

| Tier | Theme | Effort |
|---|---|---|
| 0 | False statements & trust | **2–3 d** |
| 1 | Money-path friction | **~5 d** |
| 2 | Language system | **4–5 d** |
| 3 | Glossary + casing sweep | **2–3 d** |
| 4 | Design-system drift | **~5 d** |
| 5 | Accessibility round 2 | **2–3 d** |
| 6 | Admin polish | **1.5 d** |
| — | Strategic (name/domain) | 1 d code + ops |

**Everything: 23–27 working days — call it 5 weeks solo, 3 weeks with two people**
(the sweeps in Tiers 3–4 parallelise cleanly against the flow work in Tiers 1–2).

**The honest minimum:**
- **2–3 days** (Tier 0 alone) → nothing the product says is false. Ship-worthy bar.
- **2 weeks** (Tiers 0–2 + glossary) → one honest, coherent, bilingual product on the
  shopper path. This is the version to put in front of shops.
- **5 weeks** → the whole queue, including the system debt that makes the *next*
  feature cheaper instead of more expensive.

Order matters: glossary (3.1) before any copy sweep touches files; `--accent` rename
(4.1) before the hardcoded-colour sweep (4.6); error codes (2.3) before the i18n
completion (2.2) so the same strings aren't moved twice.

# UX / UI audit — peeq

**Status: worked through 27 July 2026.** Every box below is ticked except where
marked. `[~]` means fixed with a caveat spelled out on the line; `[ ]` means
deliberately not done, with the reason. Three items needed a product decision
and were taken as: kiosk v1 deleted (v2 is now the only kiosk), the `/owner`
demo-call CTA removed rather than repointed, and `/compare` gated behind the
admin allowlist.

The notes explaining *why* each thing was wrong now live in the code, next to
the fix, rather than only here.

---

<details>
<summary>The original audit, as written</summary>

Full-surface review of every route and component. Written 2026-07-27 against branch
`stage` at commit `7c029f6` **plus the uncommitted working tree**.

**Scope note:** a design-token cleanup pass was in flight while this was written
(hardcoded `#9b3232`/`#C0554D`/`#B4423A` → `var(--danger)`, hardcoded scrims →
`var(--scrim)`, modal chrome → `.sheet`, new `--pin` / `--stage` / `--stage-veil`
tokens). **Everything that pass fixes is excluded from this document.** Every item
below was verified live in the working tree at the time of writing.

Deep-read: all routes, all components except `CounterTryOn.tsx` and
`FabricStudio.tsx`, which were sampled.

---

## Fix order

The rest of this document is organised by area. If you want a single queue, work it
in this order:

1. Make kiosk v2 the default, delete v1 — [T1.1](#t11--every-shopper-gets-the-kiosk-the-code-documents-as-broken)
2. Correct the false privacy claims — [T1.2](#t12--the-privacy-policy-states-something-false)
3. Add password reset — [T1.3](#t13--there-is-no-password-reset)
4. Unblock pending vendors — [T1.5](#t15--pending-vendors-are-trapped-in-a-read-only-dead-end)
5. Fix `--violet` in both themes — [T1.6](#t16---violet-is-currently-broken-in-both-themes)
6. Delete `maximumScale` / `userScalable` — [T3](#tier-3--systemic)
7. One `<Dialog>` component, retrofit all 23 overlays — [T1.7](#t17--23-modals-zero-dialog-semantics), [T1.8](#t18--24-native-alert--confirm-dialogs)
8. Make the kiosk upload dropzone a real button — [Kiosk](#kiosk-both-versions)
9. Replace the silent `catch {}` blocks — [T1.9](#t19--failures-are-silently-swallowed)
10. The long tail below.

---

# Tier 1 — the things that are actually wrong

## T1.1 — Every shopper gets the kiosk the code documents as broken

[`KioskV2.tsx:27-53`](src/components/KioskV2.tsx#L27-L53) lists three defects in v1 and
fixes them. v1 is still the default. The only path to v2 is `?v=2`, reachable from a
12px grey underlined "try v2" in the vendor header
([`Dashboard.tsx:173-180`](src/components/Dashboard.tsx#L173-L180)). Every QR scan,
storefront link, landing-page "peeq it" and map popup goes to v1.

- [x] **Render is cropped.** [`Kiosk.tsx:623`](src/components/Kiosk.tsx#L623) draws the
  result with `objectFit: "cover"` on a stage sized to the *photo's* ratio, with the
  photo underneath at `contain`. Studio renders are always 1024×1536, so any non-2:3
  photo loses the render's head or feet. Hold-to-compare crossfades `cover`↔`contain`,
  so the body visibly jumps scale between the two images.
- [x] **The rack vanishes after one try-on.** [`Kiosk.tsx:820`](src/components/Kiosk.tsx#L820)
  gates it on `phase === "idle"`. Trying a second garment means finding a 12.5px
  underlined "browse the rack" text link. That is the product's core loop behind a
  text link.
- [x] **The progress bar is invisible.** [`Kiosk.tsx:469`](src/components/Kiosk.tsx#L469)
  fills with `var(--violet)` — in light mode a near-black translucent navy — painted
  on `rgba(255,255,255,.2)` over a dark gradient. v2 uses `#fff`/butter.
- [x] **The bar lies about finishing.** [`Kiosk.tsx:412`](src/components/Kiosk.tsx#L412) has
  no `ready` state, so it hits 99% and *then* the signed URL still has to download. It
  completes over a dim photo and the look pops in afterwards.
- [x] **Seven competing controls in the result bar.**
  [`Kiosk.tsx:671-763`](src/components/Kiosk.tsx#L671-L763) — find-my-size, add to bag
  (violet), I want this (black), share, save image, save look, view bag, all at
  near-equal weight, two of them full-weight primaries. On a phone it wraps to 4–5
  rows. v2 replaced this with one "I want this" sheet.

**Fix:** make v2 the default and delete v1 (−867 lines), or fix all five in v1.

## T1.2 — The privacy policy states something false

[`privacy/page.tsx:33`](src/app/privacy/page.tsx#L33) says saved looks and the
"remember my photo" photo *"live only on the device you used, inside your browser.
**They are never uploaded to our servers.**"*

- [`looks.ts:158-162`](src/lib/looks.ts#L158-L162) uploads look images to a Supabase
  Storage bucket and rows to `saved_looks`.
- [`looks.ts:253-260`](src/lib/looks.ts#L253-L260) uploads the remembered face photo to
  `PHOTO_BUCKET` and writes `profiles.photo_path`.
- The account page advertises the sync in the same product:
  [`account/page.tsx:18-21`](src/app/account/page.tsx#L18-L21) and the merge banner at
  [`account/page.tsx:138`](src/app/account/page.tsx#L138).

- [x] Rewrite the "What we keep, and where" bullet to describe actual behaviour.
- [x] Rewrite "Your choices" ([`privacy/page.tsx:44`](src/app/privacy/page.tsx#L44)) —
  it describes device-only deletion while `clearAllLooks` deletes from cloud storage.
- [x] Do the same in the Nepali copy ([`privacy/page.tsx:64`](src/app/privacy/page.tsx#L64),
  [`:75`](src/app/privacy/page.tsx#L75)).
- [x] Verify the "expires on its own after 7 days" claim holds for the cloud copy.

## T1.3 — There is no password reset

Email+password auth in [`AuthPage.tsx`](src/components/AuthPage.tsx) and inline
[`CheckoutSignIn`](src/components/storefront.tsx#L430), and no "forgot password?" link
anywhere in the codebase.

- [x] Add a reset flow. Anyone who forgets is permanently locked out of their looks,
  orders, or entire shop.

## T1.4 — "Create your shop free" opens a sign-in form

[`owner/page.tsx:41`](src/app/owner/page.tsx#L41) and
[`owner/page.tsx:167`](src/app/owner/page.tsx#L167) send acquisition traffic to
`/login`, which mounts with `mode = "signin"`
([`AuthPage.tsx:59`](src/components/AuthPage.tsx#L59)) titled "vendor sign in".

- [x] Accept `?mode=signup`, or default `/login` to signup. A new vendor currently
  lands on a form asking for a password they don't have.

## T1.5 — Pending vendors are trapped in a read-only dead end

[`PendingReview.tsx`](src/components/PendingReview.tsx) replaces the whole dashboard
until an admin approves, and is entirely read-only.

- [x] [`PendingReview.tsx:561`](src/components/PendingReview.tsx#L561) says *"we can't
  complete your review — please send us one"* with no field, no email link, no
  WhatsApp, no support contact. A vendor who typo'd their number cannot fix it, cannot
  be called, and cannot be approved. Make the page editable, or at minimum add a
  contact link.
- [x] `tone: "var(--camel)"` for `pending`
  ([`PendingReview.tsx:497`](src/components/PendingReview.tsx#L497)) resolves to the
  same grey as `--mut` — the status heading carries no signal.
- [x] The sign-out button is bare `ph-btn`
  ([`PendingReview.tsx:565`](src/components/PendingReview.tsx#L565)) — `background:
  none; border: none` — so it renders as floating unstyled text.

## T1.6 — `--violet` is currently broken in both themes

```css
--violet: #000937b4;   /* light — 8-digit hex, 70%-opaque navy */
--violet: #bbb288;     /* dark  — khaki */
```
[`globals.css:12`](src/app/globals.css#L12), [`globals.css:197`](src/app/globals.css#L197)

- [x] The comment two lines above the light value describes "a near-black green".
- [x] The dark block's comment requires it be *"cool enough to stay the one thing in a
  brown room that isn't brown"* — `#bbb288` is brown-family khaki.
- [x] The alpha channel means every `--violet` fill composites with whatever is behind
  it — fine on paper, unpredictable over a garment photo or the kiosk stage, and it is
  what makes the progress bar in T1.1 disappear.

Contrast still passes in both themes; this is a brand/consistency regression across
every interactive element.

## T1.7 — 23 modals, zero dialog semantics

`role="dialog"` / `aria-modal`: **0 occurrences.** Escape-to-close: **3**
([`LookViewer.tsx:25`](src/components/LookViewer.tsx#L25),
[`FabricStudio.tsx:516`](src/components/FabricStudio.tsx#L516), and a slug input at
[`Dashboard.tsx:791`](src/components/Dashboard.tsx#L791)).

- [x] Nothing traps focus, moves focus in, restores focus on close, or locks body scroll.
- [x] Backdrop-click-to-close is universal — including
  [`CartDrawer`](src/components/storefront.tsx#L230) mid-checkout with name and phone
  typed, and [`GarmentModal`](src/components/Dashboard.tsx#L850) with a full form
  filled. One stray tap discards the work with no confirmation.
- [x] `LookViewer` closes when you tap the photo itself — users tap photos to zoom.
- [x] Build one `<Dialog>` with dialog semantics, focus trap, Escape, scroll lock and a
  dirty-state guard, then retrofit all 23.

## T1.8 — 24 native `alert()` / `confirm()` dialogs

16 `alert()`, 8 `confirm()`, carrying business-critical messages:

- [x] Plan limits and approval status —
  [`dashboard/page.tsx:83-91`](src/app/dashboard/page.tsx#L83-L91),
  [`:117-125`](src/app/dashboard/page.tsx#L117-L125)
- [x] Shop-settings save failure — [`dashboard/page.tsx:286`](src/app/dashboard/page.tsx#L286)
- [x] Kiosk photo-read failure — [`Kiosk.tsx:306`](src/components/Kiosk.tsx#L306),
  [`KioskV2.tsx:332`](src/components/KioskV2.tsx#L332)
- [x] Image-read failure in both dashboard modals —
  [`Dashboard.tsx:839`](src/components/Dashboard.tsx#L839),
  [`:945`](src/components/Dashboard.tsx#L945)
- [x] Kiosk-launch guard — [`Dashboard.tsx:165`](src/components/Dashboard.tsx#L165)
- [x] Every destructive `confirm()` across account, LooksGallery, LookViewer,
  Dashboard, FabricStudio.

## T1.9 — Failures are silently swallowed

- [x] **8 × `catch {}`** on optimistic writes in
  [`dashboard/page.tsx`](src/app/dashboard/page.tsx): `toggleStock`, `removeGarment`,
  `removeFabric`, `toggleFabricStock`, `publishComposition`, `priceComposition`,
  `noteComposition`, `handleLead`. Network drops → the vendor sees "Out of stock"
  applied, it silently isn't, and the storefront keeps selling it.
- [x] **No `catch` at all** in `requestPlan` / `requestCredits`
  ([`PlanTab.tsx:627-639`](src/components/PlanTab.tsx#L627-L639)) — `try/finally` only.
  A failed billing request produces an unhandled rejection and zero UI change. The
  vendor believes they asked to be upgraded.
- [x] Order-fetch errors become "No orders yet"
  ([`account/page.tsx:243`](src/app/account/page.tsx#L243)) — user can't tell empty
  from broken.

---

# Tier 2 — page by page

## `/` landing — [`page.tsx`](src/app/page.tsx)

- [x] "browse shops" scrolls to "how it works" when no shops are listed
  ([`:127`](src/app/page.tsx#L127), [`:193`](src/app/page.tsx#L193)) — a CTA that lies
  about its destination.
- [x] The section is `id="shops"`, headed "browse shops", contains garments, and the
  subtitle says "12 pieces from 3 shops". Pick one noun.
- [x] Hero auto-advances forever every 3s with no pause control
  ([`HeroTryOn.tsx:41-49`](src/components/HeroTryOn.tsx#L41-L49)) — WCAG 2.2.2.
- [x] It also ignores `prefers-reduced-motion`, while
  [`HeroCarousel.tsx:65`](src/components/HeroCarousel.tsx#L65) checks it properly. Two
  carousels, two behaviours.
- [x] All four hero photos sit in the DOM with `alt="You wearing this fit"`
  ([`HeroTryOn.tsx:55`](src/components/HeroTryOn.tsx#L55)), hidden only by opacity — a
  screen reader announces four identical images, and the alt is false (stock model).
- [x] `aria-label="try fit 1"` vs visible "fit 01"; when active the visible label
  becomes "on you ✓" while the aria-label stays "try fit 1"
  ([`:71-73`](src/components/HeroTryOn.tsx#L71-L73)).
- [x] Feed cards use raw `<img>` ([`:240`](src/app/page.tsx#L240)) while the rest of the
  app routes through `GarmentImage`.
- [x] The "peeq it" pill only appears on `:hover`
  ([`globals.css` `.feed-cta`](src/app/globals.css#L604)) — invisible on every phone.
  It also says "peeq it" while linking to the product page, not the try-on.
- [x] Nav layout jumps: `{shops.length > 0 && <a href="#shops">}` conditionally adds a link.
- [x] Footer has one link (privacy). No terms, contact, or about.

## `/owner` — [`owner/page.tsx`](src/app/owner/page.tsx)

- [x] "book a free demo call" goes to `cal.com/contractorops/15min`
  ([`:130`](src/app/owner/page.tsx#L130)) — a vendor clicking the primary trust CTA
  lands on a page branded "contractorops".
- [x] Six full-bleed screenshots, all raw `<img>`, none lazy-loaded, none with
  dimensions ([`:72`](src/app/owner/page.tsx#L72), [`:87`](src/app/owner/page.tsx#L87),
  [`:102`](src/app/owner/page.tsx#L102), [`:117`](src/app/owner/page.tsx#L117)) —
  with `max-height: 400px; object-fit: cover` and no `aspect-ratio`, every row shifts
  on load.
- [x] Nav shows "vendor log in" *and* the AccountMenu avatar
  ([`:29-30`](src/app/owner/page.tsx#L29-L30)).
- [x] Footer drops the privacy link the landing footer has.
- [x] Step circles are 38px/17px on landing, 36px/16px here. Body copy runs
  14 / 14.5 / 15 / 15.5px across four sections.

## `/signin` + `/login` — [`AuthPage.tsx`](src/components/AuthPage.tsx)

- [x] Placeholder-as-label on both fields ([`:176`](src/components/AuthPage.tsx#L176),
  [`:180`](src/components/AuthPage.tsx#L180)) — once you type, the field is unlabelled.
- [x] `aria-invalid` set but no `aria-describedby` tying error text to the input, and
  field errors have no `role` ([`:179`](src/components/AuthPage.tsx#L179),
  [`:184`](src/components/AuthPage.tsx#L184)) — never announced.
- [x] No password-reveal toggle. No autofocus.
- [x] "An account with this email already exists — sign in below" renders in
  `role="alert"` + `var(--danger)` ([`:193`](src/components/AuthPage.tsx#L193)) —
  informational message styled as failure.
- [x] Raw Supabase `error.message` surfaced to users
  ([`:150`](src/components/AuthPage.tsx#L150)).
- [x] Nothing links to `/privacy` from either auth surface; no terms acceptance on signup.
- [x] `var(--sage)` / `var(--cream)` / `var(--forest-deep)` here vs
  `--paper` / `--card` / `--ink` on shopper pages.

## `/account` — [`account/page.tsx`](src/app/account/page.tsx)

- [x] Bespoke header ([`:117-127`](src/app/account/page.tsx#L117-L127)) instead of
  `.efc-nav`. No AccountMenu, and the wordmark isn't a link home — it is everywhere else.
- [x] Heart pill is `rgba(255,255,255,.9)` with `color: var(--stone)`
  ([`:202`](src/app/account/page.tsx#L202)) → dark mode gives `#C7B299` on white ≈
  **2.0:1**. Same bug in [`storefront.tsx:28`](src/components/storefront.tsx#L28);
  [`parts.tsx:113`](src/components/kiosk/parts.tsx#L113) does it correctly with
  `var(--card)`. Three copies of one control, one broken.
- [x] "delete everything" is a 12.5px grey underlined link in `--stone`
  ([`:182`](src/app/account/page.tsx#L182)) — the most destructive action on the page is
  quieter than "share". `--danger` exists.
- [x] "not now" on the merge banner only does `setPendingLooks(0)`
  ([`:145`](src/app/account/page.tsx#L145)) — not persisted, so it nags next visit.
- [x] "saved ✓" swaps the button label for 1600ms with no `aria-live`
  ([`:170`](src/app/account/page.tsx#L170)); `saveContact` failure is unhandled.
- [x] Order status "confirmed by shop" uses `var(--violet)`
  ([`:309`](src/app/account/page.tsx#L309)) — `--ok` is the token for this.
- [x] Dates hardcoded `"en-GB"` ([`:303`](src/app/account/page.tsx#L303)) in a
  bilingual EN/NE product.
- [x] Placeholder-as-label on name and phone ([`:159`](src/app/account/page.tsx#L159),
  [`:164`](src/app/account/page.tsx#L164)).
- [x] Look cards use `borderRadius: 16` while sibling sections use `--radius-card` (20).

## `/s/[slug]` storefront — [`StorefrontClient.tsx`](src/app/s/[slug]/StorefrontClient.tsx)

- [x] **The same 4 photos appear three times on one page.**
  `heroSlides = inStock.slice(0,5)`, `featured = inStock.slice(0,4)`
  ([`:92-96`](src/app/s/[slug]/StorefrontClient.tsx#L92-L96)), then the full collection.
  `featured[1]` shows a *fourth* time in the try-on promo
  ([`:243`](src/app/s/[slug]/StorefrontClient.tsx#L243)). A shop with 6 items looks like
  it has 2.
- [x] **Two sort options do nothing different**: "Sort: Featured" and "Newest first"
  both fall through to `() => 0`
  ([`:105-108`](src/app/s/[slug]/StorefrontClient.tsx#L105-L108)). Only one option is
  prefixed "Sort:".
- [x] **Dark-mode invisible text**: the footer "ask" input sets
  `color: "var(--paper)"` on a `--slab` panel
  ([`:329`](src/app/s/[slug]/StorefrontClient.tsx#L329)). In dark mode `--paper` is
  `#1E1310` and `--slab` is `#4A2A20` — ~1.5:1. This is the exact trap
  [`globals.css:82-91`](src/app/globals.css#L82-L91) warns about in prose.
- [x] **404 is a dead end** ([`:73-79`](src/app/s/[slug]/StorefrontClient.tsx#L73-L79))
  — no link home, no nav. Same in the loading state
  ([`:81-88`](src/app/s/[slug]/StorefrontClient.tsx#L81-L88)) and in
  [`k/[slug]/page.tsx:47-56`](src/app/k/[slug]/page.tsx#L47-L56).
- [x] Nav category links are `<a href="#collection">` that also set filter state
  ([`:139`](src/app/s/[slug]/StorefrontClient.tsx#L139)) — no active state, unlike the
  chips below doing the same job.
- [x] Nav jumps: the "saved (n)" button appears the instant you heart something
  ([`:151`](src/app/s/[slug]/StorefrontClient.tsx#L151)).
- [x] Search has no label, no clear button, no `aria-live` result count.
- [x] Out-of-stock cards dim the whole card to `opacity: 0.6`
  ([`storefront.tsx:55`](src/components/storefront.tsx#L55)) — name and price fail
  contrast — plus a "sold out" button in `--line` on `--stone`.
- [x] Every card carries both "see it on you →" and a redundant "details" link
  duplicating the card and title links
  ([`storefront.tsx:88-97`](src/components/storefront.tsx#L88-L97)).
- [x] Announce bar claims "no account needed" above a checkout that pitches signup.

## Cart / checkout — [`storefront.tsx`](src/components/storefront.tsx)

- [x] Backdrop-click closes the drawer mid-checkout and destroys typed details (T1.7).
- [x] **Enter in the phone field places the order**
  ([`:388`](src/components/storefront.tsx#L388)) — no confirm; Enter in the name field
  does nothing; it isn't a `<form>` at all.
- [x] `CheckoutSignIn` is a full email+password signup in a drawer with no privacy
  link, no reset, no reveal.
- [x] Its messages use `fieldErrorStyle` overridden to `color: var(--stone)`
  ([`:510`](src/components/storefront.tsx#L510)) — errors in grey, everywhere else in
  `--danger`.
- [x] Its toggle reads "sign in", then becomes **"not now"** when expanded
  ([`:499`](src/components/storefront.tsx#L499)) — implies dismissal, actually collapses.
- [x] The done screen header says "order sent"
  ([`:240`](src/components/storefront.tsx#L240)) while the body says WhatsApp is still
  waiting for you to press send ([`:266`](src/components/storefront.tsx#L266)).
- [x] Empty-bag "browse the collection" just closes the drawer
  ([`:286`](src/components/storefront.tsx#L286)).
- [x] Qty ± buttons are 32×32 ([`:547`](src/components/storefront.tsx#L547)); "remove"
  is a 12px underlined link.

## `/s/[slug]/[garment]` product — [`ProductClient.tsx`](src/app/s/[slug]/[garment]/ProductClient.tsx)

- [x] **The largest image on the site is a raw `<img>`**
  ([`:131`](src/app/s/[slug]/[garment]/ProductClient.tsx#L131)) while every thumbnail
  goes through `GarmentImage`.
- [x] **Related cards ignore the shop's try-on state.** `ShopCard` is called without
  `shop`/`tryOn` ([`:154`](src/app/s/[slug]/[garment]/ProductClient.tsx#L154)), so it
  defaults to `{type:"apparel", enabled:true}` — a general or credit-exhausted shop
  hides the main CTA then offers "see it on you" on four cards below it.
  [`TryOnCta.tsx:20`](src/components/TryOnCta.tsx#L20) warns about exactly this.
- [x] **Nav parity broken with the storefront**: plain `account`/`sign in` link instead
  of `AccountMenu` ([`:104`](src/app/s/[slug]/[garment]/ProductClient.tsx#L104)), no
  wishlist button, no Contact, no categories, no announce bar. Navigating between the
  two pages shifts the whole layout.
- [x] `aria-label={`Bag, ${cart.count} items`}`
  ([`:106`](src/app/s/[slug]/[garment]/ProductClient.tsx#L106)) — "Bag, 1 items". The
  storefront pluralises.
- [x] Breadcrumb's category segment isn't a link
  ([`:121`](src/app/s/[slug]/[garment]/ProductClient.tsx#L121)).
- [x] Out of stock hides sizes, qty, add-to-bag *and* try-on, leaving a near-empty page
  with one WhatsApp button and no "notify me". `· out of stock` renders in
  `var(--forest)` ([`:204`](src/app/s/[slug]/[garment]/ProductClient.tsx#L204)) — plain
  ink, no status colour.
- [x] Size buttons aren't a radiogroup, have no `aria-pressed`, and the "please pick
  one" error has no `role="alert"`
  ([`:212`](src/app/s/[slug]/[garment]/ProductClient.tsx#L212)). `borderRadius: 11`
  appears exactly once in the codebase, here.
- [x] `document.title` in a `useEffect`
  ([`:63`](src/app/s/[slug]/[garment]/ProductClient.tsx#L63)) — title flashes, SEO gets
  the layout default. Same in [`privacy/page.tsx:89`](src/app/privacy/page.tsx#L89).
- [ ] One photo per product, no zoom, no gallery. **Not done** — `Garment` holds a
  single `image`, so this needs a schema and upload change, not a UI change.

## Kiosk (both versions)

- [x] **The upload dropzone is a `<div onClick>`**
  ([`Kiosk.tsx:321`](src/components/Kiosk.tsx#L321),
  [`KioskV2.tsx:346`](src/components/KioskV2.tsx#L346)) with a `display:none` file input
  — no `role`, no `tabIndex`. **Keyboard and screen-reader users cannot upload a
  photo**, the entry point to the entire product. Same for the camera-denied fallback
  ([`Kiosk.tsx:336`](src/components/Kiosk.tsx#L336)).
  [`CounterTryOn.tsx:767`](src/components/CounterTryOn.tsx#L767) and
  [`FabricStudio.tsx:666`](src/components/FabricStudio.tsx#L666) already do this
  correctly with `<button type="button" aria-label=…>` — copy that.
- [x] That box has a 2px dashed border and **no `onDrop` handler**. Dashed border is
  the universal drop-target convention; on desktop, dropping a photo navigates away.
- [~] **No way to cancel a generation.** A mis-tap costs the shopper 1–2 minutes and
  the vendor a credit. *(Fixed for the shopper's time — "stop waiting" aborts the
  request and returns them to the rack. The credit is committed server-side the
  moment the request starts, so the confirm sheet remains what protects it.)*
- [x] The generating overlay has **no `aria-live`** — total silence for the whole wait.
- [x] **Hold-to-compare is pointer-only** ([`Kiosk.tsx:628`](src/components/Kiosk.tsx#L628),
  [`KioskV2.tsx:870`](src/components/KioskV2.tsx#L870)) — no keyboard equivalent.
- [x] **No browser-history integration.** Both kiosks are `position: fixed` shells with
  internal phase state; on the phone of a shopper who arrived by QR, Android back exits
  the site instead of stepping back a phase.
- [x] `?shared=1` is the only way to put a shop tablet into shared mode
  ([`k/[slug]/page.tsx:83`](src/app/k/[slug]/page.tsx#L83)) — a privacy-critical
  setting with no UI. Get it wrong and one shopper's face and phone prefill for the next.
- [x] v2 mixes two accents in one room: attract kicker, `/account` link, dashed upload
  border, find-my-size chip and save-look heart all use `var(--violet)` while CTAs use
  `var(--k2-accent)` ([`KioskV2.tsx:233`](src/components/KioskV2.tsx#L233),
  [`:268`](src/components/KioskV2.tsx#L268), [`:348`](src/components/KioskV2.tsx#L348),
  [`:901`](src/components/KioskV2.tsx#L901), [`:921`](src/components/KioskV2.tsx#L921)).
  In dark mode those are two visibly different colours.
- [x] v2's `WantThisSheet` "added ✓" flips back to "add to bag" after 2200ms while the
  sheet is open ([`KioskV2.tsx:800`](src/components/KioskV2.tsx#L800)) — the button
  jitters under the thumb.
- [x] `FindMySizeSheet` disables save at `opacity: .6` with no message explaining why
  ([`parts.tsx:391`](src/components/kiosk/parts.tsx#L391)). Type 300cm and nothing tells
  you anything.
- [x] The AI-result disclaimer is 11px ([`Kiosk.tsx:762`](src/components/Kiosk.tsx#L762)).
- [x] `/kiosk` "nothing listed yet" and `/k/[slug]` "shop not found" offer no
  navigation out.

## `/dashboard` — [`Dashboard.tsx`](src/components/Dashboard.tsx)

- [x] **Apparel vendors have no link to their own storefront.** "view storefront" only
  renders in the non-apparel branch ([`:184`](src/components/Dashboard.tsx#L184));
  apparel shops must dig the URL out of Settings.
- [x] **Clicking a garment's photo opens its QR modal**
  ([`:265`](src/components/Dashboard.tsx#L265)) — not edit, not preview — and there's
  already a "QR" button two lines below. On the Fabrics tab the same click opens the
  studio ([`:357`](src/components/Dashboard.tsx#L357)). Same gesture, two outcomes.
- [x] **"In stock" is a toggle labelled with its current state**
  ([`:306-309`](src/components/Dashboard.tsx#L306-L309)) — tapping the button that says
  "In stock" makes it out of stock.
- [x] Card action row is `fontSize: 11, padding: "4px 5px"`
  ([`:298-309`](src/components/Dashboard.tsx#L298-L309)) → ~20×24px tap targets, on the
  surface the marketing says vendors run from a phone.
- [x] Everything on that card is under 12px: code 10.5, name 11.5 with `.12em`
  tracking, size chips 10, actions 11.
- [x] **The "orders to call back" alert is invisible as an alert**
  ([`:210`](src/components/Dashboard.tsx#L210)) — `border: 1px solid var(--camel)` and
  `<b style={{color: var(--camel)}}>`, and `--camel` resolves to the identical grey as
  `--mut`. `--warn` exists.
- [x] The two kiosk buttons diverge on the same guard: "launch kiosk" alerts then
  switches tab, "try v2" silently switches tab
  ([`:163-177`](src/components/Dashboard.tsx#L163-L177)).
- [x] `sign out` sits immediately left of the primary CTA as 12px grey text
  ([`:154`](src/components/Dashboard.tsx#L154)).
- [x] `GarmentModal` / `FabricModal`: placeholder-only labels, `canSave` needs only
  name+image so **price silently saves as 0**, and no explanation of why save is
  disabled ([`:846`](src/components/Dashboard.tsx#L846),
  [`:949`](src/components/Dashboard.tsx#L949)).
- [x] No AccountMenu anywhere in the dashboard — every other page has it.

## Analytics tab — [`Analytics.tsx`](src/components/Analytics.tsx)

- [x] **The 30-day chart is unreadable on a phone.** Values exist only in a `:hover`
  tooltip ([`:199`](src/components/Analytics.tsx#L199)). No axis, gridlines, labels,
  touch handler, or accessible table.
- [x] Hover state is *lighter* than rest state — `--forest` (near-black) → `--camel`
  (grey) ([`:194`](src/components/Analytics.tsx#L194)). Highlighting reads as disabling.
- [x] **"Most-tried items — last 90 days" is mislabelled**: `garmentRows` aggregates
  over *all* events with no cutoff ([`:69-83`](src/components/Analytics.tsx#L69-L83)).
- [x] Orders **silently truncate at 50** ([`:292`](src/components/Analytics.tsx#L292))
  — no count, no pagination, no "showing 50 of N".
- [~] No search, no open/closed filter, no date range on the orders inbox. CSV export
  covers try-ons only; orders can't be exported. *(Search, open/done filter,
  paging with a live count, and an orders CSV all shipped. No date range — the
  search box covers the cases a date range was standing in for.)*
- [x] Handled orders dim to `opacity: 0.55` including the phone number
  ([`:324`](src/components/Analytics.tsx#L324)); Done/Reopen look identical in both states.
- [x] `timeAgo` computes at render ([`:22`](src/components/Analytics.tsx#L22)) —
  timestamps go stale in a tab left open.

## Plan tab — [`PlanTab.tsx`](src/components/PlanTab.tsx)

- [x] **No downgrade or cancel path.** `canRequest = p.priceNpr > 0 && p.sort >
  sub.plan.sort` ([`:694`](src/components/PlanTab.tsx#L694)) — a paying vendor can only
  ever move up.
- [x] Success notice uses `--sage`/`--forest` ([`:661`](src/components/PlanTab.tsx#L661))
  — no `--ok` — and never clears.
- [x] Silent request failure (T1.9).

## Onboarding — [`Onboarding.tsx`](src/components/Onboarding.tsx)

Best form in the app: real `<label>`s, required marker, per-field validation,
Enter-to-submit. Two problems:

- [x] **[`LocationPicker.tsx:38`](src/components/LocationPicker.tsx#L38) creates its map
  with no `scrollWheelZoom: false`** — [`ShopsMap.tsx:30`](src/components/ShopsMap.tsx#L30)
  sets it. Scrolling the form over the map zooms the map; on mobile a one-finger drag
  pans the map instead of scrolling the page. The vendor gets stuck mid-form.
- [x] The map is "Optional" here and unlabelled in Settings
  ([`Dashboard.tsx:691`](src/components/Dashboard.tsx#L691)).

## `/admin` — [`AdminShell.tsx`](src/app/admin/AdminShell.tsx), [`admin/page.tsx`](src/app/admin/page.tsx)

- [x] The nav re-implements `.tabs` from scratch and uses a `--butter-deep` underline
  for active ([`:93`](src/app/admin/AdminShell.tsx#L93)) where the vendor dashboard uses
  `--violet`. Two active-tab languages in one product.
- [x] Urgency has three vocabularies: queues use `--butter-deep`
  ([`admin/page.tsx:318`](src/app/admin/page.tsx#L318)), errors use `--danger`, meters
  use `--warn`.
- [x] `Queue` cards are `<Link>`-wrapped divs with no hover or focus styling
  ([`admin/page.tsx:313`](src/app/admin/page.tsx#L313)).
- [x] `forbidden` / `unauth` render in `--mut` grey via `Note`
  ([`:107-118`](src/app/admin/AdminShell.tsx#L107-L118)) — an access denial styled as a hint.
- [x] "← dashboard" sends an admin to `/dashboard`, which for an admin with no shop
  triggers vendor onboarding.

## `/compare` — [`CompareClient.tsx`](src/app/compare/CompareClient.tsx)

- [x] **Public route, no auth**, and `/api/compare` spends real OpenAI + fal credits.
  "dev tool · not linked anywhere" is not access control.
- [x] The upload control is a `<label>` wrapping a hidden input
  ([`:136-143`](src/app/compare/CompareClient.tsx#L136-L143)) — labels aren't focusable,
  so it's keyboard-unreachable.

## `/privacy` — [`privacy/page.tsx`](src/app/privacy/page.tsx)

Beyond the false claims in T1.2:

- [x] `<h1>` → `<h3>`, skipping h2 ([`:124`](src/app/privacy/page.tsx#L124)).
- [x] Nepali users get a flash of English before `localStorage` is read on mount
  ([`:88-94`](src/app/privacy/page.tsx#L88-L94)).
- [x] Footer has no links at all — not even home.

---

# Tier 3 — systemic

- [x] **Pinch-zoom disabled sitewide.** `maximumScale: 1, userScalable: false`
  ([`layout.tsx:21-22`](src/app/layout.tsx#L21-L22)) — WCAG 1.4.4, on a shopping site
  where people zoom into fabric. Delete both lines.
- [x] **13 hardcoded radius values** despite 3 radius tokens: `999`×72, `2`×17, `6`×15,
  `14`×11, `12`×11, `5`, `20`, `18`, `3`, `8`, `16`, `4`, `11`. Inputs alone are 12px,
  14px and `--radius-btn` (20px) on three different pages.
- [x] **Two token vocabularies.** Vendor/admin surfaces run on
  `--forest-deep`/`--mut`/`--camel`/`--sage`/`--cream`; shopper surfaces on
  `--ink`/`--stone`/`--card`/`--paper`. Same values, so it "works" — until `--camel` is
  used as an accent and resolves to body-text grey. Three real bugs come from that one
  aliasing: the Dashboard orders alert, the Analytics chart hover, the PendingReview
  status colour.
- [x] **`.efc-chip` resizes on select.** Base is `border: none`, `.off` adds
  `1px solid` ([`globals.css:350-352`](src/app/globals.css#L350-L352)) — the selected
  chip is 2px smaller and the whole row shifts.
- [x] **`opacity: 0.6` used as a state** on out-of-stock storefront cards, out-of-stock
  dashboard cards, and handled orders. It dims the *text* below contrast minimums. Use
  a badge and a muted image instead.
- [x] **20 of 52 inputs are placeholder-only**: AuthPage, account, InterestedModal,
  GarmentModal, FabricModal, storefront search, footer ask. `.field` already provides
  the right pattern, and `Onboarding` / `FindMySizeSheet` use it.
- [~] **66 raw `<img>`, 1 file importing next/image** — including the product hero and
  all six `/owner` screenshots. *(Both named cases fixed, plus the landing feed.
  The rest are `data:`, `blob:` and expiring signed URLs — uploaded previews,
  saved looks, try-on renders — which next/image cannot optimise; they now
  declare dimensions instead.)*
- [x] **16 × `100vh`**, not `dvh`/`svh`. `.k-stage` uses `52vh` at desktop and `56svh`
  under 640px — inconsistent within one rule.
- [x] **8px carousel dots** ([`globals.css:492`](src/app/globals.css#L492)) — WCAG 2.5.8
  wants 24px.
- [x] **Hover-only affordances.** Carousel arrows are `opacity: 0` until hover *and*
  `hide-sm` ([`globals.css:503-513`](src/app/globals.css#L503-L513)) — unreachable on
  touch, invisible on desktop until found. Same for the feed "peeq it" pill and chart
  tooltips.
- [x] **`'Baloo 2', cursive`** in 11 rules. If Baloo fails to load, every heading and
  button falls back to Comic Sans / Apple Chancery. Use `sans-serif`.
- [x] **Fonts via CSS `@import`** ([`globals.css:1`](src/app/globals.css#L1)) — blocking
  request, no `next/font`, no preload, FOUT on every page.
- [x] **`prefers-reduced-motion` kills all transitions.**
  `* { transition: none !important }` ([`globals.css:790`](src/app/globals.css#L790))
  removes state feedback along with decoration, and doesn't stop the JS-driven hero
  cycle anyway.
- [x] **No skip-to-content link** on any page.
- [x] **Z-index has no scale**: 40 kiosk, 50 garment/fabric/QR modals, 55 studio +
  LooksGallery, 58 render viewer, 60 CartDrawer + sheets + TagSheet, 80 AccountMenu,
  90 idle toast. CartDrawer and ConfirmTryOn both sit at 60 and can co-exist.

---

## Closing note

The design system underneath this is unusually thoughtful — the token comments in
[`globals.css`](src/app/globals.css) reason about failure modes most codebases never
notice. The gap isn't taste. It's that the components predate the system and were never
brought up to it, and that two versions of the most important screen are shipping side
by side with the wrong one on by default.

</details>

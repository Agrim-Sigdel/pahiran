# Changes — traditional shopping, product pages, shopper accounts

_Session summary. Companion to [STATUS.md](./STATUS.md) and [PRODUCT_PLAN.md](./PRODUCT_PLAN.md)._

This session added three things and fixed one:

1. **A traditional shopping experience** on the storefront (cart, sizes, search/sort, wishlist).
2. **Real product pages** (`/s/[slug]/[garment]`) with server-rendered share cards.
3. **Shopper accounts** (email/password; Google OAuth deferred) that sync saved try-ons, cart, wishlist and checkout details across devices.
4. **Kiosk deep-link fix** — a scanned/linked garment now shows *only* that piece.

Everything is **dual-mode**: it keeps running exactly as before in local mode (no Supabase), and the account/cloud features light up when Supabase is configured. Nothing here changes the live device-only behaviour until you turn Supabase on.

---

## 1. Traditional shopping UX

The storefront (`/s/[slug]`) went from "browse → one-off WhatsApp" to a normal shop:

- **Cart** — persistent bag (per shop), `🛍 bag (N)` badge in the nav, slide-in cart drawer with quantity steppers and a running total.
- **Size + quantity** — tap-to-select size (required before adding), quantity stepper.
- **CTA hierarchy flipped** — **Add to bag** is the primary action; **see it on you** (AI try-on) is now secondary.
- **Search + sort** — search box + sort (Featured / Newest / Price ↑ / Price ↓).
- **Wishlist** — ♥ heart on every card, a `saved (N)` nav entry and a **Saved** filter chip. Distinct from the kiosk's try-on "My Looks".
- **Checkout** — the bag bundles into **one itemised order** that goes to WhatsApp **and** the vendor leads inbox. Both channels are env-toggleable:
  - `NEXT_PUBLIC_CHECKOUT_WHATSAPP=0` disables the WhatsApp handoff
  - `NEXT_PUBLIC_CHECKOUT_LEADS=0` disables leads-inbox capture

---

## 2. Real product pages + server-rendered share cards

- New route **`/s/[slug]/[garment]`** — a linkable/bookmarkable page per garment: large photo, size picker, quantity, add-to-bag, "see it on you", "ask on WhatsApp", wishlist heart, breadcrumb, and a **"more from this shop"** grid. Replaces the old quick-view modal (deleted).
- Both storefront routes are now **server components** that emit real `<title>`, description, **Open Graph** and **Twitter** tags via `generateMetadata`. The product page uses the **garment photo as the OG image**, so a pasted link renders a proper share card.
- Shared UI (card, cart drawer, wishlist heart) was extracted to `src/components/storefront.tsx` so the collection and product pages behave identically.

> ⚠️ **Rich share previews only work in Supabase mode + deployed.** In local mode there's no server-side data, so metadata falls back to the generic site card. See "Known gaps".

---

## 3. Shopper accounts (email/password)

> **Google OAuth is deferred** — you asked to add it later. The "Continue with Google" button and the `/auth/callback` route have been removed; only email/password sign-in is active. Re-adding it means enabling the Google provider in Supabase + Google Cloud, restoring the button on `/signin`, and recreating `/auth/callback`.

- **Unified sign-in at `/signin`** (shoppers and vendors). `/login` now redirects there with the vendor intent preselected.
- **Role model** — `profiles.role` (`shopper` | `vendor`). A shopper never gets a shop auto-provisioned; the dashboard redirects shopper accounts to `/account`. `ensureRole()` never re-roles an existing account.
- **What syncs to an account** (all via Supabase, private + per-user):
  - **Saved try-on looks** → private `looks` bucket + `saved_looks` table, viewable on any device at `/account`.
  - **Remembered try-on photo** → private `shopper-photos` bucket.
  - **Cart + wishlist** → `shopper_bags` table (adopts the cloud bag on login, else seeds it from local).
  - **Checkout / lead prefill** → `profiles.name` / `profiles.phone` auto-fill the cart and the kiosk "I want this" form.
- **Privacy:** shopper likenesses live in **private** buckets keyed by user id (RLS by `auth.uid()`), served via short-lived signed URLs — the shop can't see them. Consent copy was updated to say saved data syncs privately to the shopper's own account.

---

## 4. Kiosk deep-link fix

Arriving at `/k/[slug]?g=<garmentId>` (hanger QR or a "see it on you" link) now locks the kiosk to **that one garment** — the rack, category chips and session filmstrip are hidden. (An *empty* `?g=` still shows the full rack.)

---

## Files

**New**
- `src/lib/cart.ts` — cart + wishlist hooks (localStorage + cloud sync)
- `src/lib/account.ts` — session hook, email auth, roles, contact
- `src/lib/looks.ts` — *rewritten* to be account-aware (cloud ↔ IndexedDB)
- `src/lib/storefront-server.ts` — server-only reads for page metadata
- `src/components/storefront.tsx` — shared card / cart drawer / heart
- `src/components/AccountMenu.tsx` — shared signed-in/out nav affordance
- `src/app/s/[slug]/StorefrontClient.tsx` — the interactive collection UI
- `src/app/s/[slug]/[garment]/page.tsx` + `ProductClient.tsx` — product page
- `src/app/account/page.tsx` — account hub (looks, details, delete)
- `src/app/signin/page.tsx` — unified sign-in (email/password)
- `supabase/migrations/20260720_shopper_accounts.sql` — schema + buckets + RLS

**Changed**
- `src/app/s/[slug]/page.tsx` — now a server wrapper (metadata) around the client
- `src/components/Kiosk.tsx` — deep-link lock, sign-in nudge, lead prefill, consent copy
- `src/app/login/page.tsx` — redirects to `/signin`
- `src/app/dashboard/page.tsx` — role guard (shoppers → /account)
- `src/lib/constants.ts` — `CHECKOUT` toggles + order helpers
- `.env.example` — checkout toggles + account setup notes

---

## ✅ Things you need to do (to turn on accounts + share cards)

None of this is needed for local mode — the app already runs. These activate the cloud/account features.

1. **Create a Supabase project** (if not already) and run, in the SQL editor, in order:
   - `supabase/schema.sql`
   - every file in `supabase/migrations/` — **including the new `20260720_shopper_accounts.sql`**
2. **Confirm two private buckets exist**: `looks` and `shopper-photos` (the migration creates them; check Storage → Buckets, both should be **not public**).
3. **(Deferred) Google sign-in** — skipped for now. Email/password works without any extra setup. Add OAuth later per the note in `.env.example`.
4. **Set env vars** (`.env.local` and your host):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://<your-domain>` — **required for absolute OG image URLs** (and OAuth redirects when you add Google later)
   - Optional: `NEXT_PUBLIC_CHECKOUT_WHATSAPP` / `NEXT_PUBLIC_CHECKOUT_LEADS` (default on)
5. **Deploy** — share-card previews and cross-device QR links only work on a public URL.

---

## 🔍 How to verify

### Local mode (works right now — `npm run dev`)
- **Storefront** `/s/<anything>`: browse, search, sort, wishlist heart, category chips.
- **Product page**: click any card → lands on `/s/<slug>/<id>`; pick a size (required), change qty, **add to bag**.
- **Cart**: 🛍 badge counts up; open drawer; change quantities; enter name + phone → **place order** opens WhatsApp with an itemised message. (Leads are stored in *this* browser in local mode.)
- **Kiosk deep link**: open `/k/<slug>?g=<a real garment id>` → only that garment shows, auto-tries-on; the rack is hidden. `/k/<slug>?g=` (empty) → full rack.
- **Accounts**: `/account` and `/signin` show "accounts aren't on yet" — expected in local mode.

### Supabase mode (after the setup above)
- **Sign in** at `/signin` — email/password (Google deferred); a remembered session bounces you straight to your home.
- **Save a look** in the kiosk while signed in → it appears at `/account`, and on a **second device/browser** after signing in (cross-device proof).
- **Cart/wishlist**: add items on one device, sign in on another → the bag follows you.
- **Checkout prefill**: signed-in shopper's name/phone auto-fill the cart and the kiosk "I want this" form.
- **Leads**: complete a cart checkout → each line shows up in the **vendor dashboard → Leads**.
- **Role separation**: sign in as a shopper, then visit `/dashboard` → you're redirected to `/account` (no stray shop created). Sign in via `/signin?intent=vendor` (or `/login`) → dashboard.
- **Share card**: paste a deployed product URL (`https://<domain>/s/<slug>/<id>`) into WhatsApp/Facebook/Twitter → the **garment photo + name + price** appear. (Test with a validator: [OpenGraph.xyz](https://www.opengraph.xyz/) or Facebook Sharing Debugger.)
- **Privacy check**: in Supabase → Storage, confirm `looks` / `shopper-photos` are **private** and objects are namespaced `‹user-id›/…`.

---

## ⚠️ Known gaps / follow-ups

- **OG previews need Supabase + deploy + `NEXT_PUBLIC_SITE_URL`.** Local mode and preview-less hosts fall back to the generic card. This is expected, not a bug.
- **Leads rate limit**: `/api/lead` caps 5 inserts / 10 min per IP, so a cart with >5 distinct items may drop some lead rows (WhatsApp still carries the full order). If big carts are common, add a batch lead endpoint.
- **Cart merge on login is naive** — "adopt cloud if it has items, else seed from local." No true multi-device conflict resolution.
- **Email sign-up confirmation**: Supabase may require email confirmation before first sign-in (default). Turn it off in Auth settings for a frictionless flow, or keep it and users confirm via email.
- **Not yet done**: online payment for shopper orders (eSewa/Khalti are wired for *vendor plans* only); "your orders" history for shoppers; product image galleries (one photo per garment today).

---

## Session addendum — unified auth + consistent navigation

_Follow-up session. Goal: vendors and shoppers can sign in from anywhere, the remembered session is visible on every page, navigation is consistent, and looks saved on a device before signing in aren't lost._

### What I changed

1. **One smart sign-in page — `/signin`** (`src/app/signin/page.tsx`, new).
   - Single email/password card with an **intent toggle** ("I'm shopping" / "I sell on peeq"). Intent only matters for a brand-new account.
   - A **remembered session** is detected on load and bounced straight to the role's home (vendor → `/dashboard`, shopper → `/account`) — no re-login.
   - Local mode (no Supabase) → "open dashboard" shortcut, same as the old `/login`.
   - _Note: Google OAuth is intentionally deferred for now — the page and `src/lib/account.ts` are email/password only. The `/auth/callback` route is left in place so OAuth can be re-added later with no rewiring._

2. **Role-safe stamping — `src/lib/account.ts`.**
   - New `ensureRole(intent)` — honours an existing role and never re-roles an account; only stamps `intent` when there's no role yet. This means signing in from the "wrong" surface can no longer flip a vendor into a shopper (or vice-versa).
   - New `roleHome(role)` helper. `useAccount()` now also returns the user's `role` (drives the nav chip).
   - `/auth/callback` now routes through `ensureRole` + `roleHome`.

3. **Shared account chip on every page — `src/components/AccountMenu.tsx` (new).**
   - Signed out → a `sign in` link to `/signin`.
   - Signed in → an avatar chip with a menu: shopper sees **My looks**, vendor sees **Dashboard**, plus **Sign out**.
   - Renders nothing in local mode. Added into the nav of the **landing** (`/`), **owner** (`/owner`), and **storefront** (`/s/[slug]`) pages.

4. **Old entry points funnel into `/signin`.**
   - `/login` → redirects to `/signin?intent=vendor` (kept for old bookmarks/PWA).
   - `/owner` CTAs ("create your shop", "vendor log in") → `/signin?intent=vendor`.
   - `/account` while **signed out** → redirects to `/signin`; it's now purely the signed-in shopper hub.

5. **Device → account look migration — `src/lib/looks.ts` + `/account`.**
   - Looks saved anonymously live in the browser (IndexedDB); once you sign in, the app reads only the cloud, so those looks used to be orphaned.
   - New `deviceLooksCount()` and `migrateDeviceLooksToCloud()` (uploads each device look's image + row, carries over the remembered photo if the account has none, then clears the device).
   - The `/account` hub now shows a banner — **"N looks saved on this device — add them to your account?"** with **add to my account** / **not now**. (Cart & wishlist already auto-merge silently.)

Build (`npx next build`) and typecheck (`npx tsc --noEmit`) are clean.

### What you need to do

- **Nothing for it to build** — it compiles and typechecks as-is.
- **To exercise the auth/nav features**, run with Supabase configured (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — same env as documented above. No new tables or buckets: migration reuses the existing `saved_looks` table and `looks` / `shopper-photos` buckets.
- **Manually verify these flows** (Supabase mode):
  1. Sign in as a shopper → land `/account`; open `/` and `/owner` → the account chip shows "My looks"; refresh → still signed in.
  2. Save 1–2 looks on `/k/<slug>` while signed out → sign in → `/account` shows the "add them to your account" banner → click → looks appear in the cloud grid and survive a reload; revisit → no banner.
  3. Visit `/login` → redirected to `/signin?intent=vendor`; visit `/account` while signed out → redirected to `/signin`.
  4. Sign in as an existing vendor while the intent toggle says "I'm shopping" → you still land `/dashboard` (role honoured, not downgraded).
- **Decide on Google sign-in**: it's currently deferred (email/password only). If you want it back, re-add a `signInWithGoogle` helper in `src/lib/account.ts` and a "Continue with Google" button on `/signin` — the `/auth/callback` role handling is already in place.
- **Optional**: if email confirmation is on in Supabase Auth, new email sign-ups must confirm before first sign-in. Turn it off for a frictionless flow, or leave it on.

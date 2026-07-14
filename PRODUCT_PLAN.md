# Pahiran — Product Plan: from kiosk MVP to a try-on shopping platform

**One-liner:** The online clothing shopping experience for Nepal where you see it on *you* before you buy — across shops, influencer stores, and in-store kiosks.

**Three sides of the marketplace:**
1. **Clothing outlets** — catalog management, in-store kiosk, and an online storefront with try-on.
2. **Influencer sellers** — curated storefronts with try-on links their followers can use, earning commission per sale.
3. **Shoppers** — one app to browse many shops, try anything on their own photo, and order.

---

## 1. Where we are today

The prototype (this repo) proves the core loop: vendor uploads garments → shopper takes a photo → FASHN (via fal.ai) renders them wearing it. What it is **not** yet: multi-user, online, persistent, or safe to ship (API key in client, localStorage-only, no accounts, no payments).

**Why this can win vs. Daraz/Instagram-DM shopping:**
- Try-on is the differentiator no local player has; it directly attacks the #1 reason people don't buy clothes online (fit/look uncertainty) and the #1 cause of returns.
- Nepali fashion commerce already lives on Instagram/TikTok with influencer sellers and DM checkout — chaotic, no catalog, no trust. Pahiran formalizes that exact behavior.
- The kiosk gives a physical wedge into shops that pure-online competitors don't have.

---

## 2. Product phases

### Phase 0 — Harden the prototype (Weeks 1–3)
Goal: something you can safely put in one real shop and demo to investors/vendors.

- [ ] **Rotate the fal key** (it has been exposed in chat and client code).
- [ ] Backend proxy for try-on: small API (Node/Hono or Next.js API routes) holding the fal key server-side; client sends person+garment images, gets result URL. Add per-session rate limiting from day one.
- [ ] Real persistence: Postgres (Supabase is the fastest path — auth, DB, storage, row-level security in one) replacing localStorage.
- [ ] Image storage: upload garments/results to object storage (Supabase Storage or Cloudflare R2), stop passing giant data URIs around.
- [ ] Vendor accounts: email/phone login, one shop per account.
- [ ] Deploy: Vercel (web) + Supabase. Custom domain.
- [ ] **Try-on result caching**: hash(person photo + garment + category) → cached result. Same shopper re-trying the same garment costs $0.
- [ ] Basic safety: consent checkbox before camera, auto-delete shopper photos after session, block non-person/inappropriate uploads (fal has moderation flags; add your own guard).

### Phase 1 — Vendor SaaS pilot (Weeks 3–10)
Goal: 5–10 paying Kathmandu outlets using the kiosk + dashboard daily. This funds and validates everything else.

- Kiosk as today, but multi-tenant: each shop's kiosk URL (`pahiran.app/k/juju-fashion`) locked to their catalog.
- Dashboard upgrades: sizes/variants, stock toggle, multiple photos per garment, basic analytics (try-ons per garment, most-tried items — *this data is gold for vendors and your sales pitch*).
- Tablet-friendly kiosk with an attract loop; optional shop-branded theme.
- QR code per garment on the physical rack → shopper scans → try-on on their own phone (no kiosk hardware needed — this is the cheapest deployment and the viral loop: result screen has "share to Instagram" with shop tag).
- **Unstitched / tailored garments (saris as fabric, lehengas, kurtha fabric):** try-on models transfer *look*, not fit — and a folded fabric bolt gives the model nothing to transfer. Rules:
  - Catalog photo for unstitched items must be a **draped display sample on a mannequin** (part of the photograph-their-rack onboarding service). Fabric-only listings don't get a try-on button.
  - These items are labeled **"Stitched to order"**: try-on is presented as a look preview, and the order flow captures measurements (in-shop or guided self-measure form). Positioning: "see the look now, tailored to your exact fit" — made-to-measure is an *advantage* over ready-made, not a caveat.
  - **Fabric → styled render pipeline (Phase 2):** vendor uploads the fabric photo + picks a target style from a **template gallery** (drape styles, blouse cuts, lehenga silhouettes — each a reference image; custom reference upload allowed). A multi-image editing model (Gemini image editing / FLUX Kontext, both on fal.ai — same infra as FASHN) combines fabric + style template → catalog-quality render of the garment as it will be stitched. Generated **once per listing** (cost per listing, not per shopper), then feeds the normal try-on pipeline. Caveat: pattern/border placement is plausible, not exact — UI labels it "style preview · stitched from this exact fabric." Add a 20-fabric fidelity test to the Phase 0 benchmark.

### Phase 2 — Online storefronts + influencers (Weeks 8–18)
Goal: every vendor and influencer gets a shareable try-on shop; shoppers get accounts.

- **Public storefronts**: `pahiran.app/s/{shop}` — browsable catalog, try-on with your own photo, "Reserve / Message shop" (WhatsApp/Instagram deep link before full checkout exists).
- **Shopper accounts**: save your photo once (encrypted, private, deletable), then one-tap try-on anywhere on the platform. This is the retention hook.
- **Influencer storefronts**: an influencer signs up, curates garments from partner vendors (or lists their own), gets `pahiran.app/i/{name}`. Followers try items on themselves via the influencer's link. Attribution tracked per link.
  - Commission ledger: X% of attributed sales (start manual/monthly payout via eSewa, automate later).
  - Creator tools: "try-on collage" content generator — influencer's own try-on results formatted for Reels/TikTok, watermarked with their link. Their content becomes your marketing.
- Wishlist, follow shops/influencers, share try-on results.

### Phase 3 — Full marketplace (Months 4–8)
Goal: shoppers browse and buy across all shops in one place.

- Cross-shop discovery: search, categories (Sari → Daura Suruwal → streetwear), "trending try-ons", personalized feed.
- **Checkout**: eSewa + Khalti + cash-on-delivery (COD is still king in Nepal — support it or lose most orders).
- **Delivery**: integrate local logistics (Pathao Parcel, Aramex/local couriers) for Kathmandu valley first; vendor self-fulfillment elsewhere.
- Orders, returns flow, ratings/reviews (with optional try-on-photo reviews — high trust signal).
- Mobile app (React Native/Expo, reusing the web API) once web PWA traction justifies it.

---

## 3. Architecture target

```
apps/
  web         Next.js — marketplace, storefronts, dashboard, kiosk (all one app, route-scoped)
  api         (inside Next.js API routes initially; split out only when needed)
services/
  tryon       queue + worker: receives job → calls fal/FASHN → caches → moderates → returns URL
infra:
  Supabase    Postgres + Auth + Storage + RLS
  Cloudflare  R2 for images/results, CDN
  fal.ai      FASHN v1.6 (abstract behind an interface — keep Kling/IDM-VTON swappable)
```

Key decisions:
- **One Next.js app, not microservices.** Kiosk, storefront, marketplace, and dashboard are routes with different layouts. Split later if ever needed.
- **Try-on behind a queue** (even a simple DB-backed one): generations take 15–30s; a queue gives you retries, rate limiting, cost caps per shop/user, and burst absorption during campaigns.
- **Provider abstraction for try-on**: FASHN today; test alternates on saris/lehengas specifically — draped garments are the hardest case and your core category. Quality on saris is an existential product risk: benchmark early (Phase 0) with 30–50 real garment photos.

## 4. Unit economics (sanity check)

- FASHN via fal ≈ **$0.04–0.08 per generation**. A shopper session averaging 6 try-ons ≈ $0.25–0.50.
- Caching + "one saved photo" reduces repeat cost; rate limits prevent abuse.
- **Vendor pricing (pilot):** NPR 3,000–5,000/month per shop including N try-ons, then per-generation top-ups. Frame it against one day of a shop assistant's wage.
- **Influencers:** free to join; Pahiran takes a platform fee on sales (e.g., 8–12%), influencer gets their commission from the vendor's side of the split.
- **Shoppers:** free with a daily try-on cap; unlimited via a small subscription later if the data supports it.

## 5. Go-to-market

### Outlets (direct sales, founder-led)
1. Pick one corridor: New Road / Durbarmarg / Jawalakhel. 20 shop visits with a tablet running the live kiosk — the demo *is* the pitch (try-on the shop's own sari in 60 seconds).
2. Free 2-week pilot → convert to paid with the analytics report ("saris were tried 214 times; these 3 items drove footfall").
3. Case study one flagship shop hard: video testimonial, before/after numbers. Nepali retail is word-of-mouth dense — one respected New Road shop converts ten.
4. Wedding season (Mangsir, and Baishakh–Jestha) is the demand spike — time the vendor push 6–8 weeks before.

### Influencers (the growth engine)
1. Hand-recruit 10–20 mid-tier fashion sellers on Instagram/TikTok (10k–100k followers) who *already sell via DM*. Pitch: "your followers try it on themselves from your link — you sell more, and stop answering 'will this suit me?' DMs."
2. Give them the try-on collage tool + a launch commission boost. Their Reels of followers' try-on results are your ad campaign, at zero CAC.
3. Leaderboard/featured-creator slots to keep them posting.

### Shoppers
1. Every kiosk result and QR try-on ends with "Save this look — try the whole shop from home" → account creation.
2. Instagram-native launch: try-on challenge campaign with the recruited influencers.
3. Referral: invite a friend → both get extra try-ons.

## 6. Metrics that matter

| Phase | North star | Guardrails |
|---|---|---|
| 1 (kiosk) | Weekly try-ons per shop | Vendor churn, try-on failure rate, cost/session |
| 2 (storefronts) | Shopper accounts with saved photo | Try-on → "message shop" conversion, influencer link CTR |
| 3 (marketplace) | Weekly orders | Return rate vs. Daraz baseline (your headline claim), GMV, take rate |

## 7. Risks & mitigations

- **Try-on quality on draped garments (saris/lehengas)** — benchmark in Phase 0; if FASHN underperforms, test Kling/Google VTO; worst case, lead with kurtha/streetwear/western wear where quality is proven and add drapes later.
- **"Exact fit" expectations** — no try-on model renders true fit; it renders look. Never market "see exactly how it fits"; market "see it on you". For stitched-to-order garments, exact fit comes from the measurement + tailoring flow, and the UI must say so, or returns/disputes will follow.
- **Photo privacy & consent** — non-negotiable: explicit consent, private-by-default photos, one-tap delete, no training on user photos, clear Nepali-language policy. A single privacy scandal kills a face+body product.
- **Generation cost blowout** — hard caps per user/shop/day, caching, queue-level budget alarms.
- **Vendor digital literacy** — onboarding must be "we photograph your rack for you" as a service in the pilot; don't assume shops will self-serve on day one.
- **Payments/logistics friction** — stay in "reserve + DM/COD" mode until order volume justifies real checkout; don't build payments before Phase 3.
- **Exposed fal key (today)** — rotate immediately; never ship a client-side key again.

## 8. Build approach: new project, port the good parts

**Decision:** the product is built as a fresh Next.js (App Router) + Supabase project (`~/Personal/pahiran`), not by evolving this Vite SPA. The prototype's plumbing (localStorage, client-side fal key, single-page routing) is the opposite of what the product needs (server API routes, multi-tenant DB, public per-shop URLs); its **UI is what survives** — kiosk flow, camera capture, generating overlay, try-on screen, image compression, and styling all port nearly unchanged.

- This repo (`pahiranmvp`) stays untouched as the working **sales demo** for shop visits.
- Target structure in the new repo:
  - `/dashboard` — vendor side · `/kiosk` (→ `/k/[shop]` once multi-tenant) · `/s/[shop]` storefronts (Phase 2) · `/i/[name]` influencer stores (Phase 2)
  - `/api/tryon` — server-side proxy holding the fal key, with result caching and rate limiting
  - `src/lib/storage.js` — storage adapter: localStorage on day one, swapped for Supabase in Phase 1 without touching UI code
  - `supabase/schema.sql` — `shops`, `garments`, `tryon_results` (try-on cache) with row-level security
- **Key hygiene:** rotate the fal key; the new key lives only in server-side env (`FAL_KEY`, never `VITE_`/`NEXT_PUBLIC_`-prefixed).

## 9. Next 30 days (concrete)

1. Rotate fal key; stand up Supabase + Vercel; move try-on behind an API route with caching and rate limits.
2. Multi-tenant vendor auth + hosted kiosk URLs; migrate catalog from localStorage to Postgres.
3. Sari/lehenga quality benchmark (50 garments, 5 body types) → go/no-go on drape categories. Include a 20-fabric test of the fabric + style-template → styled-render pipeline (Gemini image editing / FLUX Kontext on fal) to judge pattern fidelity.
4. Photograph-and-onboard 3 friendly shops; run kiosks in-store for 2 weeks; instrument everything.
5. Recruit the first 5 influencer sellers as design partners (their storefront needs shape Phase 2).

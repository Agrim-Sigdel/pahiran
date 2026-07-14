# Pahiran — Project Status

_Last updated: 2026-07-14 · Companion to [PRODUCT_PLAN.md](./PRODUCT_PLAN.md)_

## ✅ What we have (working today)

### Product surface
- Landing page (`/`), vendor dashboard (`/dashboard`), full kiosk flow (`/kiosk`)
- Kiosk: attract screen → **consent screen** (photo policy, must agree) → camera capture
  (upload fallback) → garment rail → AI try-on, with drag-to-position manual preview
  if the AI call fails
- Catalog management: add/remove garments, photo compression, categories, NPR pricing,
  filters, shop name/area, **sizes per garment, in-stock/out-of-stock toggle**
- **Full TypeScript codebase** (strict mode, typed domain models in `src/lib/types.ts`)

### Phase 0 infrastructure
- Server-side try-on proxy (`/api/tryon`) — fal key stays on the server, never in the browser
- Try-on result caching (same person + garment = free repeat)
- Per-IP rate limiting (30 generations / 10 min)
- Storage adapter (`src/lib/storage.ts`) isolating all persistence — **dual-mode**:
  localStorage with zero setup, or Supabase when env vars are set
- Git repo, verified build, all routes serving

### Phase 1 — code complete, needs a Supabase project to activate
- **Supabase wiring done** (`src/lib/supabase.ts`): auth, Postgres catalog, Storage bucket
  for garment photos (no more data-URL 5MB cap) — activates when
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
  are set and `supabase/schema.sql` has been run
- **Auth**: `/login` (email + password sign in/up), dashboard + own-kiosk gated behind a
  session in Supabase mode; shop row auto-provisioned with a slug on first login
- **Multi-tenancy**: public per-shop kiosk at `/k/[slug]`, no auth needed
- **Per-garment QR codes**: dashboard generates + downloads hanger-tag QR PNGs linking to
  `/k/[slug]?g=<garmentId>` — shopper scans, consents, snaps a photo, and that garment
  auto-tries-on on their own phone
- **Try-on analytics**: every try-on logged (server-side in Supabase mode via
  `tryon_events`, localStorage counts otherwise); dashboard shows "Most-tried items"
- **Persistent cache + rate limits**: `/api/tryon` uses `tryon_results` / `rate_limits`
  tables when the service role key is set — survives restarts, works across serverless
  instances (in-memory fallback otherwise)
- Consent screen + "photo never saved" policy in the kiosk UI
- Garment editing (name/category/price/sizes/photo), custom kiosk slug, error
  monitoring (`error_logs` + `/api/log`, failures logged with context)
- **Phase B vendor analytics**: activity dashboard (stat tiles, 30-day daily
  chart, per-garment history table, CSV export), anonymous per-session ids on
  try-on events, **leads inbox** ("I want this" button on the kiosk result →
  name/phone/size land in the vendor dashboard), error-log viewer

## ❌ What we don't have

### Blocking — needs your accounts, not code
- [ ] **fal key**: rotate the burned MVP key at https://fal.ai/dashboard/keys, put the new
      one in `.env.local` as `FAL_KEY`
- [ ] **Supabase project**: create one, run `supabase/schema.sql` in the SQL editor,
      paste the three keys into `.env.local` (see `.env.example`) — flips the app from
      local mode to multi-tenant cloud mode
- [ ] **Deploy**: localhost only — no Vercel, no domain (QR codes only work cross-device
      once deployed)

### Phase 2+ — three-sided platform (plan only, no code)
- [ ] Public storefronts (`/s/[shop]`), shopper accounts with saved photo
- [ ] Influencer stores (`/i/[name]`), attribution, commissions
- [ ] Fabric → styled-render pipeline (style template gallery)
- [ ] Search, checkout (eSewa/Khalti/COD), delivery, reviews

### Quality gaps
- [ ] Zero tests, no error monitoring
- [ ] FASHN quality benchmark on saris/lehengas not run — this is the go/no-go item
      (50 garments, 5 body types + 20-fabric styled-render fidelity test)
- [ ] No garment editing (only add / remove / stock toggle); no slug customization

## Next work block (→ "I can put this in one shop")
1. Rotate fal key → `.env.local`
2. Create Supabase project → run `supabase/schema.sql` → paste keys into `.env.local`
3. Deploy to Vercel with a domain (set the same env vars there)
4. Run the sari/lehenga benchmark

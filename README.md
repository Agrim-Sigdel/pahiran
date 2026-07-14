# Pahiran

Virtual try-on shopping platform for Nepal — clothing shops, influencer stores, and shoppers.
This is the product repo; the original prototype lives in `../pahiranmvp` (kept as the sales demo).
Roadmap: see [PRODUCT_PLAN.md](./PRODUCT_PLAN.md).

## Run it

```bash
npm install
cp .env.example .env.local   # then put your fal.ai key in FAL_KEY
npm run dev                  # http://localhost:3000
```

Without `FAL_KEY`, everything works except AI generation — the kiosk falls back to the manual
positioning preview.

## What's here (Phase 0)

- `/` — landing
- `/dashboard` — vendor catalog management (localStorage for now; Supabase in Phase 1)
- `/kiosk` — full-screen shopper flow: photo → pick from the rack → AI try-on
- `/api/tryon` — server-side proxy to fal.ai FASHN v1.6. The key never reaches the browser.
  In-memory result cache (same person + garment = free) and per-IP rate limiting.

## Phase 1 wiring (when ready)

1. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
2. Fill the Supabase vars in `.env.local`.
3. Swap the five functions in `src/lib/storage.js` for Supabase queries; move the try-on
   cache from memory into the `tryon_results` table.
4. Add vendor auth and per-shop routes: `/k/[slug]`, `/s/[slug]`.

## Security notes

- `FAL_KEY` is server-side only. Never expose it with a `NEXT_PUBLIC_` prefix.
- If a key was ever shipped in client code (the old prototype did), rotate it at
  https://fal.ai/dashboard/keys.

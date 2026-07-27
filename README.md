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
positioning preview. `OPENAI_API_KEY` powers the "studio" try-on finish and the made-to-order
render pipeline; without it try-on drops to the quick finish and `/api/compose` returns a clear
error.

## Two modes

The app runs with **no backend at all** — `src/lib/storage.ts` falls back to localStorage when
the Supabase env vars are absent, which is the zero-setup demo path. Set
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` and the
same UI runs multi-tenant against Postgres, Storage and RLS. No code branches on environment —
see [docs/environments.md](./docs/environments.md) for bootstrapping a project.

## What's here

**Shopper**
- `/` — landing · `/signin` — shopper + vendor sign-in · `/account` — saved looks, details
- `/kiosk`, `/k/[slug]` — full-screen try-on: photo → pick a piece → AI try-on
- `/s/[slug]`, `/s/[slug]/[garment]` — storefront and product pages (server-rendered share cards)

**Vendor**
- `/dashboard` — catalog, fabrics + the fabric studio, analytics, leads inbox, plan
- `/admin` — approval queue, billing inbox, ops

**API** (keys stay server-side)
- `/api/tryon` — fal.ai FASHN v1.6 (quick) or gpt-image-2 (studio). Result cache keyed on
  person + garment, per-IP rate limits, daily spend cap.
- `/api/compose` — renders a fabric in a cut. Vendor-only and metered.
- `/api/lead`, `/api/log`, `/api/billing/*`

## Made to order

Beyond photographed stock, a shop can sell **cloth plus a promise**: a fabric rendered into a
cut nobody has photographed, which shoppers can still try on. That has its own design notes —
coverage, staleness, metering, migration order — in
[docs/made-to-order.md](./docs/made-to-order.md).

## Security notes

- `FAL_KEY` is server-side only. Never expose it with a `NEXT_PUBLIC_` prefix.
- If a key was ever shipped in client code (the old prototype did), rotate it at
  https://fal.ai/dashboard/keys.

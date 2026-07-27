# Custom Suit Builder — spec vs. what was built

_Review of the client spec "Custom Suit Builder v1.0 (26 July 2026)" against the
made-to-order feature in this repo (commits `9e42e1a` → `c2b58f2`). Companion to
[made-to-order.md](./made-to-order.md)._

The spec and the implementation solve the same shop problem with two different
machines. The spec's central bet — a deterministic PNG overlay + mask composite —
is **not in this codebase**. Nothing tiles a fabric. There is no `overlay.png`, no
`mask.png`, no tile-scale slider, no canvas compositing.

Everything below follows from that one substitution.

---

## 1. The core divergence

| | Spec §4 / §6 | Built ([`src/lib/compose.ts`](../src/lib/compose.ts)) |
|---|---|---|
| How the garment image is made | Two layers: fabric tiled, clipped by a mask, ink composited on top | One GPT Image 2 edit — a ghost-mannequin render of cloth + cut |
| A "design" is | A pair of PNGs on a 1536×2048 canvas — the digital twin of one acrylic sheet | A `styles` row: a text `prompt_hint` plus an optional reference photo. **No image assets ship at all** |
| Output size | 1536×2048 | 1024×1536, `quality: medium` |
| Cost per combination | Zero | One compose credit (`plans.compose_limit`: free 15 → pro 2000) |
| Latency | ~40 ms; the spec calls anything slower a bug | ~30–45 s per cut ([`FabricStudio.tsx:34`](../src/components/FabricStudio.tsx#L34)), `maxDuration = 300` |
| Offline | Yes, by design (SC-6) | No — needs network and `OPENAI_API_KEY` |
| Fabric fidelity | Guaranteed by construction: it *is* the customer's cloth | Prompted, never verified — "Reproduce its exact colour, weave… do not recolour it" |
| Determinism | Byte-identical across runs; golden-image CI possible | None possible |
| When it runs | At the counter, per customer | Vendor authors once, ahead of time; shoppers see a cached render |

That last row is the real re-architecture and it is deliberate — see
[made-to-order.md § Why it is authored, not generated on demand](./made-to-order.md).
A render with nobody in it caches forever, so cost scales with combinations
authored rather than with traffic.

---

## 2. Spec items that exist, sometimes under another name

- **Try-on prompt override (§7.2, P0)** — built, and further than asked.
  [`api/tryon/route.ts`](../src/app/api/tryon/route.ts) derives placement from
  `styles.coverage` rather than a category label, forces multi-piece sets onto the
  studio path (FASHN warps one garment and silently drops the rest), and folds
  `STUDIO_PROMPT_VERSION = 2` into the studio cache key.
- **Manual placement fallback (§5.5)** — exists, and pre-dates this feature:
  [`Kiosk.tsx:989`](../src/components/Kiosk.tsx#L989).
- **"Style preview, not fit preview" (§2.3)** — a literal `STYLE PREVIEW` badge on
  every render, [`FabricStudio.tsx:409`](../src/components/FabricStudio.tsx#L409).
- **Vendor self-serve designs (§7.1 / M5)** — `CutModal` takes a photo, words, or
  both. It does **not** implement Call A: no photo→template conversion, no
  threshold, no flood-fill, no approval queue. The photo is passed through as a
  style reference image. Approval is moot — the vendor authors their own cuts.
- **Save the combination, not the flat image (§5.6)** — `compositions` keyed
  uniquely on `(shop_id, fabric_id, style_id)`. No tile params, because there are
  none.
- **Non-goals (§2.3)** — honoured. No measurements, pose detection, 3D or fabric
  analysis anywhere in the new code. (`src/lib/sizing.ts` is a pre-existing
  height/weight size hint for the lead form, unrelated to the render.)

---

## 3. Spec items with no implementation

| Spec | Status |
|---|---|
| §5.1 entry inside **Upload Garment**, behind a **per-vendor feature flag** | Separate **Fabrics** tab gated on `shop.type === 'apparel'` ([`Dashboard.tsx:108`](../src/components/Dashboard.tsx#L108)) — every apparel vendor sees it. Answers **Q6: no flag infrastructure exists** |
| §5.3 square crop tool | Not built |
| §5.3 reject below 800×800 with a retake prompt | Not built |
| §5.3 HEIC/HEIF handling (P0) | Not built — no `heic`/`heif` handling anywhere in `src/` |
| §5.4 tile scale / rotation / offset, design-switcher strip | N/A by architecture |
| §8.1 dark-ink / light-ink overlay variants | N/A — there is no ink. A whole class of edge cases deleted rather than solved |
| §9 `seed/dev-assets/` + `LICENCES.md`, `source = 'seed'` | Not present. `scripts/seed.mjs` seeds garments only — no fabrics, no styles |
| §11.1 72-cell contact sheet + golden-image CI | Not present; the repo has zero tests |
| §11.2 automated checks (determinism, client/server parity, tile bounds, format handling) | Absent or N/A — determinism is unachievable by construction |
| §6.1 `custom_garment.expires_at`, customer-photo cleanup | No `expires_at`, no retention job. **Q5 remains open** |

### Verified defect

`FabricModal` ([`Dashboard.tsx:728`](../src/components/Dashboard.tsx#L728)) calls
`fileToCompressedDataURL(file)` with no arguments, so the bolt photo is stored at
**720px / JPEG q0.75**. The kiosk compresses a shopper's photo at 1000/0.85; the
compare page uses 1024/0.85. The one image the entire fidelity claim rests on gets
the worst treatment in the app.

---

## 4. Present but never specced

Scope went well past one shop's suits.

- **6 style families** (suit, lehenga, kurtha, daura-suruwal, sari-blouse,
  sherwani) with **25 seeded cuts** ([`style-library.ts`](../src/lib/style-library.ts)),
  against the spec's 6 suit designs.
- Fabrics are priced catalog listings — `unit`, `composition`, `color`,
  `in_stock`, vendor item codes — not per-session captures.
- A vendor review gate: renders carry a price and a `published` flag; shoppers
  only ever see published, `ready`, approved-shop combinations, re-checked
  server-side.
- **Staleness**: `NOTE CHANGED` / `CUT CHANGED`, driven by `rendered_note` and a
  trigger-bumped `styles.revision`.
- Library cuts are copy-on-edit, so a shop's version is its own.
- `composition_parts` for future multi-fabric outfits.
- `composition_id` beside `garment_id` on events, leads, looks and results.
- Published compositions flow into the kiosk rail, storefront and cart as
  `Wearable`, which the rest of the app cannot distinguish from a photographed
  garment.

---

## 5. Success criteria

| | Criterion | Verdict |
|---|---|---|
| SC-1 | Composite preview < 30 s | **Not met** at authoring time (~30–45 s per cut). Effectively met at the counter, where the render is already cached |
| SC-2 | Composite → try-on < 45 s | Unverified |
| SC-3 | Fabric recognisably matches the bolt | **The open bet.** Guaranteed by the spec's design; prompted and unchecked here |
| SC-4 | Cut matches the selected design | Unverified; rests on `prompt_hint` and the optional reference photo |
| SC-5 | Unlimited self-serve designs | **Met** |
| SC-6 | Composite works offline | **Not met, and cannot be** in this design |

---

## 6. Assessment

**The implementation is the better product. The spec is right about the one thing
that can kill it, and there is currently no defence against it.**

### Where the spec is genuinely better

- **Fabric fidelity is structural, not hoped for.** The composite *is* the
  customer's cloth. SC-3 is the criterion the shop actually cares about — the
  customer is holding the bolt — and the spec gets it for free.
- **Free, instant, offline, deterministic.** Each is worth something on shop wifi.
  Determinism is why the spec can have a golden-image regression test and this
  architecture can have none.
- **The design-switcher strip.** Six cuts on one cloth, instantly, is what beats
  the acrylic sheet. This build does it too — but only for combinations someone
  already paid ~40 seconds and a credit to author.

### Where the spec is wrong

- **Its core is blocked on assets it does not have.** §10 calls the printer's
  source files "the largest open risk in the project"; §4 calls the feature
  "roughly thirty lines of code." Both cannot be true. Making a cut a *sentence*
  instead of a pair of registered PNGs is the single best decision in this
  implementation, and the spec has no answer to it.
- **§7.1 Call A is hand-waved.** Flood-filling inward from the corners to derive a
  mask from *generated* line art leaks through every gap in the strokes. The spec
  notes this as something you will "surface" and moves on. It is their entire
  asset pipeline.
- **§8.1 is an admitted, unfixed flaw** that doubles the asset burden and still
  loses on mid-tones. This build does not have the problem.
- **It generalises to exactly one garment.** Flat tiled fabric inside an outline
  is convincing for a two-piece suit and is a sticker for an anarkali, a lehenga
  ghera or a draped dupatta. The spec is honest that it is scoped to Kaaji Sab's
  suits — but peeq is not.
- **Its output is a poor try-on input.** A headless flat outline is out of
  distribution for a model trained on garment photographs. The ghost-mannequin
  reasoning in [`compose.ts:63`](../src/lib/compose.ts#L63) — that the constraint
  protecting body fidelity also happens to match what try-on models expect — is
  the sharpest observation in either document.

### The difference neither document names

The spec describes a **counter tool**: staff photograph a bolt off the shelf with
the customer standing there. This is a **catalog authoring tool**: the vendor
pre-authors, prices and publishes; shoppers browse.

That is why the offline and cost criteria feel damning and mostly are not — the
work moved off the critical path. But it also means the spec's stated primary
goal, *"including a fabric photographed on the spot,"* is something this build
genuinely cannot do at counter speed. If Kaaji Sab's real behaviour is "customer
points at an unrendered bolt," that is a gap, not a criterion that was cleverly
dissolved.

---

## 7. Recommended next steps

1. **Stop compressing the bolt photo to 720px.** One line in `FabricModal`, and it
   sits upstream of every fidelity complaint this feature will ever receive.
2. **Verify the render against the cloth instead of trusting the prompt.** Compare
   dominant colour and a coarse histogram of the render's garment region against
   the fabric photo, and flag drift in the studio before the vendor can publish.
   Deterministic, cheap, testable — it buys back most of what the composite gave
   structurally, and it is the closest thing to §11's regression harness this
   architecture can support.
3. **Run the fidelity benchmark** STATUS.md has been calling go/no-go. The
   pipeline exists; 20 fabrics is an afternoon. Today the strongest claim anyone
   can make about SC-3 is a prompt that says "do not recolour it."
4. **Decide whether the counter case is in scope.** If it is, it needs an answer
   that is not "author it first" — that is a product decision, not an
   implementation detail.

---

## 8. Open questions the code has already answered

| # | Spec question | Answer from the codebase |
|---|---|---|
| Q4 | Does try-on allow a per-garment-type prompt override? | Yes — implemented, coverage-driven, and versioned into the cache key |
| Q5 | Composite storage and customer-photo retention? | Renders go to the public `renders` bucket, a fresh path per render. **No retention policy exists** |
| Q6 | Is vendor feature-flag infrastructure in place? | No. Gating is by `shop.type === 'apparel'` |

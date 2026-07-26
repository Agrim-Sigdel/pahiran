# Made to order — fabrics, cuts and renders

Most of the catalog is a photograph of something hanging in the back. This part
isn't. A tailoring shop sells **cloth plus a promise**: pick this fabric, have it
stitched into that cut. Nobody has photographed the result, because it does not
exist until someone orders it.

That is the whole problem this solves — and the reason it is not simply "more
garments".

## The model

```
fabric   × style          →  composition
(a cloth)  (a cut it can    (the render of the two together:
            be stitched      a product nobody photographed)
            into)
```

- **`fabrics`** — a bolt of cloth. Priced per meter / piece / set, with a
  vendor's `note` about what a photo can't show (where a border falls, how
  heavily it drapes).
- **`styles`** — the cuts. Platform-global ones (`shop_id is null`) ship as a
  seeded library keyed by `slug`; a shop can also add its own.
- **`compositions`** — one row per (fabric, cut) the vendor deliberately
  authored, priced and published.

`composition_parts` exists for outfits assembled from *several* fabrics (a
contrast suruwal in a second cloth). Unused by the fabric × cut path; there so
that case never needs a schema change.

### Why it is authored, not generated on demand

A composition is **not a cache**. Every row is a product a human chose and a
tailor agreed to make. Generating on demand would fill the catalog with
combinations the shop cannot actually stitch, and a shopper would be looking at
a promise nobody made.

It is also what makes the economics work: a render has **nobody in it**, so it
caches forever and is shared by every shopper. Cost scales with the combinations
a vendor authored, not with traffic.

## The ghost-mannequin lock

The single most important constraint in `src/lib/compose.ts`.

A render becomes the *garment input* to try-on. If it comes back on a model — or
on a mannequin with a shaped bust and hips — that body silhouette is baked into
the garment image, and try-on drags it onto the shopper. They then see a body
that isn't theirs and order a garment cut for it.

So: no person, no face, no shaped torso, ever. It happens to also be the format
try-on models are trained on, so the constraint that protects body fidelity
improves fit quality at the same time.

## Coverage — which pieces a cut makes

`styles.coverage` is `'top' | 'bottom' | 'set'`.

This is an enum rather than prose because it is **read twice**:

| reader | uses it for |
|---|---|
| compose prompt | what to draw, and what must be absent |
| try-on placement | `tops` / `bottoms` / `one-pieces` for the model |

A note could only ever do the first job. Try-on cannot read a sentence, and a
suruwal sent up as `auto` gets hung on the torso.

It lives on the **cut**, not the pairing, for two reasons. The unique index is
`(shop_id, fabric_id, style_id)`, so per-composition coverage would let one
fabric-and-cut mean two different renders and collide. And it matches the trade:
"kurtha" and "kurtha with churidar" are two things a tailor offers, at two
prices, published separately.

The prompt states coverage as **absence**, not just instruction — "render the
top" leaves the model free to add trousers for a tidier picture; *"below the hem
there is nothing but empty background"* does not.

### Multi-piece sets and try-on

A `set` is several garments in one image. FASHN warps exactly one garment onto a
body, so a set sent down the **quick** path returns the kurtha and silently drops
the churidar and the dupatta. That is a limit of the model, not the wording, so
`/api/tryon` forces such pieces onto the **studio** path, where the prompt can
enumerate every piece.

## The three layers of notes

Each answers a question the others can't:

| field | describes | example |
|---|---|---|
| `fabrics.note` | this cloth, in any cut | "heavy border along one selvedge" |
| `styles.prompt_hint` | this cut, in any cloth | "single-breasted, peak lapel" |
| `compositions.note` | **this cloth in this cut** | "deeper hem so the border sits right" |

They are injected in that order, most specific last.

A note **refines** a cut; it cannot redefine which pieces exist. "Also make the
churidar" on a `top` cut may sway the prompt, but try-on still places it as a
top — wrong. The fix is a different cut, and the UI says so.

## Staleness — when a render stops being true

Two things can change after a render exists, and both make the picture a lie.
Neither uses a trigger-maintained flag; each compares a value against what was
recorded at render time.

| changed | detected by | badge |
|---|---|---|
| the pairing's note | `note <> rendered_note` | `NOTE CHANGED` |
| the cut itself | `styles.revision <> rendered_style_revision` | `CUT CHANGED` |

`styles.revision` is bumped by a **trigger**, and only when `prompt_hint`,
`coverage` or `ref_image_url` change. Renaming or reordering a cut does not bump
it — warning someone to pay for a re-render because they fixed a typo is the
fastest way to teach them to ignore the warning.

A stale render makes its cut selectable again, so re-stitching uses the same
button as the first time. It costs one credit, because it is a real generation.

`rendered_style_revision` is null on renders made before the column existed.
Null reads as **not known to be stale**, not stale — marking a shop's whole back
catalogue as needing paid re-renders on a guess is noise, not a warning.

## Editing cuts

A shop's own cuts are editable in place. Library cuts are **not**: the `own
styles` policy makes `shop_id in (… where owner = auth.uid())` false for a null
`shop_id`, so an update would silently affect zero rows.

So the studio offers a **copy** instead — the form opens prefilled from the
library cut and saves a new shop-owned one. That is also the honest outcome:
your version of the A-line kurtha is your cut, not an edit to every shop's.

## Metering

A third meter beside `tryon_limit` / `studio_limit`:

- `plans.compose_limit` — free 15, starter 120, growth 400, pro 2000
- `shop_subscriptions.compose_used`
- `consume_compose(shop_id)` / `refund_compose(shop_id)`

Composes are spent by the **vendor at authoring time**, so this bounds a cost the
vendor controls — unlike try-ons, where the crowd decides. A credit is reserved
before the provider call and refunded if it fails. Already-rendered, non-stale
combinations are returned free, which makes the batch button safe to press twice.

`consume_compose` mirrors `consume_tryon`: approval outermost, then the period
roll, then the allowance. It fails **closed** — any error blocks the spend,
because the caller is about to pay an image model.

## Reaching the shopper

A published composition is a `Wearable` — the shape the kiosk rail, the stage and
the cart all take. To try-on, a photographed garment and a rendered fabric × cut
are the same thing: an image of a piece of clothing.

Only the **writes** care which it is. `garment_id` is a foreign key to
`garments`, and a composition is not a row there, so `tryon_events`, `leads`,
`saved_looks` and `tryon_results` each carry a separate `composition_id`.
Exactly one of the pair is set.

That matters most for **leads**: a lead that cannot say *which fabric and cut* is
useless to a made-to-order shop.

Shoppers only ever see compositions that are `published`, `status = 'ready'`, and
belong to an approved shop. `/api/tryon` re-checks all three server-side rather
than trusting the client, because it runs under the service role and bypasses
RLS.

## Two operational details worth knowing

**Render paths are unique per render.** `renders` is a public, CDN-cached
bucket, and the try-on cache is keyed on the garment URL. Overwriting in place
would leave a re-stitch serving the picture it just replaced — to shoppers and
to the vendor. The old object is deleted only after the row points at the new
one.

**`STUDIO_PROMPT_VERSION` is in the studio cache key.** A studio result is a
product of its prompt, so a cached result made under an older one is a different
answer to the same question. Bump it whenever the prompt changes in a way that
alters output, or a fixed bug will look unfixed. Quick-path keys are unaffected —
FASHN takes no prompt.

## Migrations

Apply in order; each depends on the last.

| file | adds |
|---|---|
| `20260726000100_fabrics_styles.sql` | `fabrics`, `styles`, seeded cut library, buckets, RLS |
| `20260726000200_compositions.sql` | `compositions`, `composition_parts`, compose meter, `renders` bucket |
| `20260726000300_fabric_note_and_style_check.sql` | repairs `fabrics.note` + `styles_describable` |
| `20260726000400_wearable_compositions.sql` | `composition_id` on events, leads, looks, results |
| `20260726000500_style_coverage_and_notes.sql` | `styles.coverage`, `compositions.note` / `rendered_note` |
| `20260726000600_editable_cuts.sql` | `styles.revision` + trigger, `rendered_style_revision` |

`000300` exists because `000100` was edited *after* it had already been applied.
Editing an applied migration is a no-op against the database that ran it, so the
two columns had to be added again idempotently. Both paths converge on the same
schema — but the file on disk no longer matches what an
already-migrated project actually ran.

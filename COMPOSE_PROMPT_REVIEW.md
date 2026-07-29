# The compose prompt: gaps found, gaps closed

A read of `buildPrompt` in [src/lib/compose.ts](src/lib/compose.ts) against everything the
app already knows about a cloth and a cut, asking one question throughout: what does
the shop tell us that the render never hears?

Ten gaps. Eight are closed here — all of them prompt-side, no schema change, no cost to
any render already in the catalog. Two are left open at the bottom, because both need a
migration and one of them spends the vendor's money.

---

## Closed

### 1. The family arrived as a slug

`family` went into the prompt as its database id, so a Nepali suit was described to the
model as `daura-suruwal` and a blouse as `sari-blouse`. `familyLabel()` has existed the
whole time — [src/app/api/counter/route.ts](src/app/api/counter/route.ts) already passes
the label to the try-on side and the raw id to this one, in the same function.

Now `Daura Suruwal`, `Sari blouse`.

### 2. The cloth's composition never reached the render

`fabrics.composition` — "banarasi silk", "wool 120s" — is typed on the fabric form,
saved, and printed on the storefront card. It was never sent to the thing that draws the
cloth.

It is the one fact a photograph of a flat sample physically cannot carry. Raw silk holds
a sharp break where georgette pours, and pinned flat under a light the two photograph
identically. Drape is most of what separates a render that reads as a stitched garment
from a shape with a picture of fabric on it.

Added as a paragraph of its own, and wired through
[src/app/api/compose/route.ts](src/app/api/compose/route.ts) — which was not even
selecting the column. See the open item on mirroring below.

### 3. The shop's own words could quietly overrule the structure

`fabricNote`, `note`, `clothFix` and `fix` were pasted in raw, and all four land *after*
the coverage rule they can contradict — later in a prompt is nearer the top of the
model's mind. The comment on `coverage` names the exact case: a note reading "worn over
matching churidar" is a description of how the piece is worn, and read as an instruction
it draws the churidar.

The vendor is not being adversarial. They are describing a garment to someone they assume
already knows what is being made. So their words are now introduced by a fence: they
govern cloth and cut, and they do not change which pieces are made, the ghost-mannequin
presentation, or the framing.

### 4. Coverage was stated once, at the top, and never again

Everything between the coverage rule and the end of the prompt is a sentence about a
garment — any of which can read as licence to add a second one. The ghost-mannequin lock
gets a restatement for free from the forbidden list near the close; the piece count had
nothing holding it there.

The closing line now carries it: *"…one finished upper garment …with no lower garment
anywhere in the frame."*

### 5. Nothing said which description of the cut wins

A cut can arrive twice — as the shop's words (`prompt_hint`) and as a reference
photograph (`ref_image_url`) — and nothing forces them to agree. The colour paragraph is
meticulous about precedence; the cut had none.

Stated now, in the direction [src/lib/types.ts](src/lib/types.ts) already implies (the
photo "sharpens the hint"): the words are the shop's own definition, the photograph is
one example of it borrowed from the platform library. Photograph for what the words leave
unsaid; words where the two genuinely disagree.

### 6. Only the first image of each role was ever addressed

`findIndex` named the first cloth and the first cut and said nothing about anything after
them. An image the prompt never mentions is still an image the model has been handed, and
it will find a use for it — a second cloth sample gets read as pattern to print somewhere.

Correct for exactly today's two callers, and silently wrong the first time an outfit
arrives carrying a jacket's cloth and a trouser's, which is what the `label` field and the
N-source signature were built for.

Every source is now addressed by position and by slot. Related, in the same block:

- **`label` was declared and never used.** It is now what names each piece.
- **The `"garment"` role was never mentioned in the prompt at all.** A finished piece
  handed in alongside the cloth had no paragraph, so it was the likeliest thing in the
  request to be mistaken for a swatch. Read here as *already made, reproduce as
  photographed* — flag it if that is not the intent.
- **Ordinals stopped at "third".** A fourth image was called "third", which points the
  model at the wrong picture. Words to eighth, then a plain index.
- **"All stitched from this one cloth"** is the whole product today and false the moment
  an outfit carries a cloth per piece. Now conditional on the count, kept for one bolt
  because it is what stops a set coming back as a top in the sample and trousers in
  whatever the model thought went with it.

### 7. "Fully in frame" bought a small garment in a big empty rectangle

Satisfied perfectly by a piece floating in the middle of a mostly-empty frame — and a top
told that everything below its hem is empty background is being invited to draw exactly
that. Half the pixels spent on nothing, in the one image try-on later has to read the
garment out of.

Now: *scaled to fill the frame — the garment is the picture, and empty space is only what
is left over around it.*

### 8. "Plain neutral background" is not a colour

It comes back white on one run and warm grey on the next. Invisible in a single render,
obvious the moment a vendor's rail shows eight side by side.

Pinned to plain seamless white, which is what the try-on side's studio backdrop already
is. Renders made before this will not match new ones — but they already did not match
each other, so this only fixes the direction. See the open item on prompt versioning.

### 9. Nothing asked for the garment to be fully visible

This render is the garment input to try-on, which has to find and place every piece in it.
A sleeve tucked behind the body or a hem lost in a fold is a sleeve try-on has to invent,
and it invents onto a real shopper.

Now: sleeves, hems and the full length in view, nothing folded under, flat-laid, bunched
or draped over itself.

---

## Open — both need a migration

### A. `composition` reaches the prompt but has no mirror

Every other input to this prompt has a `rendered_*` column beside it — `rendered_note`,
`rendered_colors`, `rendered_fabric_image`, `rendered_style_revision` — and staleness is
the live value differing from the rendered one. `composition` now changes the render and
has no such column, so a vendor who corrects "cotton" to "cotton khadi" after listing
gets no re-stitch badge.

The fix follows the established pattern exactly: add `rendered_composition text`, compare
it in the route's `stale` expression and in `staleReason()`, and treat null as *predates
the mirror* — so nothing already in the catalog is marked stale and nobody is charged for
this being added.

### B. There is no compose prompt version

[src/lib/studio.ts](src/lib/studio.ts) solved this for try-on: `STUDIO_PROMPT_VERSION`
exists because a result is a product of its prompt, so a cached result made under an older
one is a different answer to the same question — and serving it makes a fixed bug look
unfixed.

Compose has the more elaborate staleness mirror and no such version. Every change in this
document is invisible to it: renders made under the old prompt still read as fresh.

Same shape as A — a `COMPOSE_PROMPT_VERSION` constant and a nullable
`rendered_prompt_version` column, null meaning *predates the mirror*. It costs nothing on
existing renders and starts working from the next prompt edit onward.

**Worth deciding deliberately**, because unlike A it eventually spends money: once it is
live, a wording change marks the shop's whole catalog for re-stitching, at one stitch
each. That is the correct behaviour and it is also a bill, so it wants a way to say "this
edit does not invalidate anything" — a version bumped by hand rather than derived.

### C. Not done, on purpose: sending the vendor's exact hex

`FabricColor` carries a `hex` the vendor tunes on a real colour wheel, and `colorPhrase()`
sends only the word: `62% maroon`. When `colorsCorrected` is set, the vendor has looked at
a render and disagreed with it — and "maroon" is a much wider target than the shade they
picked.

Left alone because it breaks a stated invariant rather than merely adding to the prompt:
staleness compares `colorPhrase()`, on the explicit ground that *a nudged hex is
display-only and never reaches a render, so it must not cost one*. Put hex in the prompt
and either the phrase changes too — nudging a swatch now costs a stitch — or a render can
silently stop matching its cloth. Both are real positions; it needs a decision, not a
patch.

---

## Checking a prompt without paying for one

`buildPrompt` is private, and the cheapest way to read its output is to stub `fetch`,
call `composeGarment()`, and print the `prompt` field off the captured `FormData`. Three
shapes worth looking at: a catalog render with every field populated, a counter run with
only a bolt and a sentence, and a two-cloth outfit with a finished piece — the last one
exercises the source-addressing block that no current caller reaches.

That was how each change here was read back before being kept.

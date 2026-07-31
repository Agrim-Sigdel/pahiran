/* Compose: turn source images into one catalog-quality garment render.

   Server-only — this spends money and holds the provider key.

   The output is deliberately person-independent. That is the property the
   whole made-to-order design rests on: a render with nobody in it caches
   forever and is shared by every shopper, so cost scales with combinations the
   vendor authored, not with traffic. It also means a shopper's photo takes
   exactly one try-on pass, instead of one pass per piece stacked on top of the
   last — each pass over an already-generated image is another chance to alter
   their face.

   Takes N sources so the same call serves both jobs: fabric + cut today,
   jacket + trousers + waistcoat when outfits land. */

import { familyLabel } from "@/lib/constants";
import type { StyleCoverage } from "@/lib/types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/edits";
/* Reference shots have no source image to edit — the cut's own words are the
   whole input — so they go to the generations endpoint instead. */
const OPENAI_GENERATIONS = "https://api.openai.com/v1/images/generations";

export const openaiKey = (): string | undefined =>
  process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

/** One input image and what it is, so the prompt can address it by position. */
export interface ComposeSource {
  image: string; // https URL or data URL
  role: "fabric" | "style-ref" | "garment";
  label?: string; // 'jacket', 'trousers' — the slot, for outfits
}

export interface ComposeRequest {
  sources: ComposeSource[];
  /** The cut, in the vendor's or the library's words. May be empty when a
      style reference image carries the shape instead. */
  hint: string;
  /** What is being made — 'suit', 'lehenga'. Steers proportion and drape. */
  family: string;
  /** The vendor's knowledge about this specific cloth: where a border falls,
      how heavy it is. Worth more than any prompt wording we could invent. */
  fabricNote?: string;
  /** What the cloth is made of — "wool 120s", "banarasi silk", "cotton
      khadi". The one fact a photograph of a flat sample cannot carry: two
      bolts can look identical and hang nothing alike, and drape is most of
      what makes a render read as a real stitched garment. */
  fabricComposition?: string;
  /** What the shop calls this cloth's colours — "62% maroon, 28% gold". A
      tiebreaker for a photo shot under a tube light, never licence to
      recolour: see how it's worded below. */
  fabricColors?: string;
  /** Those colours are the shop's verdict on a render they've seen, not what
      the upload photo measured. Only then do the words outrank the sample. */
  colorsCorrected?: boolean;
  /** Which pieces to make. Left to the wording, the model decides for itself
      whether "worn over matching churidar" means it should draw the churidar —
      and it answers differently on different runs. */
  coverage?: StyleCoverage;
  /** The vendor's note about this exact cloth-and-cut pairing. Refines the
      cut; it does not redefine which pieces exist — that's `coverage`. */
  note?: string;
  /** What the vendor said previous renders of this *cloth* got wrong, in any
      cut. Distinct from a description: this is a correction to apply. */
  clothFix?: string;
  /** What the vendor said the last attempt at this exact pairing got wrong. */
  fix?: string;
  /** Render quality. Defaults to medium — catalog imagery is generated once
      and seen often. */
  quality?: "low" | "medium" | "high";
  /** No cloth at all: stitch the cut from plain undyed cloth. This is the
      library's own photograph of a cut — a picture of the shape, made from the
      description, with nothing in it that a later render could mistake for
      part of the cut. Only meaningful with no `fabric` source. */
  plainCloth?: boolean;
}

async function toFile(src: string, name: string): Promise<File> {
  if (src.startsWith("data:")) {
    const [head, b64] = src.split(",");
    return new File([Buffer.from(b64, "base64")], name, {
      type: head.match(/data:(.*?);/)?.[1] || "image/jpeg",
    });
  }
  const r = await fetch(src);
  if (!r.ok) throw new Error("source image fetch failed (" + r.status + ")");
  return new File([await r.arrayBuffer()], name, {
    type: r.headers.get("content-type") || "image/jpeg",
  });
}

/* How the prompt points at an image. Words up to the count an outfit could
   plausibly reach, then a plain index rather than a wrong word — "third" for
   the fourth image sends the model to the wrong picture, which is worse than
   prose that reads slightly like a manifest. */
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const ordinal = (i: number): string => ORDINALS[i] ?? "image number " + (i + 1);

/* The ghost-mannequin lock is the single most important line in this file.

   This render becomes the garment input to try-on. If it comes back on a
   model — or on a mannequin with a shaped bust and hips — that body silhouette
   is baked into the garment image, and try-on will drag it onto the shopper.
   The shopper then sees a body that isn't theirs and orders a garment cut for
   it. So: no person, no face, no shaped torso, ever.

   It is also simply the format try-on models are trained on, so the constraint
   that protects body fidelity improves fit quality at the same time. */
function buildPrompt(req: ComposeRequest): string {
  const { sources, hint, fabricNote, fabricComposition, fabricColors, note, clothFix, fix } = req;
  const coverage = req.coverage ?? "set";
  /* The family as the shop says it, not as the database stores it. `family` is
     a slug, and "one complete daura-suruwal outfit" asks a model to parse a
     hyphenated token where "one complete Daura Suruwal outfit" hands it the
     garment by name. The try-on side already passes the label; this side was
     passing the id. */
  const family = familyLabel(req.family);
  /* The one condition under which the words beat the photo. Both halves are
     required: colours the shop has corrected, and colours to state. */
  const colorsLead = Boolean(req.colorsCorrected && fabricColors?.trim());
  /* Every source is addressed by position, because an image the prompt never
     mentions is still an image the model has been handed — and it will find a
     use for it. Picking the first of each role and ignoring the rest is right
     for exactly today's two callers and silently wrong the first time an
     outfit arrives carrying a jacket's cloth and a trouser's. */
  const at = (role: ComposeSource["role"]) =>
    sources.map((s, i) => ({ ...s, i })).filter((s) => s.role === role);
  const fabrics = at("fabric");
  const styleRefs = at("style-ref");
  const finished = at("garment");

  const parts: string[] = [];

  /* "The same cloth" is the whole of today's product and a false statement the
     moment an outfit arrives with a cloth per piece. Said conditionally rather
     than dropped, because for one bolt it is doing real work: it is what stops
     a set coming back as a top in the sample and trousers in whatever the
     model thought went with it. */
  const oneCloth = fabrics.length <= 1;
  /* No cloth handed in at all — a reference shot of the cut itself. Declared
     here because the wording below has to stop pointing at a sample image that
     does not exist; the paragraph that says so is a few lines down. */
  const plain = Boolean(req.plainCloth) && fabrics.length === 0;

  const subject =
    coverage === "set"
      ? `one complete ${family} outfit — ` +
        (oneCloth
          ? `every piece of it cut from the same cloth and shown together in the one frame`
          : `every piece of it shown together in the one frame`)
      : `one ${family} ${coverage === "top" ? "upper garment" : "lower garment"}`;

  parts.push(
    `Produce a single e-commerce product photograph of ${subject}, ` +
      `presented ghost-mannequin style: the garment holds its own shape as if worn, ` +
      `with nobody inside it.`
  );

  /* Stated as what must be absent, not just what to draw. "Render the top"
     leaves the model free to add trousers for a tidier picture; "the lower
     half of the frame is empty background" does not. */
  if (coverage === "top") {
    parts.push(
      `Make the upper garment ONLY. No trousers, churidar, suruwal, skirt, lehenga or lower ` +
        `garment of any kind appears anywhere in this image — below the hem of this piece there ` +
        `is nothing but empty background.`
    );
  } else if (coverage === "bottom") {
    parts.push(
      `Make the lower garment ONLY. No kurtha, blouse, shirt, jacket or any upper garment ` +
        `appears anywhere in this image — above the waistband there is nothing but empty ` +
        `background.`
    );
  } else {
    parts.push(
      `Make every piece of the outfit, upper and lower together, ` +
        (plain
          ? `all stitched from the same plain cloth and `
          : oneCloth
          ? `all stitched from this one cloth and `
          : ``) +
        `arranged as a single coordinated set in the same frame — the top positioned ` +
        `above the lower garment as they would be worn. Do not show only one half of the outfit.`
    );
  }

  /* No cloth was handed in, and every paragraph below assumes one was. Said
     here rather than left unsaid, because a prompt that describes a garment and
     never names a cloth gets one invented — and an invented cloth in a
     *reference* photograph is worse than in any other render: this image is
     later fed back to compose as the style reference, which is told to copy its
     shape and take none of its colour. A patterned reference is a pattern the
     model has to be talked out of on every render made from it. */
  if (plain) {
    parts.push(
      `There is no cloth sample. Stitch it from plain undyed mid-grey cloth of a weight that ` +
        `suits this garment — one flat colour throughout, with no print, motif, embroidery, ` +
        `border, woven pattern, contrast panel or decorative trim anywhere on it. This picture ` +
        `exists to show the cut and nothing else: the silhouette, seam lines, collar or ` +
        `neckline, sleeve and hem lengths and the closures are the whole subject.`
    );
  }

  /* Two versions of the one paragraph, because when the shop has corrected the
     colour this cannot also say "reproduce its exact colour" — that is the
     sentence the correction exists to overrule, and leaving both in the prompt
     asks the model to settle a contradiction we already know the answer to.
     Everything except colour is taken from the sample either way.

     Colour is the *only* thing the two arms disagree about. Both name the
     cloth the same way, both demand the pattern survive, and both grant the
     same licence to enhance — see `pattern` below. */
  if (fabrics.length > 0) {
    const which =
      fabrics.length === 1
        ? `The ${ordinal(fabrics[0].i)} image is the cloth this ` +
          `${coverage === "set" ? "outfit" : "garment"} must be stitched from.`
        : `The cloth: ` +
          fabrics
            .map((f) => `the ${ordinal(f.i)} image is for the ${f.label || "garment"}`)
            .join("; ") +
          `. Each piece is stitched from its own cloth and from no other — do not carry one ` +
          `sample's pattern onto a piece that belongs to another.`;
    /* The pattern demand and the enhancement licence are identical in both
       arms — only the colour sentence differs between them — so they are
       written once here rather than twice below.

       They came from main (12834f8, "enhance freely, but the pattern must
       survive it") and the failure they exist to stop is specific: a printed
       or brocade bolt coming back as a plain garment in roughly the right
       colour, which a model will do whenever it reads "enhance" as "tidy up".
       Kept verbatim from that commit — it is tuned prompt text and rewording
       it to taste is how a fix quietly stops working. */
    const pattern =
      ` If the cloth carries a print, motif, embroidery, border or woven pattern, that pattern ` +
      `MUST appear across the finished garment exactly as it appears in the sample — returning ` +
      `the garment in a plain or solid version of the cloth's colour is a failed result. Scale ` +
      `the pattern realistically for a garment of this size. You are welcome to enhance the ` +
      `rendering — sharper detail, richer texture, cleaner lighting than the sample photo — ` +
      `but enhancement must make the cloth's own pattern crisper, never simplify or smooth ` +
      `it away.`;
    parts.push(
      colorsLead
        ? which +
            ` Reproduce the exact weave, sheen, texture, print and motif scale, and the way the ` +
            `pattern is laid out across it. Colour is the one thing not to copy — that is given ` +
            `below. Do not substitute a similar fabric, do not invent pattern that isn't in the ` +
            `sample.` + pattern
        : which +
            ` Reproduce the exact colour, weave, sheen, texture, print and motif scale. Do not ` +
            `recolour it, do not substitute a similar fabric, do not invent pattern that isn't ` +
            `in the sample.` + pattern
    );
  }

  if (styleRefs.length > 0) {
    const which =
      styleRefs.length === 1
        ? `The ${ordinal(styleRefs[0].i)} image shows the cut to follow.`
        : `The cut: ` +
          styleRefs
            .map((s) => `the ${ordinal(s.i)} image shows the ${s.label || "garment"}`)
            .join("; ") +
          `.`;
    parts.push(
      which +
        ` Copy the silhouette, proportions, seam lines, collar or neckline, sleeve and hem ` +
        `length, and closures — but take none of the colour, fabric or pattern shown there, ` +
        `which must come entirely from the cloth sample.`
    );
  }

  /* A finished piece handed in alongside the cloth: the half of an outfit that
     already exists and is not being re-stitched. It is here because the role
     is in the interface, and a source the prompt says nothing about is the one
     failure mode this whole block exists to prevent — a photographed jacket
     silently treated as a cloth swatch and printed onto the trousers. */
  if (finished.length > 0) {
    parts.push(
      `Already made, not to be re-designed: ` +
        finished
          .map((g) => `the ${ordinal(g.i)} image is the finished ${g.label || "piece"}`)
          .join("; ") +
        `. Show ${finished.length === 1 ? "it" : "them"} exactly as photographed — same cloth, ` +
        `colour, cut and trim — and stitch only the remaining pieces from the cloth sample above.`
    );
  }

  if (hint.trim()) parts.push("Cut to make: " + hint.trim());

  /* Which description of the cut wins, said out loud for the same reason the
     colour paragraph says it: a cut can arrive twice over, once as the shop's
     words and once as a reference photograph, and nothing forces the two to
     agree. The words are the shop's own definition of the cut — the photograph
     is a picture of one example of it, borrowed from the platform's library and
     never chosen by this shop — so the words lead and the photograph fills in
     everything they leave unsaid. */
  if (hint.trim() && styleRefs.length > 0) {
    parts.push(
      `Those words are the shop's own definition of this cut and the reference photograph is one ` +
        `example of it. Take the shape, seams and lengths from the photograph wherever the words ` +
        `are silent; where the two genuinely disagree, follow the words.`
    );
  }

  /* Who wins when the words and the photo disagree about colour — and it turns
     on one thing only: whether the shop has looked at a render and told us the
     photo was wrong.

     Normally the sample image is the authority, said out loud here because
     naming a colour at all is an invitation to paint it. Colours that were
     measured off the sample have nothing to add to it — they are the same
     evidence in words, and a mistyped one is strictly worse than silence.

     `colorsCorrected` is the vendor overruling that measurement with the bolt
     itself in their hands — on the fabric form when the reading is plainly
     wrong, or in the studio with a stitched garment beside it. Either way it is
     the one piece of evidence the sample photo cannot provide about itself.
     Only then do the words lead and the photo supply everything else: weave,
     sheen, motif, scale.

     Gated on that flag and not on the presence of a cloth-level correction:
     "the border should sit at the hem" is a correction too, and it says
     nothing about whether the photo's colour was right. Deciding the sample is
     mis-lit on the strength of an unrelated complaint would repaint a garment
     that was already the right colour. */
  if (fabricColors?.trim()) {
    parts.push(
      colorsLead
        ? `The shop has set this cloth's colours to ${fabricColors.trim()} themselves, against ` +
            `the actual cloth in front of them. Take that over the sample photo's colour, ` +
            `which was shot under light that shifted it, and hold the proportions given: the ` +
            `share against each colour is roughly how much of the cloth it covers, so a small ` +
            `percentage is a border, a motif or a thread through the weave and never a whole ` +
            `panel of the garment. Everything else comes from the sample exactly as it is — ` +
            `weave, sheen, texture, print, motif and the scale of it.`
        : `The shop calls this cloth ${fabricColors.trim()}, roughly by how much of it each ` +
            `covers. Use that only to settle what the cloth sample is ambiguous about — which ` +
            `colour leads, and whether the lighting has shifted it warmer or cooler than it ` +
            `truly is. Where the words and the sample disagree, follow the sample. Do not ` +
            `repaint the cloth to match the words, and do not lay it out in blocks to match the ` +
            `percentages.`
    );
  }
  /* What the sample photograph physically cannot show. A flat rectangle of
     cloth pinned under a light says nothing about weight, and weight is what
     decides whether this comes out as a garment or as a shape with a picture
     of fabric on it: raw silk holds a sharp break where georgette pours, and
     both photograph as "a red cloth with gold in it". The shop already types
     this on the fabric form for the storefront card. */
  if (fabricComposition?.trim()) {
    parts.push(
      `The cloth is ${fabricComposition.trim()}. Let that decide how it behaves once cut: how ` +
        `stiffly or fluidly it hangs, how sharply it creases, how much body the folds have, and ` +
        `how much light the surface gives back.`
    );
  }

  /* Everything from here down is the shop's own prose, typed into a form, and
     it arrives after the rules it could contradict — later in a prompt is
     nearer the top of the model's mind. The coverage comment above names the
     exact case: "worn over matching churidar" is a description of how the
     piece is worn, and read as an instruction it draws the churidar. The
     vendor is not being adversarial; they are describing a garment to someone
     they assume already knows what is being made. So their words are handed
     over fenced — authoritative about cloth and cut, silent on everything
     structural — rather than trusted to stay in their lane. */
  const shopWords = Boolean(
    fabricNote?.trim() || note?.trim() || clothFix?.trim() || fix?.trim()
  );
  if (shopWords) {
    parts.push(
      `What follows is the shop's own wording. It is the best description of this cloth and this ` +
        `cut that exists, and it governs both. It does not change which pieces are made, the ` +
        `ghost-mannequin presentation, or the framing set out above: where it mentions a garment ` +
        `that is not being made here, it is saying how the piece is worn, not asking for that ` +
        `garment to be drawn.`
    );
  }

  if (fabricNote?.trim()) parts.push("The shop's note about this cloth: " + fabricNote.trim());
  /* Last of the three, so the most specific instruction is the freshest — this
     one was written about this cloth in this cut, and nothing else. */
  if (note?.trim()) parts.push("The shop's note about this cloth in this cut: " + note.trim());

  /* Corrections go last, after every description, because they are the reason
     this render is being paid for a second time. The vendor has seen an
     attempt and said what missed; that is better information than anything
     else in this prompt, all of which was written before any image existed.

     Neither of these may promise continuity with the previous attempt, however
     natural that wording is. The previous image is not among the sources — the
     model has never seen it — so "keep everything else as it was" points at
     nothing, and the nearest image it could bind that phrase to is the style
     reference it was just told to strip the colour from. What it can be told
     instead is that the rest of this brief already stands, and that the
     correction is not licence to re-roll the whole garment. */
  if (clothFix?.trim()) {
    parts.push(
      `The shop has stitched this cloth before and says this about how it comes out: ` +
        `${clothFix.trim()}. Apply it — it describes the real cloth, which the sample photo may ` +
        `have captured poorly. Everything else above still holds.`
    );
  }
  if (fix?.trim()) {
    parts.push(
      `An earlier attempt at this exact garment came out wrong, and the shop said this was the ` +
        `fault: ${fix.trim()}. Correcting that is the whole point of this render. Nothing else ` +
        `about the brief changes — the cloth, the cut and the framing are as described above — ` +
        `so treat the fault as the one thing being put right rather than as a reason to ` +
        `reinterpret the garment.`
    );
  }

  /* Two things the earlier wording left to chance, both of which cost the
     shopper rather than the picture.

     "Fully in frame" alone is satisfied by a small garment floating in a large
     empty rectangle, and a top told that everything below its hem is empty
     background is being invited to draw exactly that — half the frame spent on
     nothing, in the one image try-on will later read the garment out of.

     "Neutral" is not a colour. It comes back white one run and warm grey the
     next, which is invisible in a single render and obvious the moment a
     vendor's rail shows eight of them side by side. White, because that is
     what the studio backdrop already is on the try-on side. */
  parts.push(
    `Composition: everything described above centred, front view, fully in frame with nothing ` +
      `cropped at any edge, and scaled to fill the frame — the garment is the picture, and empty ` +
      `space is only what is left over around it. Flat even studio lighting on a plain seamless ` +
      `white background. Sharp focus throughout, true-to-life colour.`
  );

  /* This image is the garment input to try-on, which has to find and place
     every piece in it. A sleeve tucked behind the body or a hem lost in a fold
     is a sleeve try-on has to invent, and it invents onto a real shopper. */
  parts.push(
    `Show ${coverage === "set" ? "every piece" : "the piece"} open and complete: sleeves, hems ` +
      `and the full length in view and unobstructed, nothing folded under, flat-laid, bunched or ` +
      `draped over itself.`
  );

  parts.push(
    `Strictly forbidden: any person, model, face, hands, skin, head or shaped body inside the ` +
      `garment; a dress form or mannequin with a sculpted bust, waist or hips; a hanger, rail or ` +
      `props; text, labels, watermarks or logos that are not in the cloth itself; collage, ` +
      `multiple views or split panels; illustration, painting or stylised rendering.`
  );

  /* The last line restates coverage, because it is the rule with the most
     between it and the end of the prompt — it is stated near the top, and
     everything after it (the cut, the notes, the corrections) is a sentence
     about a garment that could be read as licence to add a second one. The
     ghost-mannequin lock gets this for free from the forbidden list just
     above; the piece count had nothing holding it at the close. */
  /* "this exact cloth" points at an image, so with no cloth handed in it points
     at nothing — and the nearest thing the model could bind it to is whatever
     cloth it just invented, which is the one thing this render must not have an
     opinion about. */
  const fromCloth = plain
    ? `plain unpatterned cloth`
    : oneCloth
    ? `this exact cloth`
    : `these exact cloths`;
  parts.push(
    coverage === "set"
      ? `The result must read as one real studio photograph of one finished outfit stitched from ` +
          `${fromCloth}, every piece of it present in the frame.`
      : coverage === "top"
      ? `The result must read as one real studio photograph of one finished upper garment stitched ` +
          `from ${fromCloth}, with no lower garment anywhere in the frame.`
      : `The result must read as one real studio photograph of one finished lower garment stitched ` +
          `from ${fromCloth}, with no upper garment anywhere in the frame.`
  );

  return parts.join("\n\n");
}

/** Render the garment. Returns a PNG data URL; the caller stores it.
    Throws on provider failure so the caller can refund the reserved credit. */
export async function composeGarment(req: ComposeRequest): Promise<string> {
  const key = openaiKey();
  if (!key) throw new Error("compose needs OPENAI_API_KEY");
  if (req.sources.length === 0) throw new Error("compose needs at least one source image");

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("size", "1024x1536"); // portrait: garments are taller than wide
  form.append("quality", req.quality ?? "medium");
  form.append("prompt", buildPrompt(req));

  const files = await Promise.all(
    req.sources.map((s, i) => toFile(s.image, s.role + "-" + i + ".jpg"))
  );
  for (const f of files) form.append("image[]", f);

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + key },
    body: form,
  });
  if (!res.ok) {
    throw new Error("compose provider error " + res.status + ": " + (await res.text()).slice(0, 300));
  }
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error("compose provider returned no image");
  return "data:image/png;base64," + b64;
}

/* ---------- the library's own photograph of a cut ---------- */

/* A cut is a description first — that is what lets the global library ship
   without a single image asset — but a description alone leaves the shape to
   whatever the model pictures on the day, and two vendors browsing the same
   named cut have nothing to look at. So a cut can also carry a reference
   photograph, and this is how the platform makes one: from the cut's own
   words, in plain cloth, through the same prompt every render goes through.

   Through the same prompt, and not a second one written for the purpose, is
   the whole point. The reference is what compose is later handed to copy the
   silhouette from, so anything the two prompts disagree about — framing, which
   pieces are in the picture, whether a body is implied — is a disagreement the
   render inherits. */

/** What a cut is, as far as rendering it goes. `sources` is absent because a
    reference shot has none: the description is the input. */
export type StyleShotRequest = Pick<ComposeRequest, "hint" | "family"> &
  Partial<Pick<ComposeRequest, "coverage" | "quality">>;

/** The exact prompt `composeStyleShot` will send. Exported so a caller can show
    it — or check it — without spending anything. */
export function styleShotPrompt(req: StyleShotRequest): string {
  return buildPrompt({ ...req, sources: [], plainCloth: true });
}

/** Render the reference photograph for one cut. Returns a PNG data URL; the
    caller stores it and attaches it to the cut.

    Generations rather than edits: there is no source image to edit. */
export async function composeStyleShot(req: StyleShotRequest): Promise<string> {
  const key = openaiKey();
  if (!key) throw new Error("compose needs OPENAI_API_KEY");
  if (!req.hint.trim()) {
    throw new Error("a cut with no description has nothing to render a reference from");
  }

  const res = await fetch(OPENAI_GENERATIONS, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-2",
      size: "1024x1536", // portrait, same as every other render
      quality: req.quality ?? "medium",
      n: 1,
      prompt: styleShotPrompt(req),
    }),
  });
  if (!res.ok) {
    throw new Error(
      "compose provider error " + res.status + ": " + (await res.text()).slice(0, 300)
    );
  }
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error("compose provider returned no image");
  return "data:image/png;base64," + b64;
}

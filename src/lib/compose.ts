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

import type { StyleCoverage } from "@/lib/types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/edits";

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
  /** Which pieces to make. Left to the wording, the model decides for itself
      whether "worn over matching churidar" means it should draw the churidar —
      and it answers differently on different runs. */
  coverage?: StyleCoverage;
  /** The vendor's note about this exact cloth-and-cut pairing. Refines the
      cut; it does not redefine which pieces exist — that's `coverage`. */
  note?: string;
  /** Render quality. Defaults to medium — catalog imagery is generated once
      and seen often. */
  quality?: "low" | "medium" | "high";
  /** Ask the provider to preserve the input images' exact detail instead of
      loosely reinterpreting them. This is what keeps a printed motif a motif
      rather than a flat average of its colours. Costs extra input tokens, so
      it is opt-in; the counter sets it because its whole premise is "this
      exact cloth". */
  inputFidelity?: "high";
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

/* The ghost-mannequin lock is the single most important line in this file.

   This render becomes the garment input to try-on. If it comes back on a
   model — or on a mannequin with a shaped bust and hips — that body silhouette
   is baked into the garment image, and try-on will drag it onto the shopper.
   The shopper then sees a body that isn't theirs and orders a garment cut for
   it. So: no person, no face, no shaped torso, ever.

   It is also simply the format try-on models are trained on, so the constraint
   that protects body fidelity improves fit quality at the same time. */
function buildPrompt(req: ComposeRequest): string {
  const { sources, hint, family, fabricNote, note } = req;
  const coverage = req.coverage ?? "set";
  const fabricIdx = sources.findIndex((s) => s.role === "fabric");
  const styleIdx = sources.findIndex((s) => s.role === "style-ref");

  const parts: string[] = [];

  const subject =
    coverage === "set"
      ? `one complete ${family} outfit — every piece of it cut from the same cloth and shown together in the one frame`
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
      `Make every piece of the outfit, upper and lower together, all stitched from this one ` +
        `cloth and arranged as a single coordinated set in the same frame — the top positioned ` +
        `above the lower garment as they would be worn. Do not show only one half of the outfit.`
    );
  }

  if (fabricIdx >= 0) {
    const ord = fabricIdx === 0 ? "first" : fabricIdx === 1 ? "second" : "third";
    parts.push(
      `The ${ord} image is the cloth this garment must be stitched from. Reproduce its exact ` +
        `colour, weave, sheen, texture, print and motif scale. Do not recolour it, do not ` +
        `substitute a similar fabric, do not invent pattern that isn't in the sample. If the ` +
        `cloth carries a print, motif, embroidery, border or woven pattern, that pattern MUST ` +
        `appear across the finished garment exactly as it appears in the sample — returning the ` +
        `garment in a plain or solid version of the cloth's colour is a failed result. Scale the ` +
        `pattern realistically for a garment of this size.`
    );
  }

  if (styleIdx >= 0) {
    const ord = styleIdx === 0 ? "first" : styleIdx === 1 ? "second" : "third";
    parts.push(
      `The ${ord} image shows the cut to follow. Copy its silhouette, proportions, seam lines, ` +
        `collar or neckline, sleeve and hem length, and closures — but take none of its colour, ` +
        `fabric or pattern, which must come entirely from the cloth sample.`
    );
  }

  if (hint.trim()) parts.push("Cut to make: " + hint.trim());
  if (fabricNote?.trim()) parts.push("The shop's note about this cloth: " + fabricNote.trim());
  /* Last of the three, so the most specific instruction is the freshest — this
     one was written about this cloth in this cut, and nothing else. */
  if (note?.trim()) parts.push("The shop's note about this cloth in this cut: " + note.trim());

  parts.push(
    `Composition: everything described above centred and fully in frame, front view, nothing cropped ` +
      `at any edge. Flat even studio lighting on a plain neutral background. Sharp focus throughout, ` +
      `true-to-life colour.`
  );

  parts.push(
    `Strictly forbidden: any person, model, face, hands, skin, head or shaped body inside the ` +
      `garment; a dress form or mannequin with a sculpted bust, waist or hips; a hanger, rail or ` +
      `props; text, labels, watermarks or logos that are not in the cloth itself; collage, ` +
      `multiple views or split panels; illustration, painting or stylised rendering.`
  );

  parts.push(
    coverage === "set"
      ? `The result must read as one real studio photograph of one finished outfit stitched from ` +
          `this exact cloth.`
      : `The result must read as one real studio photograph of one finished garment stitched from ` +
          `this exact cloth.`
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
  if (req.inputFidelity) form.append("input_fidelity", req.inputFidelity);
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

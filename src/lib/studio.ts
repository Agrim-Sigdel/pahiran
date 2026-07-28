/* The studio finish: a gpt-image-2 image edit that dresses a real person.

   Server-only — it spends money and holds the provider key.

   This used to live inside /api/tryon. It moved because two callers now need
   the identical edit: a shopper's try-on in the kiosk, and the vendor's
   counter bench, where a cloth is stitched and worn in one sitting. A second
   copy of this prompt would drift from the first, and a studio result is a
   product of its prompt — STUDIO_PROMPT_VERSION only means something while
   there is exactly one prompt for it to describe. */

import { openaiKey } from "@/lib/compose";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/edits";

/* Bump whenever the studio prompt changes in a way that alters the result.
   Studio output is a product of its prompt, so a cached result made under an
   older one is a different answer to the same question — and serving it makes
   a fixed bug look unfixed. Costs a re-generation per (shopper, piece) pair
   that gets tried again; the quick path is unaffected.
     1 → original single-garment swap
     2 → coverage-aware: sets replace every piece (including dupatta/shawl),
         tops and bottoms leave the other half of the outfit untouched */
export const STUDIO_PROMPT_VERSION = 2;

/** Best-effort abuse check on a person's photo before we spend on it.
    Only clearly disallowed uploads are blocked; a normal clothed photo never
    trips these. No OpenAI key → skipped (fail open). */
export async function moderatePerson(personImage: string): Promise<boolean> {
  const k = openaiKey();
  if (!k) return true;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: "Bearer " + k, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: personImage } }],
      }),
    });
    if (!res.ok) return true; // moderation outage shouldn't block real shoppers
    const cats = (await res.json())?.results?.[0]?.categories || {};
    return !(cats["sexual"] || cats["sexual/minors"]);
  } catch {
    return true;
  }
}

/** Studio finish: gpt-image-2 image edit with try-on guardrails. Returns a
    data URL; the caller uploads it to storage in Supabase mode. */
export async function runStudio(
  personImage: string,
  garmentImage: string,
  category: string,
  placement: string,
  multiPiece: boolean,
  opts?: {
    /** Swap the photo's background for a plain white studio backdrop. The
        counter wants every fitting to come out looking the same; the kiosk
        deliberately keeps the shopper's own scene. */
    studioBackground?: boolean;
    /** Override the automatic quality choice (low for one garment, medium
        for a multi-piece set). */
    quality?: "low" | "medium" | "high";
    /** Preserve the input images' exact detail — pattern, print, trim, and
        the person's face — instead of letting the model reinterpret them.
        Costs extra input tokens; the counter opts in. */
    inputFidelity?: "high";
  }
): Promise<string> {
  /* What to replace and, just as importantly, what to leave alone. The generic
     "remove the Kurtha they're wearing" is wrong in both directions: for a
     full set it never asks for the trousers to be replaced too, and for a top
     it never says their existing trousers must survive untouched. */
  const swap =
    placement === "one-pieces"
      ? `The second image is a COMPLETE OUTFIT made of several separate garments shown together. Put EVERY ` +
        `one of them on the person, not just the main one. Count the distinct pieces in the second image and ` +
        `reproduce all of them: the upper garment; the lower garment (trousers, churidar, suruwal, pyjama, ` +
        `skirt or lehenga); and any dupatta, shawl, stole, scarf or overlayer shown draped with it, worn the ` +
        `same way it is presented. If a piece appears in the second image it must appear on the person — ` +
        `leaving one out is a failed result. None of the person's own clothing may remain visible: not their ` +
        `top, and not their trousers, leggings or skirt, which the outfit's own lower garment replaces.`
      : placement === "tops"
      ? `This is an UPPER-BODY garment only. Replace just what the person is wearing on their upper body. ` +
        `Whatever they are wearing below the waist — trousers, jeans, skirt, suruwal, churidar — must stay ` +
        `exactly as it appears in the first image, completely unchanged, and must remain visible below the ` +
        `hem of the new garment. Do not add, remove, recolour or restyle their lower garment.`
      : placement === "bottoms"
      ? `This is a LOWER-BODY garment only. Replace just what the person is wearing below the waist. ` +
        `Whatever they are wearing on their upper body must stay exactly as it appears in the first image, ` +
        `completely unchanged. Do not add, remove, recolour or restyle their top.`
      : `Remove the ${category || "clothing"} the person in the first image is currently wearing and dress ` +
        `them in the garment from the second image instead.`;
  /* Placing three garments while holding a face identical is a materially
     harder edit than swapping one, and 'low' is where it shows first — pieces
     get dropped or smeared together. Only sets pay the extra; a single-garment
     try-on is unchanged. */
  return runStudioWithSwap(
    personImage,
    garmentImage,
    swap,
    opts?.quality ?? (multiPiece ? "medium" : "low"),
    !!opts?.studioBackground,
    opts?.inputFidelity
  );
}

async function runStudioWithSwap(
  personImage: string,
  garmentImage: string,
  swap: string,
  quality: string,
  studioBackground: boolean,
  inputFidelity?: "high"
): Promise<string> {
  const toFile = async (src: string, name: string): Promise<File> => {
    if (src.startsWith("data:")) {
      const [head, b64] = src.split(",");
      return new File([Buffer.from(b64, "base64")], name, { type: head.match(/data:(.*?);/)?.[1] || "image/jpeg" });
    }
    const r = await fetch(src);
    if (!r.ok) throw new Error("garment image fetch failed (" + r.status + ")");
    return new File([await r.arrayBuffer()], name, { type: r.headers.get("content-type") || "image/jpeg" });
  };
  /* Two backdrops, one identity lock. With the studio background on, the scene
     is ours to replace — but the person still isn't: the lock narrows from
     "everything outside the garment" to "the person outside the garment", and
     the forbidden list polices the backdrop instead of protecting it. */
  const scene = studioBackground
    ? `Keep the same body shape, height, pose, hand positions, camera angle and framing. The person ` +
      `themselves — every part of them the new garment does not cover — must stay pixel-identical to the first image.

Background: replace the original background entirely with a clean professional studio backdrop — plain seamless ` +
      `white, softly and evenly lit, with only a subtle natural floor shadow beneath the person. No props, no ` +
      `furniture, no walls or windows, no gradient bands, no visible backdrop seams. The person wearing the ` +
      `garment is the only subject in the frame, as in a catalog photograph.`
    : `Keep the same body shape, height, pose, hand positions, camera angle, framing and background. Everything ` +
      `the new garment does not cover must stay pixel-identical to the first image.`;
  const lighting = studioBackground
    ? `realistic draping, folds, and shadows under soft, even studio lighting`
    : `realistic draping, folds, and shadows that match the scene's existing lighting`;
  const backgroundBan = studioBackground
    ? `any background other than the plain white studio backdrop`
    : `background changes`;
  const closing = studioBackground
    ? `The result must look like an unedited real studio photograph of this exact person wearing this exact ` +
      `garment against a white backdrop, with nothing about the person changed.`
    : `The result must look like an unedited real photograph of this exact person wearing this exact garment, ` +
      `with nothing else changed.`;

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("size", "1024x1536");
  form.append("quality", quality);
  if (inputFidelity) form.append("input_fidelity", inputFidelity);
  form.append(
    "prompt",
    `Virtual try-on photo edit. ${swap} Reproduce the second image's garment exactly. Any garment being ` +
      `replaced must be completely gone, never visible underneath or through the new one.

Identity lock (most important rule): the face must be carried over from the first image completely unchanged. ` +
      `Do not retouch, beautify, slim, relight or regenerate it. Keep the identical facial features, expression, ` +
      `skin tone and texture, hairstyle, facial hair, and any glasses or jewellery. ${scene}

Garment fidelity: reproduce the second image's garment exactly. Match its color and shade, fabric and texture, ` +
      `pattern placement and scale, neckline, collar, sleeve length, hem length, buttons, zips, prints, logos, ` +
      `embroidery and trims. Do not invent, remove, recolor or restyle any element. Fit it naturally to this ` +
      `person's body in this pose, with ${lighting}.

Strictly forbidden: warped or extra limbs, deformed hands or fingers, floating or melted fabric, double garments, ` +
      `an altered face or hair, added people, added text or watermarks, ${backgroundBan}, framing or aspect changes, ` +
      `and any stylization or illustration look.

${closing}`
  );
  form.append("image[]", await toFile(personImage, "person.jpg"));
  form.append("image[]", await toFile(garmentImage, "garment.jpg"));
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + openaiKey() },
    body: form,
  });
  if (!res.ok) throw new Error("studio provider error " + res.status + ": " + (await res.text()).slice(0, 300));
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error("studio provider returned no image");
  return "data:image/png;base64," + b64;
}

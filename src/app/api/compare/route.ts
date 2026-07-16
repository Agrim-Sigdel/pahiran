import { mapCategory } from "@/lib/constants";

/* DEV-ONLY provider comparison: one provider per request (the page fires
   them in parallel and paints each result as it lands). Providers:
   fal/FASHN v1.6 (dedicated try-on), OpenAI gpt-image-1 and gpt-image-2
   (generic image edit). No cache, no rate limits — benchmarking tool only.
   Returns 404 outside `next dev`. */

const FAL_ENDPOINT = "https://fal.run/fal-ai/fashn/tryon/v1.6";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/edits";
const MAX_IMAGE_CHARS = 4_000_000;
const PROVIDERS = ["fal", "gpt-image-1", "gpt-image-2"] as const;

const openaiKey = () => process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

/* Kiosk uses mode:balanced and fal's fixed default seed (42). Here we chase
   FASHN's best case: quality mode + a random seed per run, so rerolling can
   actually change the outcome. */
async function runFal(personImage: string, garmentImage: string, category: string): Promise<string> {
  const res = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Key " + process.env.FAL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_image: personImage,
      garment_image: garmentImage,
      category: mapCategory(category),
      mode: "quality",
      seed: Math.floor(Math.random() * 2 ** 32),
      output_format: "jpeg",
    }),
  });
  if (!res.ok) throw new Error("fal " + res.status + ": " + (await res.text()).slice(0, 200));
  const url = (await res.json())?.images?.[0]?.url;
  if (!url) throw new Error("fal returned no image");
  return url;
}

/** data URL or http(s) URL → File for multipart upload. */
async function toFile(src: string, name: string): Promise<File> {
  if (src.startsWith("data:")) {
    const [head, b64] = src.split(",");
    const mime = head.match(/data:(.*?);/)?.[1] || "image/jpeg";
    return new File([Buffer.from(b64, "base64")], name, { type: mime });
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error("could not fetch garment image (" + res.status + ")");
  return new File([await res.arrayBuffer()], name, {
    type: res.headers.get("content-type") || "image/jpeg",
  });
}

async function runOpenAI(
  model: "gpt-image-1" | "gpt-image-2",
  personImage: string,
  garmentImage: string,
  category: string,
  quality: string
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  // input_fidelity is a gpt-image-1 param; gpt-image-2 rejects it (built in).
  if (model === "gpt-image-1") form.append("input_fidelity", "high");
  form.append("size", "1024x1536");
  form.append("quality", quality);
  form.append(
    "prompt",
    `Virtual try-on. Take off the ${category || "clothing"} the person in the first image is currently wearing ` +
      `and dress them in the exact garment from the second image instead — the old garment must be fully gone, ` +
      `not visible underneath or through the new one.

Guardrails:
- Same person: identical face, hair, skin tone, body shape, pose, camera angle and background as the first image.
- Exact outfit: the garment's color, pattern, neckline, sleeves and details must match the second image precisely — do not redesign it.
- No glitches: no warped or extra limbs, hands and fingers intact, no floating or melted fabric, no double garments, no added people, text or watermarks.
- Result must look like a real photograph of this person wearing this garment, nothing else changed.`
  );
  form.append("image[]", await toFile(personImage, "person.jpg"));
  form.append("image[]", await toFile(garmentImage, "garment.jpg"));

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + openaiKey() },
    body: form,
  });
  if (!res.ok) throw new Error("openai " + res.status + ": " + (await res.text()).slice(0, 300));
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error("openai returned no image");
  return "data:image/png;base64," + b64;
}

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { personImage, garmentImage, category, provider } = body || {};
  if (!PROVIDERS.includes(provider)) {
    return Response.json({ error: "provider must be one of " + PROVIDERS.join(", ") }, { status: 400 });
  }
  if (provider === "fal" && !process.env.FAL_KEY) {
    return Response.json({ error: "Server missing FAL_KEY" }, { status: 500 });
  }
  if (provider !== "fal" && !openaiKey()) {
    return Response.json({ error: "Server missing OPENAI_API_KEY (or OPEN_AI_API_KEY)" }, { status: 500 });
  }
  if (!personImage?.startsWith("data:image/") || personImage.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "personImage must be an image data URL" }, { status: 400 });
  }
  const okGarment =
    typeof garmentImage === "string" &&
    (garmentImage.startsWith("https://") || garmentImage.startsWith("data:image/")) &&
    garmentImage.length <= MAX_IMAGE_CHARS;
  if (!okGarment) {
    return Response.json({ error: "garmentImage must be an image data URL or https URL" }, { status: 400 });
  }

  const cat = typeof category === "string" ? category : "";
  const quality = ["low", "medium", "high"].includes(body?.quality) ? body.quality : "low";
  const t0 = Date.now();
  try {
    const url =
      provider === "fal"
        ? await runFal(personImage, garmentImage, cat)
        : await runOpenAI(provider, personImage, garmentImage, cat, quality);
    return Response.json({ url, ms: Date.now() - t0 });
  } catch (e: any) {
    const cause = e?.cause ? " — " + String(e.cause?.message || e.cause) : "";
    return Response.json(
      { error: (String(e?.message || e) + cause).slice(0, 400), ms: Date.now() - t0 },
      { status: 502 }
    );
  }
}

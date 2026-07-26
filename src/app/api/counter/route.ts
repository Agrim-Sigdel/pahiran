import { serviceClient, bearer, ownsShop } from "@/lib/billing";
import { badOrigin } from "@/lib/origin";
import { composeGarment, openaiKey, type ComposeSource } from "@/lib/compose";
import { moderatePerson, runStudio } from "@/lib/studio";
import { consumeCompose, refundCompose, consumeTryon, refundTryon } from "@/lib/plan";
import { overLimit } from "@/lib/ratelimit";
import { FAMILIES, familyLabel } from "@/lib/constants";
import { coverageCategory, COVERAGES, type StyleCoverage, type StyleFamily } from "@/lib/types";

/* The counter: a cloth, a cut and a customer, in one pass.

   /api/compose authors catalog — a vendor picks a bolt they already listed and
   renders it into cuts they already defined, ahead of anybody asking. This
   route is the other half of the shop, the one the tailor actually stands in:
   a customer is holding a bolt off the shelf that has never been listed, and
   wants to see it on themselves now. Nothing here is a catalog row. The vendor
   sends three photographs and gets back a render and a try-on; keeping any of
   it is a separate, deliberate act (see saveCounterRun in lib/storage.ts).

   It is the same two machines behind the same two meters — compose then studio
   try-on — so a counter run costs exactly what authoring a cut and trying it
   on would have cost. Both allowances are reserved BEFORE either provider is
   called: half a run is worse than none, and a vendor who is out of try-ons
   should not first pay for a render they cannot use. */

export const maxDuration = 300; // an image edit, then another; comfortably past any default

const MAX_IMAGE_CHARS = 4_000_000; // ~3MB of base64 — far above the app's own compression
const MAX_PROMPT_CHARS = 400; // matches the cut form's own limit
const DAY_MS = 24 * 60 * 60 * 1000;

const RENDERS_BUCKET = "renders"; // public: a garment render has nobody in it
const RESULTS_BUCKET = "results"; // private: this one has a real customer in it
const SIGNED_TTL_SEC = 3600;

function dailyCap(): number {
  const n = Number(process.env.TRYON_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

const isImageDataUrl = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("data:image/") && v.length <= MAX_IMAGE_CHARS;

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = serviceClient();
  if (!sb) return Response.json({ error: "The counter needs Supabase configured" }, { status: 500 });
  if (!openaiKey()) {
    return Response.json(
      { error: "Server missing OPENAI_API_KEY — add it to .env.local" },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopId = typeof body?.shopId === "string" ? body.shopId : "";
  const family = (typeof body?.family === "string" ? body.family : "") as StyleFamily;
  const coverage = (typeof body?.coverage === "string" ? body.coverage : "set") as StyleCoverage;
  const fabricImage = body?.fabricImage;
  // "" and null both mean "the words carry the cut", not "a broken photo"
  const styleImage = body?.styleImage || null;
  const personImage = body?.personImage;
  const stylePrompt = (typeof body?.stylePrompt === "string" ? body.stylePrompt : "")
    .trim()
    .slice(0, MAX_PROMPT_CHARS);
  const fabricNote = (typeof body?.fabricNote === "string" ? body.fabricNote : "")
    .trim()
    .slice(0, 300);

  if (!shopId) return Response.json({ error: "shopId is required" }, { status: 400 });
  if (!FAMILIES.some((f) => f.id === family)) {
    return Response.json({ error: "Pick what this cloth is being stitched into" }, { status: 400 });
  }
  if (!COVERAGES.some((c) => c.id === coverage)) {
    return Response.json({ error: "Pick which pieces this cut makes" }, { status: 400 });
  }
  if (!isImageDataUrl(fabricImage)) {
    return Response.json(
      { error: "The cloth photo must be a reasonably sized image" },
      { status: 400 }
    );
  }
  if (!isImageDataUrl(personImage)) {
    return Response.json(
      { error: "The customer photo must be a reasonably sized image" },
      { status: 400 }
    );
  }
  if (styleImage !== null && !isImageDataUrl(styleImage)) {
    return Response.json(
      { error: "The cut photo must be a reasonably sized image" },
      { status: 400 }
    );
  }
  /* The same bar the styles table sets with styles_describable: a cut that is
     neither photographed nor described tells the compose step nothing. */
  if (!styleImage && !stylePrompt) {
    return Response.json(
      { error: "Show us the cut in a photo, or describe it in words" },
      { status: 400 }
    );
  }

  if (!(await ownsShop(sb, bearer(req), shopId))) {
    return Response.json({ error: "Not your shop" }, { status: 403 });
  }

  /* The same platform-wide money circuit-breaker the kiosk sits behind, and
     deliberately the same bucket: a counter run spends from the same account
     as a shopper's try-on, so it has to count against the same daily ceiling. */
  const day = new Date().toISOString().slice(0, 10);
  if (await overLimit(sb, "tryon:global:" + day, dailyCap(), DAY_MS, { failClosed: true })) {
    await logError(sb, "global daily cap reached at the counter", { day }, shopId);
    return Response.json(
      { error: "peeq is very busy today — please try again tomorrow." },
      { status: 429 }
    );
  }

  // Abuse check on the customer's photo before we spend anything on it.
  if (!(await moderatePerson(personImage))) {
    return Response.json(
      { error: "That photo can't be used for try-on. Use a clear, fully-clothed photo." },
      { status: 422 }
    );
  }

  /* ── reserve both meters, then spend ── */
  const compose = await consumeCompose(sb, shopId);
  if (!compose.allowed) return meterRefusal(compose.reason, "compose");

  const tryon = await consumeTryon(sb, shopId, true);
  if (!tryon.allowed) {
    await refundCompose(sb, shopId); // nothing was generated; charge for nothing
    return meterRefusal(tryon.reason, "tryon");
  }

  /* ── both meters reserved; from here, progress streams ──
     The stitch and the fit are two provider calls back to back, and a real
     customer is standing at the counter through both. NDJSON events let the
     panel show the stitched piece the moment it exists instead of one answer
     after everything. Headers go out when the stream starts, so anything that
     fails inside it travels as an error event rather than a status code —
     the client treats those exactly like the old error responses. */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        /* ── 1. stitch the cloth into the cut ── */
        const sources: ComposeSource[] = [{ image: fabricImage, role: "fabric" }];
        if (styleImage) sources.push({ image: styleImage, role: "style-ref" });

        let garmentDataUrl: string;
        try {
          garmentDataUrl = await composeGarment({
            sources,
            hint: stylePrompt,
            family,
            fabricNote: fabricNote || undefined,
            coverage,
            /* Low, unlike the studio's medium: this render serves the one
               customer standing at the counter, not the catalog. Trying low
               end-to-end to judge whether the difference is worth 8x. */
            quality: "low",
          });
        } catch (e: any) {
          await refundCompose(sb, shopId);
          await refundTryon(sb, shopId, true);
          await logError(sb, "counter compose failed: " + (e?.message || e), { family, coverage }, shopId);
          send({ error: "The cloth didn't come out — please try again." });
          return;
        }

        /* Stored before the try-on runs, not after: if the second half fails,
           the vendor still has the stitched piece they paid for, and can send
           it through again without spending another compose. */
        let garmentUrl = garmentDataUrl;
        const renderPath = shopId + "/counter/" + crypto.randomUUID() + ".png";
        const { error: renderErr } = await sb.storage
          .from(RENDERS_BUCKET)
          .upload(renderPath, Buffer.from(garmentDataUrl.split(",")[1], "base64"), {
            contentType: "image/png",
          });
        if (renderErr) {
          // Not fatal — the render is in hand either way, it just isn't durable.
          await logError(sb, "counter render upload failed: " + renderErr.message, {}, shopId);
        } else {
          garmentUrl = sb.storage.from(RENDERS_BUCKET).getPublicUrl(renderPath).data.publicUrl;
        }

        /* The piece exists — say so now, while the fitting still runs. */
        send({ stage: "stitched", garmentUrl });

        /* ── 2. put it on the customer ── */
        let tryonDataUrl: string;
        try {
          tryonDataUrl = await runStudio(
            personImage,
            garmentDataUrl,
            familyLabel(family),
            coverageCategory(coverage),
            coverage === "set",
            /* Counter fittings all come out on the same white studio backdrop —
               the shop wall behind the customer varies, the output shouldn't.
               quality: low even for sets, to judge low end-to-end against the
               kiosk's low/medium split. */
            { studioBackground: true, quality: "low" }
          );
        } catch (e: any) {
          await refundTryon(sb, shopId, true); // the compose stands — its render is returned below
          await logError(sb, "counter try-on failed: " + (e?.message || e), { family, coverage }, shopId);
          send({
            error: "The stitched piece came out, but the try-on didn't. Try the customer photo again.",
            garmentUrl,
          });
          return;
        }

        /* A real person is in this one, so it goes where every other try-on
           goes: the private bucket, reachable only through a short-lived signed
           URL. If storage is unavailable the render is served once inline
           rather than lost. */
        let tryonUrl = tryonDataUrl;
        const resultPath = shopId + "/counter/" + crypto.randomUUID() + ".png";
        const { error: resultErr } = await sb.storage
          .from(RESULTS_BUCKET)
          .upload(resultPath, Buffer.from(tryonDataUrl.split(",")[1], "base64"), {
            contentType: "image/png",
          });
        if (resultErr) {
          await logError(sb, "counter result upload failed: " + resultErr.message, {}, shopId);
        } else {
          const { data: signed } = await sb.storage
            .from(RESULTS_BUCKET)
            .createSignedUrl(resultPath, SIGNED_TTL_SEC);
          if (signed?.signedUrl) tryonUrl = signed.signedUrl;
        }

        /* Deliberately no tryon_results row and no tryon_events row. The cache
           is keyed on a catalog piece and this run has none; the events table
           is the vendor's "what are shoppers reaching for" report, and a vendor
           demoing at their own counter is not a shopper reaching for anything.
           Both meters were already charged, so the spend is still accounted
           for. */
        send({ stage: "done", garmentUrl, tryonUrl });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}

/** Turn a meter's machine reason into something a tailor can act on. */
function meterRefusal(reason: string, meter: "compose" | "tryon"): Response {
  if (reason === "error") {
    return Response.json(
      { error: "peeq is briefly unavailable — please try again." },
      { status: 503 }
    );
  }
  if (reason === "not_approved") {
    return Response.json(
      { error: "Your shop is still awaiting approval, so the counter is locked for now.", reason },
      { status: 403 }
    );
  }
  if (reason === "tryon_not_enabled") {
    return Response.json(
      { error: "This shop doesn't have try-on — the counter needs it.", reason },
      { status: 403 }
    );
  }
  if (reason === "studio_limit") {
    return Response.json(
      {
        error: "You've used this month's try-on quality allowance. Upgrade in the Plan tab for more.",
        reason,
      },
      { status: 402 }
    );
  }
  return Response.json(
    {
      error:
        meter === "compose"
          ? "You've used this month's stitching allowance. Upgrade in the Plan tab for more."
          : "You've used this month's try-ons. Upgrade in the Plan tab for more.",
      reason,
    },
    { status: 402 }
  );
}

async function logError(
  sb: NonNullable<ReturnType<typeof serviceClient>>,
  message: string,
  detail: Record<string, unknown>,
  shopId: string
): Promise<void> {
  console.error("[counter-api]", message, detail);
  await sb
    .from("error_logs")
    .insert({ source: "counter-api", message: message.slice(0, 500), detail, shop_id: shopId })
    .then(() => {}, () => {});
}

import { serviceClient, bearer, ownsShop } from "@/lib/billing";
import { badOrigin } from "@/lib/origin";
import { composeGarment, openaiKey, type ComposeSource } from "@/lib/compose";
import { consumeCompose, refundCompose } from "@/lib/plan";
import type { StyleCoverage } from "@/lib/types";

/* Vendor-only: render a fabric in one or more cuts.
   - Authoring, not browsing. The caller must own the shop, and the server
     resolves the fabric and style rows itself — a client can never hand us an
     arbitrary image URL to spend credits on.
   - One compose credit per render, reserved before the call and refunded if
     the provider fails. Renders are person-independent, so each one is paid
     for once by the vendor and then served to every shopper for free.
   - Already-rendered combinations are returned as-is and cost nothing, which
     makes the batch button safe to press twice. */

export const maxDuration = 300; // image edits are slow; a batch of cuts more so

const MAX_BATCH = 8; // past this a vendor is generating noise, not catalog

interface Outcome {
  styleId: string;
  status: "ready" | "failed" | "skipped";
  compositionId?: string;
  imageUrl?: string;
  error?: string;
}

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = serviceClient();
  if (!sb) return Response.json({ error: "Compose needs Supabase configured" }, { status: 500 });
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
  const fabricId = typeof body?.fabricId === "string" ? body.fabricId : "";
  const styleIds: string[] = Array.isArray(body?.styleIds)
    ? body.styleIds.filter((s: unknown): s is string => typeof s === "string").slice(0, MAX_BATCH)
    : [];
  if (!shopId || !fabricId || styleIds.length === 0) {
    return Response.json(
      { error: "shopId, fabricId and at least one styleId are required" },
      { status: 400 }
    );
  }

  if (!(await ownsShop(sb, bearer(req), shopId))) {
    return Response.json({ error: "Not your shop" }, { status: 403 });
  }

  /* Keep "the row isn't there" and "the query itself failed" apart. Collapsing
     them once reported a missing column as an unknown fabric, which sent the
     debugging in entirely the wrong direction. */
  const { data: fabric, error: fabricErr } = await sb
    .from("fabrics")
    .select("id, shop_id, name, family, image_url, note")
    .eq("id", fabricId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (fabricErr) {
    console.error("[compose] fabric lookup failed:", fabricErr);
    return Response.json(
      { error: "Fabric lookup failed: " + fabricErr.message },
      { status: 500 }
    );
  }
  if (!fabric) return Response.json({ error: "Unknown fabric" }, { status: 400 });

  /* Global cuts (shop_id null) and this shop's own are both fair game; another
     vendor's private cut is not. */
  const { data: styles, error: styleErr } = await sb
    .from("styles")
    .select("id, shop_id, family, name, prompt_hint, coverage, revision, ref_image_url, active")
    .in("id", styleIds);
  if (styleErr) {
    console.error("[compose] style lookup failed:", styleErr);
    return Response.json(
      { error: "Cut lookup failed: " + styleErr.message },
      { status: 500 }
    );
  }
  const usable = (styles || []).filter(
    (s) => s.active && (s.shop_id === null || s.shop_id === shopId) && s.family === fabric.family
  );
  if (usable.length === 0) {
    return Response.json({ error: "No usable cuts for this fabric" }, { status: 400 });
  }

  const results: Outcome[] = [];

  for (const style of usable) {
    /* Already rendered? Hand it back — free, and makes re-pressing harmless.
       Unless the vendor has edited the note since: the image no longer matches
       what they asked for, so re-pressing is a deliberate re-render and gets
       charged like one. */
    const { data: existing } = await sb
      .from("compositions")
      .select("id, image_url, status, note, rendered_note, rendered_style_revision")
      .eq("shop_id", shopId)
      .eq("fabric_id", fabricId)
      .eq("style_id", style.id)
      .maybeSingle();
    const note = (existing?.note ?? "").trim();
    /* Stale either because the vendor rewrote the note, or because the cut
       itself has been edited since. A null revision predates the column and is
       left alone — see 20260726000600. */
    const revision = (style.revision as number | null) ?? 1;
    const renderedRev = existing?.rendered_style_revision as number | null | undefined;
    const stale =
      note !== (existing?.rendered_note ?? "").trim() ||
      (renderedRev !== null && renderedRev !== undefined && renderedRev !== revision);
    if (existing && existing.status === "ready" && !stale) {
      results.push({
        styleId: style.id,
        status: "skipped",
        compositionId: existing.id,
        imageUrl: existing.image_url || undefined,
      });
      continue;
    }

    const meter = await consumeCompose(sb, shopId);
    if (!meter.allowed) {
      // Out of allowance: stop the batch rather than half-charging for it.
      results.push({ styleId: style.id, status: "failed", error: meter.reason });
      break;
    }

    const sources: ComposeSource[] = [{ image: fabric.image_url, role: "fabric" }];
    if (style.ref_image_url) sources.push({ image: style.ref_image_url, role: "style-ref" });

    try {
      const dataUrl = await composeGarment({
        sources,
        hint: style.prompt_hint || "",
        family: fabric.family,
        fabricNote: fabric.note || undefined,
        coverage: (style.coverage as StyleCoverage) || "set",
        note: note || undefined,
      });

      const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
      /* A fresh path per render, never an overwrite. 'renders' is a public
         bucket, so its URLs are CDN-cached, and the try-on cache is keyed on
         the garment URL — overwriting in place would leave a re-stitch showing
         the picture it just replaced, to shoppers and to the vendor alike. The
         old object is removed after the row points at the new one. */
      const path = shopId + "/" + fabricId + "-" + style.id + "-" + crypto.randomUUID() + ".png";
      const { error: upErr } = await sb.storage
        .from("renders")
        .upload(path, bytes, { contentType: "image/png" });
      if (upErr) throw new Error("render upload failed: " + upErr.message);
      const imageUrl = sb.storage.from("renders").getPublicUrl(path).data.publicUrl;

      const { data: saved, error: saveErr } = await sb
        .from("compositions")
        .upsert(
          {
            shop_id: shopId,
            kind: "fabric_style",
            fabric_id: fabricId,
            style_id: style.id,
            image_url: imageUrl,
            status: "ready",
            error_note: null,
            /* What this image was actually made from. Equal to note now, so
               the render reads as fresh until the vendor edits the note again. */
            rendered_note: note,
            rendered_style_revision: revision,
          },
          { onConflict: "shop_id,fabric_id,style_id" }
        )
        .select("id")
        .single();
      if (saveErr) throw saveErr;

      /* Only now that the row points at the new image. An orphaned render
         costs a few kilobytes; a row pointing at a deleted object is a broken
         tile in the vendor's studio and the shopper's rail. */
      const previous = existing?.image_url as string | undefined;
      if (previous && previous !== imageUrl) {
        const oldPath = previous.split("/renders/")[1];
        if (oldPath) {
          await sb.storage.from("renders").remove([decodeURIComponent(oldPath)])
            .then(() => {}, () => {});
        }
      }

      results.push({ styleId: style.id, status: "ready", compositionId: saved.id, imageUrl });
    } catch (e: any) {
      await refundCompose(sb, shopId);
      const message = String(e?.message || e).slice(0, 300);
      await sb
        .from("error_logs")
        .insert({
          source: "compose-api",
          message: "compose failed: " + message,
          detail: { fabricId, styleId: style.id },
          shop_id: shopId,
        })
        .then(() => {}, () => {});
      await sb.from("compositions").upsert(
        {
          shop_id: shopId,
          kind: "fabric_style",
          fabric_id: fabricId,
          style_id: style.id,
          status: "failed",
          error_note: message,
        },
        { onConflict: "shop_id,fabric_id,style_id" }
      );
      results.push({ styleId: style.id, status: "failed", error: "render_failed" });
    }
  }

  return Response.json({ results });
}

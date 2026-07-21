import { requireAdmin, isDenied, audit, limitOf, emailsFor } from "@/lib/admin";

/* Shop administration: the approval queue and every lever over a live vendor.

   GET  — list shops with owner email, plan, usage, and catalog size.
   POST — approve / reject / suspend / restore, force-unlist, or delete.

   Deleting a shop cascades to its garments, events, leads, and subscription
   (see the foreign keys in schema.sql) but leaves the owner's auth account
   intact — removing a shop is not the same as removing a person. */

const STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
type Status = (typeof STATUSES)[number];

export async function GET(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if (isDenied(ctx)) return ctx;
  const sb = ctx.sb;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim();

  let query = sb
    .from("shops")
    .select(
      "id, owner, slug, name, area, whatsapp, listed, status, status_note, status_changed_at, created_at, " +
        "shop_subscriptions(plan_id, status, tryons_used, studio_used, period_end)",
    )
    .order("created_at", { ascending: false })
    .limit(limitOf(url));

  if (status && (STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,area.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data as any[]) || [];

  // Catalog size per shop, and owner emails, resolved in one pass each.
  const ids = rows.map((r) => r.id);
  const [{ data: garments }, emails] = await Promise.all([
    ids.length
      ? sb.from("garments").select("shop_id").in("shop_id", ids)
      : Promise.resolve({ data: [] as any[] }),
    emailsFor(sb, rows.map((r) => r.owner)),
  ]);
  const counts = new Map<string, number>();
  for (const g of ((garments as any[]) || [])) {
    counts.set(g.shop_id, (counts.get(g.shop_id) || 0) + 1);
  }

  const shops = rows.map((r) => {
    const sub = Array.isArray(r.shop_subscriptions) ? r.shop_subscriptions[0] : r.shop_subscriptions;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      area: r.area,
      whatsapp: r.whatsapp,
      listed: r.listed,
      status: r.status,
      statusNote: r.status_note,
      statusChangedAt: r.status_changed_at,
      createdAt: r.created_at,
      ownerEmail: emails.get(r.owner) || "",
      garmentCount: counts.get(r.id) || 0,
      plan: sub?.plan_id || "free",
      planStatus: sub?.status || "active",
      tryonsUsed: sub?.tryons_used ?? 0,
      studioUsed: sub?.studio_used ?? 0,
      periodEnd: sub?.period_end || null,
    };
  });

  return Response.json({ shops });
}

export async function POST(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req, { write: true });
  if (isDenied(ctx)) return ctx;
  const sb = ctx.sb;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopId = typeof body?.shopId === "string" ? body.shopId : "";
  const action = body?.action;
  if (!shopId) return Response.json({ error: "shopId is required" }, { status: 400 });

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, listed")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) return Response.json({ error: "Shop not found" }, { status: 404 });

  const note = typeof body?.note === "string" ? body.note.slice(0, 200) : null;

  if (action === "status") {
    const next = body?.status as Status;
    if (!(STATUSES as readonly string[]).includes(next)) {
      return Response.json({ error: "Unknown status" }, { status: 400 });
    }
    // A refusal is what the vendor reads on their dashboard, so it may not ship
    // without an explanation. Approving needs none.
    if ((next === "rejected" || next === "suspended") && !note?.trim()) {
      return Response.json(
        { error: "A note is required when rejecting or suspending a shop" },
        { status: 400 },
      );
    }
    const { error } = await sb.rpc("set_shop_status", {
      p_shop_id: shopId,
      p_status: next,
      p_note: note,
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // A shop pulled out of 'approved' must not stay in the public directory.
    if (next !== "approved" && shop.listed) {
      await sb.from("shops").update({ listed: false }).eq("id", shopId);
    }
    await audit(ctx, "shop.status." + next, "shop", shopId, { from: shop.status, note });
    return Response.json({ ok: true, status: next });
  }

  if (action === "unlist") {
    const { error } = await sb.from("shops").update({ listed: false }).eq("id", shopId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "shop.unlist", "shop", shopId, { name: shop.name });
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    // Typed-confirmation: the client must echo the slug back.
    if (body?.confirm !== shop.slug) {
      return Response.json({ error: "Confirmation does not match the shop slug" }, { status: 400 });
    }
    await audit(ctx, "shop.delete", "shop", shopId, { name: shop.name, slug: shop.slug });
    const { error } = await sb.from("shops").delete().eq("id", shopId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

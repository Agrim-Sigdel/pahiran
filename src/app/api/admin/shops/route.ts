import { requireAdmin, isDenied, audit, limitOf, emailsFor } from "@/lib/admin";

/* Shop administration: the approval queue and every lever over a live vendor.

   GET  — list shops with owner email, plan, usage, and catalog size.
   POST — approve / reject / suspend / restore, force-unlist, or delete.

   Deleting a shop cascades to its garments, events, leads, and subscription
   (see the foreign keys in schema.sql) but leaves the owner's auth account
   intact — removing a shop is not the same as removing a person. */

const STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
type Status = (typeof STATUSES)[number];

const TYPES = ["apparel", "general"] as const;
const CATEGORIES = [
  "clothing", "footwear", "jewellery", "beauty", "electronics",
  "home", "grocery", "sports", "books", "other",
] as const;

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
        "type, category, vendor_code, lat, lng, " +
        // The plan join gives usage a denominator — "300 used" means nothing
        // without the limit beside it.
        "shop_subscriptions(plan_id, status, tryons_used, studio_used, period_end, " +
        "plans(name, tryon_limit, studio_limit, max_garments, listed_allowed))",
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
    const plan = Array.isArray(sub?.plans) ? sub.plans[0] : sub?.plans;
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
      // Default to the pre-migration values so an un-migrated database renders
      // the console rather than a column of blanks.
      type: r.type || "apparel",
      category: r.category || "clothing",
      vendorCode: r.vendor_code || null,
      pinned: r.lat != null && r.lng != null,
      ownerEmail: emails.get(r.owner) || "",
      garmentCount: counts.get(r.id) || 0,
      plan: sub?.plan_id || "free",
      planName: plan?.name || null,
      planStatus: sub?.status || "active",
      tryonsUsed: sub?.tryons_used ?? 0,
      studioUsed: sub?.studio_used ?? 0,
      tryonLimit: plan?.tryon_limit ?? null,
      studioLimit: plan?.studio_limit ?? null,
      maxGarments: plan?.max_garments ?? null, // null = unlimited
      listedAllowed: plan?.listed_allowed ?? true,
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
    .select("id, name, slug, status, listed, type, category")
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

  /* Try-on entitlement, independent of what the shop says it sells. Granting
     try-on to a footwear shop is a deliberate choice an admin can make; the
     category stays whatever the vendor picked. A note is required either way,
     because revoking try-on from a shop that's been selling with it is a
     conversation the audit trail should be able to reconstruct. */
  if (action === "type") {
    const next = body?.type;
    if (!(TYPES as readonly string[]).includes(next)) {
      return Response.json({ error: "Unknown shop type" }, { status: 400 });
    }
    if (!note?.trim()) {
      return Response.json({ error: "A note is required when changing try-on entitlement" }, { status: 400 });
    }
    if (next === shop.type) return Response.json({ ok: true, type: next });
    const { error } = await sb.from("shops").update({ type: next }).eq("id", shopId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "shop.type." + next, "shop", shopId, { from: shop.type, note });
    return Response.json({ ok: true, type: next });
  }

  // Descriptive only — deliberately does NOT re-derive `type`, or correcting a
  // miscategorised shop would silently revoke try-on it was already using.
  if (action === "category") {
    const next = body?.category;
    if (!(CATEGORIES as readonly string[]).includes(next)) {
      return Response.json({ error: "Unknown category" }, { status: 400 });
    }
    const { error } = await sb.from("shops").update({ category: next }).eq("id", shopId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "shop.category", "shop", shopId, { from: shop.category, to: next });
    return Response.json({ ok: true, category: next });
  }

  /* The inverse of unlist. Two things must hold: the shop is approved (an
     unapproved shop is hidden from anon by RLS anyway, so listing it would be a
     lie), and its plan permits listing. */
  if (action === "list") {
    if (shop.status !== "approved") {
      return Response.json({ error: "Only an approved shop can be listed" }, { status: 400 });
    }
    const { data: sub } = await sb
      .from("shop_subscriptions")
      .select("plan_id, plans(listed_allowed)")
      .eq("shop_id", shopId)
      .maybeSingle();
    const plan = Array.isArray((sub as any)?.plans) ? (sub as any).plans[0] : (sub as any)?.plans;
    if (sub && plan && plan.listed_allowed === false) {
      return Response.json(
        { error: `The ${(sub as any).plan_id} plan does not allow directory listing` },
        { status: 400 },
      );
    }
    const { error } = await sb.from("shops").update({ listed: true }).eq("id", shopId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "shop.list", "shop", shopId, { name: shop.name });
    return Response.json({ ok: true });
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

import { requireAdmin, isDenied, audit, limitOf } from "@/lib/admin";

/* Account administration — metadata only, by design.

   PRIVACY BOUNDARY. A shopper's likeness (their remembered try-on photo in
   'shopper-photos', and every render in 'saved_looks' / the 'looks' bucket) is
   stored under per-user RLS precisely so that nobody but its owner can look at
   it. This route runs with the service role and could trivially read all of
   it. It must not. What an admin gets is the shape of an account — who it is,
   when it appeared, what it owns, how much it holds — never the images.

   Concretely: `photo_path` is never selected, saved looks are counted and
   never listed, and no signed URL is minted anywhere in this file. If a future
   change needs image access for abuse handling, that belongs behind a separate
   route with its own audit entry per view, not folded in here.

   Deleting an account is the one destructive lever, and it removes the
   likeness data along with everything else via the auth.users cascade. */

export async function GET(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if (isDenied(ctx)) return ctx;
  const sb = ctx.sb;

  const url = new URL(req.url);
  const limit = limitOf(url);
  const role = url.searchParams.get("role");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  // auth.users is the source of truth for identity; profiles adds our fields.
  const { data: authData, error: authErr } = await sb.auth.admin.listUsers({ page, perPage: limit });
  if (authErr) return Response.json({ error: authErr.message }, { status: 500 });
  const authUsers = authData?.users || [];
  const ids = authUsers.map((u) => u.id);

  const [{ data: profiles }, { data: shops }, { data: looks }] = await Promise.all([
    ids.length
      ? sb.from("profiles").select("id, role, name, phone, created_at").in("id", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? sb.from("shops").select("id, owner, name, slug, status").in("owner", ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? sb.from("saved_looks").select("user_id").in("user_id", ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profileBy = new Map(((profiles as any[]) || []).map((p) => [p.id, p]));
  const shopBy = new Map(((shops as any[]) || []).map((s) => [s.owner, s]));
  const lookCount = new Map<string, number>();
  for (const l of ((looks as any[]) || [])) {
    lookCount.set(l.user_id, (lookCount.get(l.user_id) || 0) + 1);
  }

  let users = authUsers.map((u) => {
    const p = profileBy.get(u.id);
    const shop = shopBy.get(u.id);
    return {
      id: u.id,
      email: u.email || "",
      role: p?.role || (shop ? "vendor" : "shopper"),
      name: p?.name || "",
      phone: p?.phone || "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at || null,
      confirmed: Boolean(u.email_confirmed_at),
      savedLookCount: lookCount.get(u.id) || 0,
      shop: shop ? { id: shop.id, name: shop.name, slug: shop.slug, status: shop.status } : null,
    };
  });

  if (role === "vendor" || role === "shopper") users = users.filter((u) => u.role === role);
  if (q) {
    users = users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.shop?.name || "").toLowerCase().includes(q),
    );
  }

  return Response.json({ users, page, hasMore: authUsers.length === limit });
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

  const userId = typeof body?.userId === "string" ? body.userId : "";
  const action = body?.action;
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 });

  const { data: target } = await sb.auth.admin.getUserById(userId);
  const email = target?.user?.email || "";
  if (!target?.user) return Response.json({ error: "User not found" }, { status: 404 });

  if (action === "role") {
    const next = body?.role;
    if (next !== "vendor" && next !== "shopper") {
      return Response.json({ error: "Role must be vendor or shopper" }, { status: 400 });
    }
    const { error } = await sb
      .from("profiles")
      .upsert({ id: userId, role: next, updated_at: new Date().toISOString() });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "user.role." + next, "user", userId, { email });
    return Response.json({ ok: true });
  }

  if (action === "ban" || action === "unban") {
    // Supabase expresses a suspension as a ban duration; "none" lifts it.
    const { error } = await sb.auth.admin.updateUserById(userId, {
      ban_duration: action === "ban" ? "876000h" : "none",
    } as any);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await audit(ctx, "user." + action, "user", userId, { email });
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    if (body?.confirm !== email) {
      return Response.json({ error: "Confirmation does not match the account email" }, { status: 400 });
    }
    // Cascades through profiles, saved_looks, shopper_bags, and any owned shop.
    await audit(ctx, "user.delete", "user", userId, { email });
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

import { requireAdmin, isDenied, limitOf } from "@/lib/admin";

/* Operational tail: recent application errors and the admin audit trail.
   Both are service-role reads — error_logs has no anon policy and
   admin_actions has no policy at all. */

export async function GET(req: Request): Promise<Response> {
  const ctx = await requireAdmin(req);
  if (isDenied(ctx)) return ctx;
  const sb = ctx.sb;

  const url = new URL(req.url);
  const limit = limitOf(url, 60);
  const source = (url.searchParams.get("source") || "").trim();

  let errQuery = sb
    .from("error_logs")
    .select("id, source, message, detail, shop_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (source) errQuery = errQuery.eq("source", source);

  const [{ data: errors }, { data: actions }] = await Promise.all([
    errQuery,
    sb
      .from("admin_actions")
      .select("id, actor_email, action, target_type, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  return Response.json({
    errors: ((errors as any[]) || []).map((e) => ({
      id: e.id,
      source: e.source,
      message: e.message,
      shopId: e.shop_id,
      createdAt: e.created_at,
      // Truncated: detail can carry large payload echoes.
      detail: e.detail ? JSON.stringify(e.detail).slice(0, 400) : null,
    })),
    actions: ((actions as any[]) || []).map((a) => ({
      id: a.id,
      actor: a.actor_email,
      action: a.action,
      target: a.target_type + ":" + a.target_id,
      detail: a.detail ? JSON.stringify(a.detail).slice(0, 200) : null,
      createdAt: a.created_at,
    })),
  });
}

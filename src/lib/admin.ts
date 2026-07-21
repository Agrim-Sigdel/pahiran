import { type SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, bearer, adminEmails } from "@/lib/billing";
import { badOrigin } from "@/lib/origin";

/* Shared guard for every /api/admin/* route.

   Authorization is the ADMIN_EMAILS allowlist, same as the billing inbox has
   always used — the bearer token is resolved to a real Supabase user and that
   user's email must be on the list. Admin is deliberately NOT a database role:
   an attacker who obtains a vendor session still cannot escalate, because the
   allowlist lives in server env that the database never sees.

   Once past the guard, all reads and writes use the service role and so bypass
   RLS. That is the whole point of the console, and also why every mutation
   goes through audit() — see the shopper-privacy note on listUsers below. */

export interface AdminCtx {
  sb: SupabaseClient;
  email: string;
  userId: string;
}

/** Resolve an admin caller, or return the Response to send back. */
export async function requireAdmin(
  req: Request,
  opts: { write?: boolean } = {},
): Promise<AdminCtx | Response> {
  // Write routes get the cross-site guard; reads are same-origin GETs.
  if (opts.write && badOrigin(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = serviceClient();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const token = bearer(req);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await sb.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email || !data.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adminEmails().includes(email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return { sb, email, userId: data.user.id };
}

/** True when the guard returned a Response rather than a context. */
export function isDenied(r: AdminCtx | Response): r is Response {
  return r instanceof Response;
}

/** Record an admin state change. Never throws — an audit failure must not
    roll back the action the admin already saw succeed. */
export async function audit(
  ctx: AdminCtx,
  action: string,
  targetType: "shop" | "user" | "garment" | "request",
  targetId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await ctx.sb.from("admin_actions").insert({
      actor_email: ctx.email,
      action,
      target_type: targetType,
      target_id: targetId,
      detail: detail ?? null,
    });
  } catch {
    /* auditing is best-effort */
  }
}

/** Clamp a user-supplied page size. */
export function limitOf(url: URL, fallback = 50, max = 200): number {
  const n = parseInt(url.searchParams.get("limit") || "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/** Look up auth emails for a set of user ids, in one paged sweep.

    Supabase has no server-side filter for auth.users, so this walks pages
    until every requested id is found or the pages run out. Callers pass the
    ids they actually need, which keeps the sweep bounded in practice. */
export async function emailsFor(
  sb: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const want = new Set(ids.filter(Boolean));
  const out = new Map<string, string>();
  if (want.size === 0) return out;

  for (let page = 1; page <= 20 && out.size < want.size; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (want.has(u.id) && u.email) out.set(u.id, u.email);
    }
    if (data.users.length < 200) break;
  }
  return out;
}

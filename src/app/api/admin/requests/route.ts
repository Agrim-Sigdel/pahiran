import { serviceClient, bearer, isAdmin, getPlanRow, activatePlan } from "@/lib/billing";
import { badOrigin } from "@/lib/origin";

/* Admin-only billing inbox. GET lists open plan_requests with shop context;
   POST fulfils one: activate a plan, grant credits (top-up), or dismiss.
   Authorized by the caller's Supabase token being in the ADMIN_EMAILS list;
   all DB work uses the service role. */

export async function GET(req: Request): Promise<Response> {
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 500 });
  if (!(await isAdmin(sb, bearer(req)))) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await sb
    .from("plan_requests")
    .select("id, kind, plan_id, note, created_at, shop_id, shops(name, slug)")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(200);

  const requests = ((data as any[]) || []).map((r) => {
    const shop = Array.isArray(r.shops) ? r.shops[0] : r.shops;
    return {
      id: r.id,
      kind: r.kind,
      planId: r.plan_id,
      note: r.note,
      createdAt: r.created_at,
      shopId: r.shop_id,
      shopName: shop?.name || "",
      shopSlug: shop?.slug || "",
    };
  });
  return Response.json({ requests });
}

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sb = serviceClient();
  if (!sb) return Response.json({ error: "Supabase not configured" }, { status: 500 });
  if (!(await isAdmin(sb, bearer(req)))) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const action = body?.action;
  if (!requestId || !["activate", "grant", "dismiss"].includes(action)) {
    return Response.json({ error: "requestId and a valid action are required" }, { status: 400 });
  }

  const { data: reqRow } = await sb
    .from("plan_requests")
    .select("id, shop_id, plan_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!reqRow || reqRow.status !== "open") {
    return Response.json({ error: "Request not found or already handled" }, { status: 400 });
  }

  if (action === "activate") {
    const planId = typeof body?.planId === "string" && body.planId ? body.planId : reqRow.plan_id;
    if (!planId) return Response.json({ error: "No plan to activate" }, { status: 400 });
    const plan = await getPlanRow(sb, planId);
    if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
    await activatePlan(sb, reqRow.shop_id, planId);
  } else if (action === "grant") {
    const tryons = Math.max(0, Math.min(100000, Math.floor(Number(body?.tryons) || 0)));
    const studio = Math.max(0, Math.min(100000, Math.floor(Number(body?.studio) || 0)));
    await sb.rpc("grant_credits", { p_shop_id: reqRow.shop_id, p_tryons: tryons, p_studio: studio });
  }
  // 'dismiss' just closes it.

  await sb.from("plan_requests").update({ status: "done" }).eq("id", requestId);
  return Response.json({ ok: true });
}

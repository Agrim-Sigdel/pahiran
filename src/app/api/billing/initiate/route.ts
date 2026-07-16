import {
  serviceClient, bearer, appOrigin, ownsShop, getPlanRow,
  khaltiInitiate, esewaFields, esewaFormUrl,
} from "@/lib/billing";
import { badOrigin } from "@/lib/origin";

/* Starts a plan upgrade. Verifies the caller owns the shop, prices the plan
   server-side (client can't tamper the amount), records a pending payment, and
   hands back the gateway redirect (Khalti URL or an eSewa signed form). */

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = serviceClient();
  if (!sb) return Response.json({ error: "Billing needs Supabase configured" }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopId = typeof body?.shopId === "string" ? body.shopId : "";
  const planId = typeof body?.planId === "string" ? body.planId : "";
  const provider = body?.provider === "khalti" || body?.provider === "esewa" ? body.provider : null;
  if (!shopId || !planId || !provider) {
    return Response.json({ error: "shopId, planId and provider are required" }, { status: 400 });
  }

  if (!(await ownsShop(sb, bearer(req), shopId))) {
    return Response.json({ error: "Not your shop" }, { status: 403 });
  }

  const plan = await getPlanRow(sb, planId);
  if (!plan || plan.price_npr <= 0) {
    return Response.json({ error: "That plan isn't purchasable" }, { status: 400 });
  }

  const { data: pay, error } = await sb
    .from("payments")
    .insert({ shop_id: shopId, plan_id: planId, provider, amount_npr: plan.price_npr, status: "pending" })
    .select("id")
    .single();
  if (error || !pay) {
    return Response.json({ error: "Could not start the payment" }, { status: 500 });
  }

  const origin = appOrigin(req);
  try {
    if (provider === "khalti") {
      const r = await khaltiInitiate({
        amountNpr: plan.price_npr,
        orderId: pay.id,
        orderName: "peeq " + plan.name + " plan",
        returnUrl: origin + "/api/billing/khalti/verify",
        websiteUrl: origin,
      });
      await sb.from("payments").update({ provider_ref: r.pidx, updated_at: new Date().toISOString() }).eq("id", pay.id);
      return Response.json({ paymentUrl: r.payment_url });
    }
    // eSewa: transaction_uuid is our payment id
    await sb.from("payments").update({ provider_ref: pay.id, updated_at: new Date().toISOString() }).eq("id", pay.id);
    const fields = esewaFields({
      amountNpr: plan.price_npr,
      transactionUuid: pay.id,
      successUrl: origin + "/api/billing/esewa/verify",
      failureUrl: origin + "/dashboard?billing=failed",
    });
    return Response.json({ formUrl: esewaFormUrl(), fields });
  } catch (e: any) {
    await sb.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    return Response.json({ error: "Payment gateway error: " + (e?.message || "unknown") }, { status: 502 });
  }
}

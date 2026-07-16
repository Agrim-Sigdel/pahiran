import { serviceClient, appOrigin, esewaVerify, activatePlan } from "@/lib/billing";

/* eSewa success_url. eSewa redirects here with a base64 `data` param carrying a
   signed response; we verify the signature + COMPLETE status, match the amount
   against our pending payment, activate the plan, and bounce to the dashboard.
   Idempotent on already-paid rows. */

export async function GET(req: Request): Promise<Response> {
  const origin = appOrigin(req);
  const back = (status: "success" | "failed") =>
    Response.redirect(origin + "/dashboard?billing=" + status, 303);

  const sb = serviceClient();
  if (!sb) return back("failed");

  const dataB64 = new URL(req.url).searchParams.get("data");
  if (!dataB64) return back("failed");

  const v = esewaVerify(dataB64);
  if (!v.ok || !v.transactionUuid) return back("failed");

  const { data: pay } = await sb
    .from("payments")
    .select("id, shop_id, plan_id, amount_npr, status")
    .eq("id", v.transactionUuid)
    .maybeSingle();
  if (!pay) return back("failed");
  if (pay.status === "paid") return back("success");

  // eSewa reports the total as a decimal string, e.g. "3000.0".
  if (Math.round(parseFloat(v.totalAmount)) !== pay.amount_npr) {
    await sb.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    return back("failed");
  }

  await sb
    .from("payments")
    .update({ status: "paid", transaction_id: v.transactionCode, updated_at: new Date().toISOString() })
    .eq("id", pay.id);
  await activatePlan(sb, pay.shop_id, pay.plan_id);
  return back("success");
}

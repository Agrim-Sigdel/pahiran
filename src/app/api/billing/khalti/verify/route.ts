import { serviceClient, appOrigin, khaltiLookup, activatePlan } from "@/lib/billing";

/* Khalti return_url. Khalti redirects the shopper here after payment with the
   pidx; we authoritatively verify via lookup, activate the plan on success,
   and bounce back to the dashboard. Idempotent: a already-paid row is a no-op. */

export async function GET(req: Request): Promise<Response> {
  const origin = appOrigin(req);
  const back = (status: "success" | "failed") =>
    Response.redirect(origin + "/dashboard?billing=" + status, 303);

  const sb = serviceClient();
  if (!sb) return back("failed");

  const pidx = new URL(req.url).searchParams.get("pidx");
  if (!pidx) return back("failed");

  const { data: pay } = await sb
    .from("payments")
    .select("id, shop_id, plan_id, amount_npr, status")
    .eq("provider_ref", pidx)
    .maybeSingle();
  if (!pay) return back("failed");
  if (pay.status === "paid") return back("success"); // already handled

  let lookup: { status: string; transaction_id: string | null; total_amount: number };
  try {
    lookup = await khaltiLookup(pidx);
  } catch {
    return back("failed");
  }

  // total_amount is in paisa; must match what we charged.
  const paid = lookup.status === "Completed" && lookup.total_amount === pay.amount_npr * 100;
  if (!paid) {
    await sb.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    return back("failed");
  }

  await sb
    .from("payments")
    .update({ status: "paid", transaction_id: lookup.transaction_id, updated_at: new Date().toISOString() })
    .eq("id", pay.id);
  await activatePlan(sb, pay.shop_id, pay.plan_id);
  return back("success");
}

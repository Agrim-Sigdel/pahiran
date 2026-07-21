"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { npr } from "@/lib/constants";

/* Manual billing (stub): instead of a live gateway, a vendor REQUESTS a plan
   upgrade or a credit top-up. The request is logged to plan_requests (the
   admin inbox) and an email to the admin is opened, prefilled. The admin then
   activates the plan / tops up by hand. Swap this for startCheckout() against
   /api/billing once Khalti/eSewa go live. */

export const ADMIN_EMAIL = "contact@agrimsigdel.com.np";

export interface RequestShop {
  id: string | null;
  name: string;
  slug: string | null;
}

export async function submitBillingRequest(opts: {
  shop: RequestShop;
  kind: "plan" | "credits";
  plan?: { id: string; name: string; priceNpr: number };
  currentPlanName?: string;
}): Promise<void> {
  const { shop, kind, plan, currentPlanName } = opts;
  const who = shop.name || shop.slug || "my shop";

  const note = (
    kind === "plan" && plan
      ? `Upgrade to ${plan.name} (${npr(plan.priceNpr)}/mo)`
      : `Credit top-up${currentPlanName ? ` (currently on ${currentPlanName})` : ""}`
  ).slice(0, 200);

  // Durable admin record (best-effort — the email still goes out if this fails).
  if (isSupabaseConfigured() && shop.id) {
    try {
      await supabase().from("plan_requests").insert({
        shop_id: shop.id,
        kind,
        plan_id: kind === "plan" ? plan?.id ?? null : null,
        note,
      });
    } catch {
      /* table may not be migrated yet — the email below is the fallback */
    }
  }

  const subject =
    kind === "plan"
      ? `peeq upgrade request — ${who}`
      : `peeq credit top-up request — ${who}`;
  const body =
    (kind === "plan" && plan
      ? `Hi, I'd like to upgrade "${who}" to the ${plan.name} plan (${npr(plan.priceNpr)}/month).`
      : `Hi, I'd like to top up my try-on credits for "${who}"${currentPlanName ? ` (currently on ${currentPlanName})` : ""}.`) +
    `\n\nShop: ${who}${shop.slug ? ` (/${shop.slug})` : ""}\n\nPlease let me know how to pay. Thanks!`;

  if (typeof window !== "undefined") {
    window.location.href =
      `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
}

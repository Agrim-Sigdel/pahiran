import type { SupabaseClient } from "@supabase/supabase-js";

/* Per-shop plan metering. A try-on reserves one generation against the shop's
   30-day allowance; a studio finish additionally reserves one studio slot.
   All accounting is atomic in Postgres (see consume_tryon / refund_tryon in
   supabase/schema.sql) so concurrent try-ons can't overshoot the plan. */

export type ConsumeReason =
  | "ok"
  | "tryon_limit"
  | "studio_limit"
  | "subscription_inactive"
  | "not_approved" // shop is pending/rejected/suspended — the outer approval gate
  | "tryon_not_enabled" // catalog-only shop (shops.type = 'general')
  | "error";

export interface ConsumeResult {
  allowed: boolean;
  reason: ConsumeReason;
  tryonsLeft: number;
  studioLeft: number;
}

/** Atomically reserve one try-on (and one studio slot when `studio`) against
    the shop's plan. Fail-closed: any DB error blocks the spend. */
export async function consumeTryon(
  sb: SupabaseClient,
  shopId: string,
  studio: boolean
): Promise<ConsumeResult> {
  try {
    const { data, error } = await sb.rpc("consume_tryon", {
      p_shop_id: shopId,
      p_studio: studio,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("consume_tryon returned no row");
    return {
      allowed: !!row.allowed,
      reason: row.reason as ConsumeReason,
      tryonsLeft: row.tryons_left ?? 0,
      studioLeft: row.studio_left ?? 0,
    };
  } catch (e: any) {
    // If the metering migration hasn't been applied yet, the function is
    // absent — let try-on work (unmetered) instead of bricking, and warn
    // loudly. The global daily cap still backstops spend. Real DB errors
    // fail closed.
    const code = e?.code || "";
    const msg = String(e?.message || e);
    if (code === "PGRST202" || code === "42883" || /find the function|does not exist/i.test(msg)) {
      console.warn("[plan] consume_tryon missing — metering OFF. Run supabase migrations to enable plan limits.");
      return { allowed: true, reason: "ok", tryonsLeft: 0, studioLeft: 0 };
    }
    return { allowed: false, reason: "error", tryonsLeft: 0, studioLeft: 0 };
  }
}

/** Return a reserved try-on when the generation ultimately failed. */
export async function refundTryon(
  sb: SupabaseClient,
  shopId: string,
  studio: boolean
): Promise<void> {
  try {
    await sb.rpc("refund_tryon", { p_shop_id: shopId, p_studio: studio });
  } catch {
    /* best-effort: a lost refund only under-counts in the shop's favour */
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";

/* Per-shop plan metering. A try-on reserves one generation against the shop's
   30-day allowance. All accounting is atomic in Postgres (see consume_tryon /
   refund_tryon in supabase/schema.sql) so concurrent try-ons can't overshoot
   the plan.

   The studio meter is retired in code. It dates from when studio was a premium
   finish beside quick; the kiosk and the counter now run studio as the only
   mode, which made studio_limit the de-facto try-on limit and tryon_limit a
   cap on the degraded fallback nobody chose. So every try-on now spends from
   tryon_limit alone: p_studio is pinned false below, studio_used never moves,
   and studio_limit never refuses anyone. The columns and the RPC parameter
   stay (no migration needed) — this file just stops using them. */

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

/** Atomically reserve one try-on against the shop's plan. Fail-closed: any DB
    error blocks the spend. The `studio` argument is accepted for call-site
    compatibility and deliberately ignored — see the header note. */
export async function consumeTryon(
  sb: SupabaseClient,
  shopId: string,
  _studio: boolean
): Promise<ConsumeResult> {
  try {
    const { data, error } = await sb.rpc("consume_tryon", {
      p_shop_id: shopId,
      p_studio: false,
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

/** Return a reserved try-on when the generation ultimately failed. Mirrors
    consumeTryon: only the try-on count moves, never the studio count. */
export async function refundTryon(
  sb: SupabaseClient,
  shopId: string,
  _studio: boolean
): Promise<void> {
  try {
    await sb.rpc("refund_tryon", { p_shop_id: shopId, p_studio: false });
  } catch {
    /* best-effort: a lost refund only under-counts in the shop's favour */
  }
}

/* ── compose: the vendor's own meter ────────────────────────────────────────
   A third allowance beside tryon_limit / studio_limit. Composes are spent at
   authoring time by the vendor rather than by the crowd, so a missing
   migration degrades differently from consume_tryon above: warn and let the
   work through, because the vendor's own batch cap still bounds the spend. A
   real DB error still fails closed. */

export async function consumeCompose(
  sb: SupabaseClient,
  shopId: string
): Promise<{ allowed: boolean; reason: string }> {
  try {
    const { data, error } = await sb.rpc("consume_compose", { p_shop_id: shopId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("consume_compose returned no row");
    return { allowed: !!row.allowed, reason: row.reason };
  } catch (e: any) {
    const code = e?.code || "";
    const msg = String(e?.message || e);
    if (code === "PGRST202" || code === "42883" || /find the function|does not exist/i.test(msg)) {
      console.warn("[plan] consume_compose missing — metering OFF. Run supabase migrations.");
      return { allowed: true, reason: "ok" };
    }
    return { allowed: false, reason: "error" };
  }
}

/** Return a reserved compose when the render ultimately failed. */
export async function refundCompose(sb: SupabaseClient, shopId: string): Promise<void> {
  try {
    await sb.rpc("refund_compose", { p_shop_id: shopId });
  } catch {
    /* best-effort: a lost refund only under-counts in the shop's favour */
  }
}

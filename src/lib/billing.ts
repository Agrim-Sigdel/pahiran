import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Server-side billing: gateway calls (Khalti ePayment, eSewa ePay v2), shop-
   owner authorization, and plan activation. Keys live in server env only.

   Sandbox by default — set the *_BASE and credential envs to go live:
     KHALTI_BASE (default https://a.khalti.com sandbox), KHALTI_SECRET_KEY
     ESEWA_BASE  (default https://rc-epay.esewa.com.np UAT),
     ESEWA_STATUS_BASE (default https://rc.esewa.com.np UAT),
     ESEWA_PRODUCT_CODE (default EPAYTEST), ESEWA_SECRET (default UAT secret) */

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Absolute origin for building return/callback URLs. */
export function appOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return proto + "://" + host;
}

/** Admin allowlist (comma-separated ADMIN_EMAILS, defaults to the founder). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "siliconpeaksvc@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the bearer token belongs to an allow-listed admin account. */
export async function isAdmin(sb: SupabaseClient, token: string | null): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await sb.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return false;
  return adminEmails().includes(email);
}

/** Confirm the bearer token belongs to the owner of this shop. */
export async function ownsShop(sb: SupabaseClient, token: string | null, shopId: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: shop } = await sb
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("owner", data.user.id)
    .maybeSingle();
  return !!shop;
}

export interface PlanRow {
  id: string;
  name: string;
  price_npr: number;
}

export async function getPlanRow(sb: SupabaseClient, planId: string): Promise<PlanRow | null> {
  const { data } = await sb.from("plans").select("id, name, price_npr").eq("id", planId).maybeSingle();
  return (data as PlanRow) ?? null;
}

export async function activatePlan(sb: SupabaseClient, shopId: string, planId: string): Promise<void> {
  await sb.rpc("activate_plan", { p_shop_id: shopId, p_plan_id: planId });
}

/* ── Khalti ePayment ─────────────────────────────────────────────────────── */

const khaltiBase = () => (process.env.KHALTI_BASE || "https://a.khalti.com").replace(/\/+$/, "");

export async function khaltiInitiate(opts: {
  amountNpr: number;
  orderId: string;
  orderName: string;
  returnUrl: string;
  websiteUrl: string;
}): Promise<{ pidx: string; payment_url: string }> {
  const res = await fetch(khaltiBase() + "/api/v2/epayment/initiate/", {
    method: "POST",
    headers: { Authorization: "Key " + process.env.KHALTI_SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      return_url: opts.returnUrl,
      website_url: opts.websiteUrl,
      amount: opts.amountNpr * 100, // paisa
      purchase_order_id: opts.orderId,
      purchase_order_name: opts.orderName,
    }),
  });
  if (!res.ok) throw new Error("khalti initiate " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

export async function khaltiLookup(pidx: string): Promise<{ status: string; transaction_id: string | null; total_amount: number }> {
  const res = await fetch(khaltiBase() + "/api/v2/epayment/lookup/", {
    method: "POST",
    headers: { Authorization: "Key " + process.env.KHALTI_SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ pidx }),
  });
  if (!res.ok) throw new Error("khalti lookup " + res.status);
  return res.json();
}

/* ── eSewa ePay v2 ───────────────────────────────────────────────────────── */

const esewaBase = () => (process.env.ESEWA_BASE || "https://rc-epay.esewa.com.np").replace(/\/+$/, "");
const esewaProductCode = () => process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
const esewaSecret = () => process.env.ESEWA_SECRET || "8gBm/:&EnhH.1/q(";

export function esewaFormUrl(): string {
  return esewaBase() + "/api/epay/main/v2/form";
}

function esewaSign(message: string): string {
  return crypto.createHmac("sha256", esewaSecret()).update(message).digest("base64");
}

/** Signed form fields; the client auto-submits these to esewaFormUrl(). */
export function esewaFields(opts: {
  amountNpr: number;
  transactionUuid: string;
  successUrl: string;
  failureUrl: string;
}): Record<string, string> {
  const total = String(opts.amountNpr);
  const code = esewaProductCode();
  const signature = esewaSign(
    `total_amount=${total},transaction_uuid=${opts.transactionUuid},product_code=${code}`
  );
  return {
    amount: total,
    tax_amount: "0",
    total_amount: total,
    transaction_uuid: opts.transactionUuid,
    product_code: code,
    product_service_charge: "0",
    product_delivery_charge: "0",
    success_url: opts.successUrl,
    failure_url: opts.failureUrl,
    signed_field_names: "total_amount,transaction_uuid,product_code",
    signature,
  };
}

/** Verify the base64 `data` payload eSewa appends to success_url. Returns the
    decoded fields plus whether the signature and status check out. */
export function esewaVerify(dataB64: string): { ok: boolean; transactionUuid: string; totalAmount: string; transactionCode: string } {
  let decoded: any;
  try {
    decoded = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));
  } catch {
    return { ok: false, transactionUuid: "", totalAmount: "", transactionCode: "" };
  }
  const fields: string[] = String(decoded.signed_field_names || "").split(",").filter(Boolean);
  const message = fields.map((f) => `${f}=${decoded[f]}`).join(",");
  const expected = esewaSign(message);
  const ok = expected === decoded.signature && decoded.status === "COMPLETE";
  return {
    ok,
    transactionUuid: String(decoded.transaction_uuid || ""),
    totalAmount: String(decoded.total_amount || ""),
    transactionCode: String(decoded.transaction_code || ""),
  };
}

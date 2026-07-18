"use client";

/* Shopper (and vendor) accounts on top of Supabase Auth. Everything here is a
   no-op unless Supabase is configured — the app keeps running device-only
   exactly as before. profiles.role separates shoppers from vendors so a
   shopper never gets a shop auto-provisioned.

   - useAccount(): reactive session for UI
   - currentUserId(): the id sync helpers in looks.ts / cart.ts route on
   - sign-in helpers (Google OAuth + email/password)
   - profile read/write for checkout & lead prefill */

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export interface ShopperContact {
  name: string;
  phone: string;
}

/** The signed-in user's id, or null (not logged in / Supabase off). */
export async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/* ---------- reactive session hook ---------- */

export function useAccount() {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<"shopper" | "vendor" | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  // resolve the role for signed-in users (drives role-aware nav)
  useEffect(() => {
    if (!user) { setRole(null); return; }
    let active = true;
    getRole().then((r) => { if (active) setRole(r); });
    return () => { active = false; };
  }, [user]);

  return { user, role, loading, configured };
}

/* ---------- sign in / out ----------
   Email/password only for now. Google OAuth is intentionally deferred — when
   it's added back it lands on /auth/callback and stamps the role via
   ensureRole(). */

export async function signInWithEmail(email: string, password: string) {
  return supabase().auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail(email: string, password: string) {
  return supabase().auth.signUp({ email, password });
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase().auth.signOut();
}

/* ---------- profiles / roles ---------- */

/** Ensure a profile row exists, without downgrading an existing vendor.
    Call at shopper entry points after sign-in. */
export async function ensureShopperProfile(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  // ignoreDuplicates: leaves an existing (possibly 'vendor') row untouched
  await supabase()
    .from("profiles")
    .upsert({ id: uid, role: "shopper" }, { onConflict: "id", ignoreDuplicates: true });
}

/** Explicitly claim the vendor role (dashboard / vendor login). */
export async function markVendor(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase().from("profiles").upsert({ id: uid, role: "vendor" }, { onConflict: "id" });
}

/** Resolve the account's role after sign-in without ever changing an existing
    one: honour the stored role if there is one, otherwise stamp the intent the
    sign-in flow asked for. This is what keeps signing in from the "wrong"
    surface from mis-roling an existing account. Returns the effective role. */
export async function ensureRole(intent: "shopper" | "vendor"): Promise<"shopper" | "vendor"> {
  const existing = await getRole();
  if (existing) return existing;
  if (intent === "vendor") await markVendor();
  else await ensureShopperProfile();
  return intent;
}

/** Where a given role lands after sign-in. */
export function roleHome(role: "shopper" | "vendor"): string {
  return role === "vendor" ? "/dashboard" : "/account";
}

/** True when this auth user owns a shop row — the ground truth for vendor-ness. */
async function ownsShop(uid: string): Promise<boolean> {
  const { data } = await supabase().from("shops").select("id").eq("owner", uid).maybeSingle();
  return !!data;
}

/** 'shopper' | 'vendor' | null (no profile yet / logged out).
    Owning a shop always means 'vendor', whatever profiles.role says — a shop
    owner mis-stamped 'shopper' (e.g. a pre-profiles vendor whose first sign-in
    after the migration went through the shopper flow) is healed on the spot,
    so they can never be locked out of their own dashboard. */
export async function getRole(): Promise<"shopper" | "vendor" | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await supabase().from("profiles").select("role").eq("id", uid).maybeSingle();
  const stored = (data?.role as "shopper" | "vendor") ?? null;
  if (stored === "vendor") return "vendor";
  if (await ownsShop(uid)) {
    await markVendor();
    return "vendor";
  }
  return stored;
}

/** Name + phone for checkout / lead prefill (empty strings if unset). */
export async function getContact(): Promise<ShopperContact | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await supabase().from("profiles").select("name, phone").eq("id", uid).maybeSingle();
  return { name: data?.name ?? "", phone: data?.phone ?? "" };
}

export async function saveContact(contact: ShopperContact): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase()
    .from("profiles")
    .upsert(
      { id: uid, name: contact.name || null, phone: contact.phone || null, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
}

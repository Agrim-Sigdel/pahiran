"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import Onboarding, { slugify } from "@/components/Onboarding";
import PendingReview from "@/components/PendingReview";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  loadShop, saveShop, loadCatalog, addGarment as persistGarment,
  updateGarment as persistGarmentUpdate, removeGarment as unpersistGarment,
  setGarmentStock, getTryOnEvents, getLeads, setLeadHandled,
  updateShopSlug,
} from "@/lib/storage";
import { reportError } from "@/lib/logging";
import { getRole, markVendor } from "@/lib/account";
import type { Garment, Lead, Shop, TryOnEvent } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop>({ id: null, slug: null, vendorCode: null, name: "", area: "", whatsapp: "", listed: false, status: "approved", statusNote: null, type: "apparel", category: "clothing", lat: null, lng: null });
  const [catalog, setCatalog] = useState<Garment[]>([]);
  const [events, setEvents] = useState<TryOnEvent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase().auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        // shopper accounts don't get a shop provisioned — send them to /account
        const role = await getRole();
        if (role === "shopper") {
          router.replace("/account");
          return;
        }
        await markVendor(); // visiting the dashboard is the explicit vendor action
      }
      const s = await loadShop();
      if (s) setShop(s);
      const shopId = s?.id ?? null;
      const [c, ev, ld] = await Promise.all([
        loadCatalog(shopId),
        getTryOnEvents(shopId),
        getLeads(shopId),
      ]);
      setCatalog(c);
      setEvents(ev);
      setLeads(ld);
      setLoading(false);
    })();
  }, [router]);

  const addGarment = async (g: Omit<Garment, "id" | "itemCode">) => {
    try {
      const saved = await persistGarment(shop, g, catalog.map((x) => x.id));
      setCatalog((c) => [saved, ...c]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      /* Both of these are raised by the enforce_garment_limit trigger, so they
         arrive as raw Postgres exception text. Translate them — the vendor
         should never see 'shop_not_approved' spelled that way. */
      if (msg.includes("shop_not_approved")) {
        alert("Your shop is still awaiting approval, so the catalog is locked for now. We'll call you once you're approved.");
        return;
      }
      if (msg.includes("garment_limit_reached")) {
        alert("You've reached your plan's garment limit. Upgrade in the Plan tab to add more.");
        return;
      }
      reportError("dashboard", "add garment failed: " + msg, { shopId: shop.id });
      alert("Could not save garment: " + (e?.message || "image may be too large — try a smaller photo."));
    }
  };

  const editGarment = async (updated: Garment) => {
    const existing = catalog.find((g) => g.id === updated.id);
    if (!existing) return;
    try {
      const saved = await persistGarmentUpdate(shop, updated, existing.image);
      setCatalog((c) => c.map((g) => (g.id === saved.id ? saved : g)));
    } catch (e: any) {
      reportError("dashboard", "edit garment failed: " + (e?.message || e), { shopId: shop.id });
      alert("Could not save changes: " + (e?.message || "please try again."));
    }
  };

  const changeSlug = async (slug: string): Promise<string | null> => {
    try {
      const updated = await updateShopSlug(shop, slug);
      setShop(updated);
      return null;
    } catch (e: any) {
      return e?.message || "Could not update the link — try again.";
    }
  };

  const removeGarment = async (id: string) => {
    const garment = catalog.find((g) => g.id === id);
    if (!garment) return;
    const next = catalog.filter((g) => g.id !== id);
    setCatalog(next);
    try { await unpersistGarment(garment, next.map((x) => x.id)); } catch {}
  };

  const toggleStock = async (id: string) => {
    const garment = catalog.find((g) => g.id === id);
    if (!garment) return;
    const inStock = !garment.inStock;
    setCatalog((c) => c.map((g) => (g.id === id ? { ...g, inStock } : g)));
    try { await setGarmentStock(garment, inStock); } catch {}
  };

  const updateShop = useCallback((s: Shop) => {
    setShop(s);
    saveShop(s).catch((e: any) => {
      reportError("dashboard", "save shop failed: " + (e?.message || e), { shopId: s.id });
      alert("Could not save shop settings: " + (e?.message || "please try again."));
    });
  }, []);

  /* First login: save the profile, then point /k and /s links at a slug
     built from the shop name (falling back to name-2 … if taken). */
  const completeOnboarding = async (info: { name: string; area: string; whatsapp: string; listed: boolean; type: Shop["type"]; category: Shop["category"]; lat: number | null; lng: number | null }) => {
    let next: Shop = { ...shop, ...info };
    await saveShop(next);
    if (next.id) {
      const base = slugify(info.name);
      if (base.length >= 3 && base !== next.slug) {
        const candidates = [base, ...[2, 3, 4, 5].map((n) => `${base.slice(0, 37)}-${n}`)];
        for (const candidate of candidates) {
          try {
            const updated = await updateShopSlug(next, candidate);
            next = { ...next, slug: updated.slug };
            break;
          } catch {
            // slug taken: try the next candidate; keep the provisioned slug if all fail
          }
        }
      }
    }
    setShop(next);
  };

  const handleLead = async (id: string, handled: boolean) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, handled } : l)));
    try { await setLeadHandled(id, handled); } catch {}
  };

  const signOut = isSupabaseConfigured()
    ? async () => { await supabase().auth.signOut(); router.replace("/login"); }
    : null;

  /* Two gates before the dashboard proper: fill in the profile, then wait for
     approval. An unapproved shop can't add garments or run try-ons — the
     database refuses both — so the dashboard would only offer controls that
     fail on use. */
  if (!loading && !shop.name.trim()) {
    return <Onboarding shop={shop} onComplete={completeOnboarding} />;
  }

  if (!loading && shop.status !== "approved") {
    return <PendingReview shop={shop} signOut={signOut} />;
  }

  return (
    <Dashboard
      shop={shop} updateShop={updateShop} changeSlug={shop.slug ? changeSlug : null}
      catalog={catalog} addGarment={addGarment} editGarment={editGarment}
      removeGarment={removeGarment}
      toggleStock={toggleStock} loading={loading}
      events={events} leads={leads} onLeadHandled={handleLead}
      launchKiosk={() => router.push(shop.slug ? "/k/" + shop.slug : "/kiosk")}
      signOut={signOut}
    />
  );
}

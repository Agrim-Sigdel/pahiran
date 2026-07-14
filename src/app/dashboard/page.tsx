"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  loadShop, saveShop, loadCatalog, addGarment as persistGarment,
  updateGarment as persistGarmentUpdate, removeGarment as unpersistGarment,
  setGarmentStock, getTryOnStats, updateShopSlug,
} from "@/lib/storage";
import { reportError } from "@/lib/logging";
import type { Garment, Shop, TryOnStat } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop>({ id: null, slug: null, name: "", area: "" });
  const [catalog, setCatalog] = useState<Garment[]>([]);
  const [stats, setStats] = useState<TryOnStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase().auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
      }
      const s = await loadShop();
      if (s) {
        setShop(s);
        const [c, st] = await Promise.all([loadCatalog(s.id), getTryOnStats(s.id)]);
        setCatalog(c);
        setStats(st);
      } else {
        const [c, st] = await Promise.all([loadCatalog(null), getTryOnStats(null)]);
        setCatalog(c);
        setStats(st);
      }
      setLoading(false);
    })();
  }, [router]);

  const addGarment = async (g: Omit<Garment, "id">) => {
    try {
      const saved = await persistGarment(shop, g, catalog.map((x) => x.id));
      setCatalog((c) => [saved, ...c]);
    } catch (e: any) {
      reportError("dashboard", "add garment failed: " + (e?.message || e), { shopId: shop.id });
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

  const updateShop = useCallback((s: Shop) => { setShop(s); saveShop(s); }, []);

  const signOut = isSupabaseConfigured()
    ? async () => { await supabase().auth.signOut(); router.replace("/login"); }
    : null;

  return (
    <Dashboard
      shop={shop} updateShop={updateShop} changeSlug={shop.slug ? changeSlug : null}
      catalog={catalog} addGarment={addGarment} editGarment={editGarment}
      removeGarment={removeGarment}
      toggleStock={toggleStock} stats={stats} loading={loading}
      launchKiosk={() => router.push(shop.slug ? "/k/" + shop.slug : "/kiosk")}
      signOut={signOut}
    />
  );
}

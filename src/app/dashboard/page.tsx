"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  loadShop, saveShop, loadCatalog, addGarment as persistGarment,
  removeGarment as unpersistGarment, setGarmentStock, getTryOnStats,
} from "@/lib/storage";
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
      alert("Could not save garment: " + (e?.message || "image may be too large — try a smaller photo."));
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
      shop={shop} updateShop={updateShop}
      catalog={catalog} addGarment={addGarment} removeGarment={removeGarment}
      toggleStock={toggleStock} stats={stats} loading={loading}
      launchKiosk={() => router.push(shop.slug ? "/k/" + shop.slug : "/kiosk")}
      signOut={signOut}
    />
  );
}

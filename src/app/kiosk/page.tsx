"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Kiosk from "@/components/Kiosk";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadCatalog, loadShop } from "@/lib/storage";
import type { Garment, Shop } from "@/lib/types";

/* Vendor's own kiosk (launched from the dashboard). Public shopper links
   go to /k/[slug] instead. */

function KioskOwn() {
  const router = useRouter();
  const params = useSearchParams();
  const [shop, setShop] = useState<Shop>({ id: null, slug: null, vendorCode: null, name: "", area: "", whatsapp: "", listed: false, status: "approved", statusNote: null, type: "apparel", category: "clothing", lat: null, lng: null });
  const [catalog, setCatalog] = useState<Garment[] | null>(null); // null = loading

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
      if (s) setShop(s);
      setCatalog((await loadCatalog(s?.id)).filter((g) => g.inStock));
    })();
  }, [router]);

  if (catalog === null) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "rgba(255,255,255,.6)", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
        {/* the blink is the loading state — the app is "looking" */}
        <span className="ee-mark ee-looking" style={{ fontSize: 48, color: "#fff" }}><span>ee</span></span>
        taking a peeq…
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 26 }}>nothing listed yet</div>
        <p style={{ color: "rgba(255,255,255,.55)", maxWidth: 380, margin: 0 }}>
          Add at least one in-stock garment in the dashboard before launching the kiosk.
        </p>
        <button className="ph-btn btn-violet" onClick={() => router.push("/dashboard")}
          style={{ padding: "14px 28px" }}>
          go to dashboard
        </button>
      </div>
    );
  }

  return (
    /* The vendor's own kiosk is a shop tablet by definition — one shopper
       after another — so it always runs in shared mode. */
    <Kiosk shop={shop} catalog={catalog} exit={() => router.push("/dashboard")}
      initialGarmentId={params.get("g")} shared />
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <KioskOwn />
    </Suspense>
  );
}

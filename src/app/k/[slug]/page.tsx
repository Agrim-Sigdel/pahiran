"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Kiosk from "@/components/Kiosk";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import type { Garment, Shop } from "@/lib/types";

/* Public per-shop kiosk: pahiran.app/k/{slug}. No auth — shoppers land here
   from the shop's kiosk screen or a hanger QR (?g=<garmentId> preselects). */

function PublicKiosk() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Garment[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) {
        setNotFound(true);
        return;
      }
      setShop(s);
      setCatalog((await loadCatalog(s.id)).filter((g) => g.inStock));
    })();
  }, [slug]);

  if (notFound) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 26 }}>Shop not found</div>
        <p style={{ color: "rgba(255,255,255,.55)", maxWidth: 380, margin: 0 }}>
          This try-on link doesn't match any shop. Double-check the QR code or ask the vendor for a new one.
        </p>
      </div>
    );
  }

  if (!shop || catalog === null) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 26 }}>{shop.name || "This shop"}</div>
        <p style={{ color: "rgba(255,255,255,.55)", maxWidth: 380, margin: 0 }}>
          Nothing on the virtual rack right now — check back soon.
        </p>
      </div>
    );
  }

  return (
    <Kiosk shop={shop} catalog={catalog} exit={() => router.push("/s/" + slug)}
      initialGarmentId={params.get("g")} />
  );
}

export default function PublicKioskPage() {
  return (
    <Suspense fallback={null}>
      <PublicKiosk />
    </Suspense>
  );
}

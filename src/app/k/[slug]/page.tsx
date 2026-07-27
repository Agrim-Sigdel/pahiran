"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Kiosk from "@/components/Kiosk";
import { getShopBySlug, loadCatalog, loadPublishedCompositions } from "@/lib/storage";
import type { Wearable, Shop } from "@/lib/types";

/* Public per-shop kiosk: pahiran.app/k/{slug}. No auth — shoppers land here
   from the shop's kiosk screen or a hanger QR (?g=<garmentId> preselects).

   ?v=2 opens the v2 fitting room instead (same flow, uncropped stage, rack
   that never leaves). Loaded on demand so shoppers who get the default kiosk
   never download the other one — this page opens on a phone in a shop. */

const KioskV2 = dynamic(() => import("@/components/KioskV2"), { ssr: false });

function PublicKiosk() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Wearable[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) {
        setNotFound(true);
        return;
      }
      setShop(s);
      /* Stock the shop physically holds, then the pieces it will stitch.
         Published compositions are wearable exactly like garments — the rail
         and the try-on step never learn the difference. */
      const [stock, madeToOrder] = await Promise.all([
        loadCatalog(s.id),
        loadPublishedCompositions(s.id),
      ]);
      setCatalog([...stock.filter((g) => g.inStock), ...madeToOrder]);
    })();
  }, [slug]);

  if (notFound) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--paper)", color: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 26 }}>shop not found</div>
        <p style={{ color: "var(--stone)", maxWidth: 380, margin: 0 }}>
          This try-on link doesn't match any shop. Double-check the QR code or ask the vendor for a new one.
        </p>
      </div>
    );
  }

  if (!shop || catalog === null) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--paper)", color: "var(--stone)", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
        {/* the blink is the loading state — the app is "looking" */}
        <span className="ee-mark ee-looking" style={{ fontSize: 48, color: "var(--violet)" }}><span>ee</span></span>
        taking a peeq…
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "var(--paper)", color: "var(--ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 26 }}>{shop.name || "This shop"}</div>
        <p style={{ color: "var(--stone)", maxWidth: 380, margin: 0 }}>
          nothing listed yet — check back soon.
        </p>
      </div>
    );
  }

  /* Public link: normally a shopper's own phone (a QR scan), where
     remembering their photo is the point. A vendor running this link on a
     shop tablet appends ?shared=1 to get shared-device behaviour. */
  const kiosk = {
    shop, catalog,
    exit: () => router.push("/s/" + slug),
    initialGarmentId: params.get("g"),
    shared: params.get("shared") === "1",
  };
  return params.get("v") === "2" ? <KioskV2 {...kiosk} /> : <Kiosk {...kiosk} />;
}

export default function PublicKioskPage() {
  return (
    <Suspense fallback={null}>
      <PublicKiosk />
    </Suspense>
  );
}

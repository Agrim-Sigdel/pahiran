"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import KioskV2 from "@/components/KioskV2";
import { getShopBySlug, loadCatalog, loadPublishedCompositions } from "@/lib/storage";
import type { Wearable, Shop } from "@/lib/types";

/* Public per-shop kiosk: pahiran.app/k/{slug}. No auth — shoppers land here
   from the shop's kiosk screen or a hanger QR (?g=<garmentId> preselects).

   One kiosk. There were two, and the one every QR scan reached was the one
   that cropped renders, hid the rack after a single try-on and painted its
   progress bar in a colour that vanished — all documented in the other file's
   header as the reasons it existed. */

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
        {/* A dead end with no way out is not an error page, it's a trap — and
            this one is reached by scanning a printed QR, so the shopper has no
            back button to fall back on either. */}
        <Link href="/" className="ph-btn btn-violet" style={{ marginTop: 4 }}>browse shops on peeq</Link>
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
          <Link href={"/s/" + slug} className="ph-btn btn-violet">visit the shop</Link>
          <Link href="/" className="ph-btn btn-outline">browse other shops</Link>
        </div>
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
  return <KioskV2 {...kiosk} />;
}

export default function PublicKioskPage() {
  return (
    <Suspense fallback={null}>
      <PublicKiosk />
    </Suspense>
  );
}

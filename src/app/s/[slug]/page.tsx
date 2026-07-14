"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { CATEGORIES, npr, waLink } from "@/lib/constants";
import type { Garment, Shop } from "@/lib/types";

/* Public storefront: pahiran.app/s/{slug}. Browse the catalog without a
   photo; every garment funnels into the try-on kiosk or a WhatsApp order. */

export default function StorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Garment[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState<Garment | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) { setNotFound(true); return; }
      setShop(s);
      setCatalog(await loadCatalog(s.id));
    })();
  }, [slug]);

  if (notFound) {
    return (
      <Centered>
        <div className="ph-display" style={{ fontSize: 26 }}>Shop not found</div>
        <p style={{ color: "var(--mut)", maxWidth: 380 }}>This link doesn't match any shop on Pahiran.</p>
      </Centered>
    );
  }
  if (!shop || catalog === null) {
    return <Centered><span style={{ color: "var(--mut)" }}>Loading…</span></Centered>;
  }

  const cats = ["All", ...CATEGORIES.filter((c) => catalog.some((g) => g.category === c))];
  const shown = filter === "All" ? catalog : catalog.filter((g) => g.category === filter);
  const tryonHref = "/k/" + slug;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px 80px" }}>
      {/* shop header */}
      <header style={{ padding: "34px 0 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--rani)", marginBottom: 6 }}>
            Pahiran storefront
          </div>
          <h1 className="ph-display" style={{ fontSize: "clamp(28px, 5vw, 40px)", margin: 0, lineHeight: 1.1 }}>
            {shop.name || "This shop"}
          </h1>
          {shop.area && <div style={{ color: "var(--mut)", fontSize: 14, marginTop: 4 }}>{shop.area}</div>}
        </div>
        <Link href={tryonHref} className="ph-btn"
          style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "14px 26px", fontSize: 16, borderRadius: 30, textDecoration: "none", boxShadow: "0 8px 22px rgba(196,37,97,.32)" }}>
          ✨ Try clothes on you
        </Link>
      </header>

      {/* category chips */}
      {cats.length > 2 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "18px 0 4px" }} className="garment-rail">
          {cats.map((c) => (
            <button key={c} className="ph-btn" onClick={() => setFilter(c)}
              style={{ background: filter === c ? "var(--ink)" : "#fff", color: filter === c ? "#fff" : "var(--mut)", border: "1px solid var(--line)", padding: "8px 16px", fontSize: 13, borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* catalog grid */}
      {shown.length === 0 ? (
        <div style={{ color: "var(--mut)", padding: 60, textAlign: "center" }}>
          Nothing on the rack{filter !== "All" ? " in this category" : ""} right now — check back soon.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 18, paddingTop: 18 }}>
          {shown.map((g) => (
            <button key={g.id} className="fade-up ph-btn" onClick={() => setDetail(g)}
              style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", padding: 0, textAlign: "left", opacity: g.inStock ? 1 : 0.6 }}>
              <div style={{ aspectRatio: "3/4", background: "var(--plum)", position: "relative" }}>
                <img src={g.image} alt={g.name} loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: g.inStock ? "none" : "grayscale(.7)" }} />
                {!g.inStock && (
                  <span style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(33,20,35,.85)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 20 }}>
                    Out of stock
                  </span>
                )}
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                <div style={{ color: "var(--rani)", fontWeight: 700, fontSize: 14, marginTop: 2 }}>{npr(g.price)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <footer style={{ textAlign: "center", color: "var(--mut)", fontSize: 12, marginTop: 60 }}>
        Powered by <Link href="/" style={{ color: "var(--rani)", textDecoration: "none", fontWeight: 600 }}>Pahiran</Link> — try it on, without trying it on.
      </footer>

      {detail && <GarmentSheet garment={detail} shop={shop} tryonHref={tryonHref} onClose={() => setDetail(null)} />}
    </div>
  );
}

function GarmentSheet({ garment, shop, tryonHref, onClose }: {
  garment: Garment; shop: Shop; tryonHref: string; onClose: () => void;
}) {
  const wa = waLink(
    shop.whatsapp,
    `Namaste! I saw "${garment.name}" (${npr(garment.price)}) on ${shop.name || "your"} Pahiran storefront and I'm interested.`
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(33,20,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "#fff", borderRadius: 20, width: 400, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ aspectRatio: "3/4", background: "var(--plum)" }}>
          <img src={garment.image} alt={garment.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ padding: "16px 18px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{garment.name}</div>
            <div style={{ color: "var(--rani)", fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{npr(garment.price)}</div>
          </div>
          <div style={{ color: "var(--mut)", fontSize: 13, marginTop: 3 }}>
            {garment.category}
            {garment.sizes.length > 0 && <> · Sizes: {garment.sizes.join(", ")}</>}
            {!garment.inStock && <span style={{ color: "var(--rani)", fontWeight: 600 }}> · Out of stock</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {garment.inStock && (
              <Link href={tryonHref + "?g=" + encodeURIComponent(garment.id)} className="ph-btn"
                style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "14px", fontSize: 15, textAlign: "center", textDecoration: "none", borderRadius: 12 }}>
                ✨ See it on you
              </Link>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="ph-btn"
                style={{ background: "#25D366", color: "#fff", padding: "14px", fontSize: 15, textAlign: "center", textDecoration: "none", borderRadius: 12 }}>
                Order on WhatsApp
              </a>
            )}
            <button className="ph-btn" onClick={onClose}
              style={{ background: "var(--cream)", color: "var(--ink)", padding: "12px", fontSize: 14, border: "1px solid var(--line)", borderRadius: 12 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
      {children}
    </div>
  );
}

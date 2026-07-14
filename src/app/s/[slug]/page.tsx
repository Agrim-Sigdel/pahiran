"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { npr, waLink } from "@/lib/constants";
import type { Garment, Shop } from "@/lib/types";

/* Public storefront — the shop's full homepage: announce bar, hero,
   featured pieces, try-on promo, full collection, footer with WhatsApp.
   Every garment funnels into the try-on kiosk (/k/{slug}?g=…) or a
   WhatsApp order. */

export default function StorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Garment[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState<Garment | null>(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) { setNotFound(true); return; }
      setShop(s);
      setCatalog(await loadCatalog(s.id));
    })();
  }, [slug]);

  const cats = useMemo(
    () => (catalog ? Array.from(new Set(catalog.map((g) => g.category))) : []),
    [catalog]
  );

  if (notFound) {
    return (
      <Centered>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--forest-deep)" }}>Shop not found</div>
        <p style={{ color: "var(--mut)", maxWidth: 380 }}>This link doesn't match any shop on EasyFitCheck.</p>
      </Centered>
    );
  }
  if (!shop || catalog === null) {
    return <Centered><span style={{ color: "var(--mut)" }}>Loading…</span></Centered>;
  }

  const tryonHref = "/k/" + slug;
  const inStock = catalog.filter((g) => g.inStock);
  const featured = inStock.slice(0, 4);
  const shown = filter === "All" ? catalog : catalog.filter((g) => g.category === filter);
  const askWa = shop.whatsapp
    ? waLink(shop.whatsapp, ask.trim() ? `Namaste! ${ask.trim()} (via ${shop.name || "your"} EasyFitCheck storefront)` : `Namaste! I have a question about your collection.`)
    : null;

  return (
    <div style={{ background: "var(--sage)", minHeight: "100vh" }}>
      {/* announce bar */}
      <div style={{ background: "var(--forest-deep)", color: "var(--sage)", textAlign: "center", fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", padding: "9px 12px" }}>
        Every piece below can be <b style={{ color: "var(--camel)" }}>tried on you</b> · one photo, no account
      </div>

      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links garment-rail">
          {cats.slice(0, 4).map((c) => (
            <a key={c} href="#collection" onClick={() => setFilter(c)}>{c}</a>
          ))}
        </div>
        <div className="nav-logo">
          <div className="ph-display" style={{ fontSize: "clamp(16px, 4vw, 20px)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--forest-deep)" }}>
            {shop.name || "The shop"}
          </div>
          {shop.area && (
            <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--mut)", marginTop: 2 }}>{shop.area}</div>
          )}
        </div>
        <div className="nav-tools">
          <Link href={tryonHref} style={{ color: "var(--camel)" }}>♥ My looks</Link>
        </div>
      </nav>

      {/* hero */}
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="kicker">Virtual try-on</div>
          <h1 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(30px, 4.6vw, 48px)", lineHeight: 1.14, color: "var(--forest-deep)", textTransform: "uppercase", letterSpacing: ".08em", margin: 0 }}>
            Elegance in<br />every thread
          </h1>
          <p style={{ color: "var(--mut)", fontSize: 15, fontWeight: 300, maxWidth: 360, lineHeight: 1.7, margin: 0 }}>
            Browse the collection below, or take one photo and see any piece on you before you visit the shop.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href={tryonHref} className="btn-solid">See it on you</Link>
            <a href="#collection" className="btn-outline">Browse collection</a>
          </div>
        </div>
        {featured[0] && (
          <div className="hero-visual" style={{ background: "var(--sage-mist)" }}>
            <img src={featured[0].image} alt={featured[0].name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}
      </div>

      {/* featured */}
      {featured.length > 0 && (
        <section className="section-pad">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
            <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(19px, 3vw, 24px)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--forest-deep)", margin: 0 }}>Featured pieces</h2>
            <a className="linklike" href="#collection">View all →</a>
          </div>
          <div className="shop-grid">
            {featured.map((g) => (
              <ShopCard key={g.id} g={g} tryonHref={tryonHref} onOpen={() => setDetail(g)} />
            ))}
          </div>
        </section>
      )}

      {/* try-on promo */}
      <section className="section-pad" style={{ background: "var(--sage-mist)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
            <div className="kicker">The trial room, reinvented</div>
            <h3 className="ph-display" style={{ fontWeight: 400, fontSize: 28, lineHeight: 1.25, color: "var(--forest-deep)", margin: 0 }}>
              Your perfect look is one photo away
            </h3>
            <p style={{ color: "var(--mut)", fontSize: 14, fontWeight: 300, lineHeight: 1.7, margin: 0 }}>
              No queue, no changing room. Take one photo and see the whole collection on you, then tell the shop what you want with a tap.
            </p>
            <div><Link href={tryonHref} className="btn-solid">Start try-on</Link></div>
          </div>
          {featured[1] && (
            <div style={{ minHeight: 220, background: "var(--sage-mist)" }}>
              <img src={featured[1].image} alt={featured[1].name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          )}
        </div>
      </section>

      {/* full collection */}
      <section id="collection" className="section-pad">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(19px, 3vw, 24px)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--forest-deep)", margin: 0 }}>The collection</h2>
          <span style={{ color: "var(--mut)", fontSize: 13 }}>{catalog.length} piece{catalog.length !== 1 ? "s" : ""}</span>
        </div>
        {cats.length > 1 && (
          <div className="garment-rail" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20 }}>
            <button className={"efc-chip " + (filter === "All" ? "on" : "off")} onClick={() => setFilter("All")}>All</button>
            {cats.map((c) => (
              <button key={c} className={"efc-chip " + (filter === c ? "on" : "off")} onClick={() => setFilter(c)}>{c}</button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <div style={{ color: "var(--mut)", padding: 50, textAlign: "center" }}>
            Nothing on the rack{filter !== "All" ? " in this category" : ""} right now — check back soon.
          </div>
        ) : (
          <div className="shop-grid">
            {shown.map((g) => (
              <ShopCard key={g.id} g={g} tryonHref={tryonHref} onOpen={() => setDetail(g)} />
            ))}
          </div>
        )}
      </section>

      {/* footer */}
      <footer className="section-pad" style={{ background: "var(--forest-deep)", color: "var(--sage)", paddingBottom: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28, maxWidth: 900, margin: "0 auto" }}>
          <div>
            <h4 className="ph-display" style={{ fontSize: 19, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, color: "var(--cream)", fontWeight: 500 }}>
              {shop.name || "The shop"}
            </h4>
            {shop.area && <p style={{ fontSize: 13, color: "rgba(237,239,224,.65)", lineHeight: 1.8, margin: 0 }}>{shop.area}</p>}
          </div>
          <div>
            <h4 className="ph-display" style={{ fontSize: 19, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, color: "var(--cream)", fontWeight: 500 }}>Visit</h4>
            <Link href={tryonHref} style={{ fontSize: 13, color: "rgba(237,239,224,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }}>Try clothes on you</Link>
            <a href="#collection" style={{ fontSize: 13, color: "rgba(237,239,224,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }}>Browse collection</a>
          </div>
          {askWa && (
            <div>
              <h4 className="ph-display" style={{ fontSize: 19, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, color: "var(--cream)", fontWeight: 500 }}>Order &amp; ask</h4>
              <p style={{ fontSize: 13, color: "rgba(237,239,224,.65)", margin: "0 0 12px" }}>Fastest reply on WhatsApp:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What are you looking for?"
                  style={{ flex: 1, padding: "11px 12px", borderRadius: "var(--radius-btn)", border: "1px solid rgba(237,239,224,.25)", background: "rgba(255,255,255,.06)", color: "var(--cream)", fontSize: 13 }} />
                <a href={askWa} target="_blank" rel="noopener noreferrer" className="ph-btn"
                  style={{ background: "var(--whatsapp)", color: "#fff", padding: "11px 18px", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 500, borderRadius: "var(--radius-btn)", textDecoration: "none", display: "flex", alignItems: "center" }}>
                  Send
                </a>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(237,239,224,.4)", marginTop: 34 }}>
          Powered by <b style={{ color: "var(--camel)" }}>EasyFitCheck</b> · try it on, without trying it on
        </div>
      </footer>

      {detail && <GarmentSheet garment={detail} shop={shop} tryonHref={tryonHref} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ShopCard({ g, tryonHref, onOpen }: { g: Garment; tryonHref: string; onOpen: () => void }) {
  return (
    <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden", opacity: g.inStock ? 1 : 0.6 }}>
      <div onClick={onOpen} style={{ aspectRatio: "3/4", position: "relative", cursor: "pointer", background: "var(--sage-mist)" }}>
        <img src={g.image} alt={g.name} loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: g.inStock ? "none" : "grayscale(.7)" }} />
        {!g.inStock && (
          <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--forest-deep)", color: "var(--cream)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 2 }}>
            Out of stock
          </span>
        )}
      </div>
      <div style={{ padding: "13px 14px 15px" }}>
        <div onClick={onOpen} style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
        <div style={{ color: "var(--camel)", fontWeight: 500, fontSize: 14, marginBottom: 10 }}>{npr(g.price)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {g.inStock ? (
            <Link href={tryonHref + "?g=" + encodeURIComponent(g.id)}
              style={{ textDecoration: "underline", textUnderlineOffset: 4, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600, color: "var(--forest-deep)" }}>
              Try on →
            </Link>
          ) : <span />}
          <button className="ph-btn" onClick={onOpen} style={{ color: "var(--mut)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Details
          </button>
        </div>
      </div>
    </div>
  );
}

function GarmentSheet({ garment, shop, tryonHref, onClose }: {
  garment: Garment; shop: Shop; tryonHref: string; onClose: () => void;
}) {
  const wa = waLink(
    shop.whatsapp,
    `Namaste! I saw "${garment.name}" (${npr(garment.price)}) on ${shop.name || "your"} EasyFitCheck storefront and I'm interested.`
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(42,61,47,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--cream)", borderRadius: "var(--radius-modal)", width: 380, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ aspectRatio: "3/4", background: "var(--sage-mist)" }}>
          <img src={garment.image} alt={garment.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontWeight: 500, fontSize: 17 }}>
            <span>{garment.name}</span>
            <span style={{ color: "var(--camel)", flexShrink: 0 }}>{npr(garment.price)}</span>
          </div>
          <div style={{ color: "var(--mut)", fontSize: 13, marginTop: 3 }}>
            {garment.category}
            {garment.sizes.length > 0 && <> · Sizes: {garment.sizes.join(", ")}</>}
            {!garment.inStock && <span style={{ color: "var(--forest)", fontWeight: 600 }}> · Out of stock</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {garment.inStock && (
              <Link href={tryonHref + "?g=" + encodeURIComponent(garment.id)} className="btn-solid">
                See it on you
              </Link>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa">
                Order on WhatsApp
              </a>
            )}
            <button className="ph-btn" onClick={onClose}
              style={{ color: "var(--mut)", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", padding: 10 }}>
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "var(--sage)" }}>
      {children}
    </div>
  );
}

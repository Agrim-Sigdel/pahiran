"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { waLink } from "@/lib/constants";
import { osmViewUrl } from "@/lib/osm";
import { useCart, useWishlist } from "@/lib/cart";
import { useAccount, getContact } from "@/lib/account";
import AccountMenu from "@/components/AccountMenu";
import { ShopCard, CartDrawer } from "@/components/storefront";
import type { Garment, Shop } from "@/lib/types";

/* Public storefront — a traditional shopping experience: browse, save, pick a
   size, add to a bag, and check out as one itemised order. Every piece links
   to its own product page (/s/[slug]/[garment]); the AI try-on ("see it on
   you") rides along as a secondary action. */

type Sort = "featured" | "new" | "price-asc" | "price-desc";

export default function StorefrontClient() {
  const { slug } = useParams<{ slug: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Garment[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const [savedOnly, setSavedOnly] = useState(false);
  const [ask, setAsk] = useState("");
  const [cartOpen, setCartOpen] = useState(false);

  const cart = useCart(slug);
  const wish = useWishlist(slug);
  const { user, configured } = useAccount();
  const [contact, setContact] = useState({ name: "", phone: "" });

  useEffect(() => {
    if (user) getContact().then((c) => c && setContact(c));
  }, [user]);

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
        <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)" }}>shop not found</div>
        <p style={{ color: "var(--stone)", maxWidth: 380 }}>This link doesn't match any shop on peeq.</p>
      </Centered>
    );
  }
  if (!shop || catalog === null) {
    return (
      <Centered>
        <span className="ee-mark ee-looking" style={{ fontSize: 44, color: "var(--violet)" }}><span>ee</span></span>
        <span style={{ color: "var(--stone)" }}>taking a peeq…</span>
      </Centered>
    );
  }

  const tryonHref = "/k/" + slug;
  const inStock = catalog.filter((g) => g.inStock);
  const featured = inStock.slice(0, 4);

  // collection pipeline: category / saved → search → sort
  let shown = savedOnly ? catalog.filter((g) => wish.has(g.id)) : (filter === "All" ? catalog : catalog.filter((g) => g.category === filter));
  const q = query.trim().toLowerCase();
  if (q) shown = shown.filter((g) => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
  shown = [...shown];
  if (sort === "new") shown.reverse();
  else if (sort === "price-asc") shown.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") shown.sort((a, b) => b.price - a.price);

  const askWa = shop.whatsapp
    ? waLink(shop.whatsapp, ask.trim() ? `Namaste! ${ask.trim()} (via ${shop.name || "your"} peeq storefront)` : `Namaste! I have a question about your collection.`)
    : null;
  const contactWa = waLink(shop.whatsapp, `Namaste! I have a question about ${shop.name || "your shop"}. (via peeq)`);

  const openCollectionSaved = () => {
    setSavedOnly(true);
    setFilter("All");
    document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
  };

  const card = (g: Garment) => (
    <ShopCard key={g.id} g={g} slug={slug}
      saved={wish.has(g.id)} onToggleSave={() => wish.toggle(g.id)} onAdd={() => cart.add(g, g.sizes[0] || "")} />
  );

  return (
    <div style={{ background: "var(--sage)", minHeight: "100vh" }}>
      {/* announce bar */}
      <div style={{ background: "var(--butter)", color: "var(--ink)", textAlign: "center", fontSize: 13, fontWeight: 500, padding: "9px 12px" }}>
        try it on before you buy · one photo, no account · order in a tap
      </div>

      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links garment-rail">
          {cats.slice(0, 4).map((c) => (
            <a key={c} href="#collection" onClick={() => { setSavedOnly(false); setFilter(c); }}>{c}</a>
          ))}
        </div>
        <div className="nav-logo">
          <div className="ph-display" style={{ fontSize: "clamp(17px, 4vw, 21px)", fontWeight: 600, color: "var(--ink)" }}>
            {shop.name || "The shop"}
          </div>
          {shop.area && (
            <div style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--stone)", marginTop: 2 }}>{shop.area}</div>
          )}
        </div>
        <div className="nav-tools">
          {wish.count > 0 && (
            <button className="ph-btn" onClick={openCollectionSaved} aria-label="Saved pieces" style={{ color: "var(--violet)", fontWeight: 600 }}>
              ♥ saved ({wish.count})
            </button>
          )}
          {contactWa && (
            <a href={contactWa} target="_blank" rel="noopener noreferrer" style={{ color: "var(--whatsapp)" }}>Contact</a>
          )}
          <AccountMenu />
          <button className="ph-btn" onClick={() => setCartOpen(true)} aria-label={`Bag, ${cart.count} item${cart.count !== 1 ? "s" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink)", fontWeight: 600 }}>
             bag
            {cart.count > 0 && (
              <span style={{ background: "var(--violet)", color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* hero */}
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="kicker">a little look before you buy</div>
          <h1 className="ph-display" style={{ fontSize: "clamp(32px, 4.6vw, 50px)", lineHeight: 1.12, color: "var(--ink)", margin: 0 }}>
            look first,<br />then buy
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 15.5, maxWidth: 360, lineHeight: 1.7, margin: 0 }}>
            Browse the collection, add your pieces to the bag, and order in one message — or take a photo and see anything on you first.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="#collection" className="btn-violet">shop the collection</a>
            <Link href={tryonHref} className="btn-outline">see it on you</Link>
          </div>
        </div>
        {featured[0] && (
          <Link href={`/s/${slug}/${encodeURIComponent(featured[0].id)}`} className="hero-visual" style={{ background: "var(--sage-mist)", display: "block" }}>
            <img src={featured[0].image} alt={featured[0].name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </Link>
        )}
      </div>

      {/* featured */}
      {featured.length > 0 && (
        <section className="section-pad">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(20px, 3vw, 26px)", color: "var(--ink)", margin: 0 }}>featured pieces</h2>
            <a className="linklike" href="#collection">view all →</a>
          </div>
          <div className="shop-grid">
            {featured.map(card)}
          </div>
        </section>
      )}

      {/* try-on promo */}
      <section className="section-pad" style={{ background: "var(--sage-mist)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
          <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
            <div className="kicker">the trial room, reinvented</div>
            <h3 className="ph-display" style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.22, color: "var(--ink)", margin: 0 }}>
              not sure? see it on you first
            </h3>
            <p style={{ color: "var(--stone)", fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
              No queue, no changing room. Take one photo, see the piece on you, then add it to your bag with a tap.
            </p>
            <div><Link href={tryonHref} className="btn-violet">see it on you</Link></div>
          </div>
          {featured[1] && (
            <Link href={`/s/${slug}/${encodeURIComponent(featured[1].id)}`} style={{ minHeight: 220, background: "var(--sage-mist)", display: "block" }}>
              <img src={featured[1].image} alt={featured[1].name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </Link>
          )}
        </div>
      </section>

      {/* full collection */}
      <section id="collection" className="section-pad">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(20px, 3vw, 26px)", color: "var(--ink)", margin: 0 }}>
            {savedOnly ? "saved pieces" : "the collection"}
          </h2>
          <span style={{ color: "var(--stone)", fontSize: 13 }}>{shown.length} piece{shown.length !== 1 ? "s" : ""}</span>
        </div>

        {/* search + sort */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection…"
            style={{ flex: "1 1 220px", padding: "11px 16px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--cream)", color: "var(--ink)", fontSize: 14 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
            style={{ padding: "11px 16px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--cream)", color: "var(--ink)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            <option value="featured">Sort: Featured</option>
            <option value="new">Newest first</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>

        {(cats.length > 1 || savedOnly) && (
          <div className="garment-rail" style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20 }}>
            <button className={"efc-chip " + (!savedOnly && filter === "All" ? "on" : "off")} onClick={() => { setSavedOnly(false); setFilter("All"); }}>All</button>
            {cats.map((c) => (
              <button key={c} className={"efc-chip " + (!savedOnly && filter === c ? "on" : "off")} onClick={() => { setSavedOnly(false); setFilter(c); }}>{c}</button>
            ))}
            {wish.count > 0 && (
              <button className={"efc-chip " + (savedOnly ? "on" : "off")} onClick={() => setSavedOnly(true)}>♥ Saved</button>
            )}
          </div>
        )}

        {shown.length === 0 ? (
          <div style={{ color: "var(--mut)", padding: 50, textAlign: "center" }}>
            {savedOnly
              ? "No saved pieces yet — tap the heart on anything you like."
              : q
                ? `Nothing matches "${query}".`
                : `Nothing listed${filter !== "All" ? " in this category" : ""} right now — check back soon.`}
          </div>
        ) : (
          <div className="shop-grid">
            {shown.map(card)}
          </div>
        )}
      </section>

      {/* footer */}
      <footer className="section-pad" style={{ background: "var(--ink)", color: "var(--paper)", paddingBottom: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28, maxWidth: 900, margin: "0 auto" }}>
          <div>
            <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--paper)", fontWeight: 600 }}>
              {shop.name || "The shop"}
            </h4>
            {shop.area && <p style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, margin: 0 }}>{shop.area}</p>}
            {shop.lat != null && shop.lng != null && (
              <a href={osmViewUrl(shop.lat, shop.lng)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, display: "inline-block", textUnderlineOffset: 3 }}>
                find us on the map ↗
              </a>
            )}
          </div>
          <div>
            <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--paper)", fontWeight: 600 }}>shop</h4>
            <a href="#collection" style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }}>browse the collection</a>
            <Link href={tryonHref} style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }}>see it on you</Link>
            <button className="ph-btn" onClick={() => setCartOpen(true)} style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, display: "block" }}>your bag ({cart.count})</button>
          </div>
          {askWa && (
            <div>
              <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--paper)", fontWeight: 600 }}>order &amp; ask</h4>
              <p style={{ fontSize: 13, color: "rgba(250,246,240,.65)", margin: "0 0 12px" }}>Fastest reply on WhatsApp:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={ask} maxLength={200} onChange={(e) => setAsk(e.target.value)} placeholder="What are you looking for?"
                  style={{ flex: 1, padding: "11px 15px", borderRadius: 999, border: "1px solid rgba(250,246,240,.25)", background: "rgba(255,255,255,.06)", color: "var(--paper)", fontSize: 13 }} />
                <a href={askWa} target="_blank" rel="noopener noreferrer" className="ph-btn"
                  style={{ background: "var(--whatsapp)", color: "#fff", padding: "11px 20px", fontSize: 13, fontWeight: 600, borderRadius: 999, textDecoration: "none", display: "flex", alignItems: "center" }}>
                  send
                </a>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(250,246,240,.45)", marginTop: 34 }}>
          powered by <b className="wordmark" style={{ color: "var(--butter)", fontSize: 13 }}>peeq</b> · a little look before you buy
          {" · "}
          <Link href="/privacy" style={{ color: "rgba(250,246,240,.55)", textUnderlineOffset: 3 }}>privacy</Link>
        </div>
      </footer>

      {cartOpen && (
        <CartDrawer shop={shop} cart={cart} catalog={catalog}
          defaultName={contact.name} defaultPhone={contact.phone} loggedIn={!!user && configured}
          onClose={() => setCartOpen(false)} onKeepShopping={() => setCartOpen(false)} />
      )}
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

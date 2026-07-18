"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { npr, waLink } from "@/lib/constants";
import { useCart, useWishlist } from "@/lib/cart";
import { useAccount, getContact } from "@/lib/account";
import { ShopCard, CartDrawer, HeartButton } from "@/components/storefront";
import type { Garment, Shop } from "@/lib/types";

/* Product page — a real, linkable, shareable URL per garment
   (/s/[slug]/[garment]). Pick a size, choose quantity, add to the bag, or see
   it on you first. Replaces the old quick-view modal. */

export default function ProductClient() {
  const params = useParams<{ slug: string; garment: string }>();
  const slug = params.slug;
  const garmentId = decodeURIComponent(params.garment);

  const [shop, setShop] = useState<Shop | null>(null);
  const [catalog, setCatalog] = useState<Garment[] | null>(null);
  const [notFound, setNotFound] = useState(false);
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

  const garment = useMemo(
    () => (catalog ? catalog.find((g) => g.id === garmentId) ?? null : null),
    [catalog, garmentId]
  );

  // shareable title
  useEffect(() => {
    if (garment && shop) document.title = `${garment.name} — ${shop.name || "peeq"}`;
  }, [garment, shop]);

  if (notFound || (catalog && !garment)) {
    return (
      <Centered>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)" }}>piece not found</div>
        <p style={{ color: "var(--stone)", maxWidth: 380 }}>This item may have sold out or the link is out of date.</p>
        <Link href={"/s/" + slug} className="btn-violet" style={{ marginTop: 6 }}>back to the shop</Link>
      </Centered>
    );
  }
  if (!shop || catalog === null || !garment) {
    return (
      <Centered>
        <span className="ee-mark ee-looking" style={{ fontSize: 44, color: "var(--violet)" }}><span>ee</span></span>
        <span style={{ color: "var(--stone)" }}>taking a peeq…</span>
      </Centered>
    );
  }

  const related = catalog
    .filter((g) => g.id !== garment.id && g.inStock)
    .sort((a, b) => Number(b.category === garment.category) - Number(a.category === garment.category))
    .slice(0, 4);

  return (
    <div style={{ background: "var(--sage)", minHeight: "100vh" }}>
      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links garment-rail">
          <Link href={"/s/" + slug} style={{ color: "inherit" }}>← {shop.name || "the shop"}</Link>
        </div>
        <div className="nav-logo">
          <Link href={"/s/" + slug} className="ph-display" style={{ fontSize: "clamp(17px, 4vw, 21px)", fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
            {shop.name || "The shop"}
          </Link>
        </div>
        <div className="nav-tools">
          {configured && (
            <Link href="/account" style={{ color: "var(--ink)" }}>{user ? "account" : "sign in"}</Link>
          )}
          <button className="ph-btn" onClick={() => setCartOpen(true)} aria-label={`Bag, ${cart.count} items`}
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

      {/* breadcrumb */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "16px min(32px, 5vw) 0", fontSize: 12.5, color: "var(--stone)" }}>
        <Link href={"/s/" + slug} style={{ color: "var(--stone)", textUnderlineOffset: 3 }}>collection</Link>
        <span> / {garment.category} / </span>
        <span style={{ color: "var(--ink)" }}>{garment.name}</span>
      </div>

      {/* product */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px min(32px, 5vw) 10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32, alignItems: "start" }}>
        <div style={{ position: "relative", aspectRatio: "3/4", background: "var(--sage-mist)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)" }}>
          <img src={garment.image} alt={garment.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: garment.inStock ? "none" : "grayscale(.7)" }} />
          <HeartButton saved={wish.has(garment.id)} onClick={() => wish.toggle(garment.id)} />
          {!garment.inStock && (
            <span style={{ position: "absolute", bottom: 12, left: 12, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 500, padding: "5px 14px", borderRadius: 999 }}>
              out of stock
            </span>
          )}
        </div>

        <BuyPanel
          garment={garment} slug={slug} shop={shop}
          onAdd={(size, qty) => { cart.add(garment, size, qty); setCartOpen(true); }}
        />
      </div>

      {/* more from this shop */}
      {related.length > 0 && (
        <section className="section-pad" style={{ maxWidth: 1040, margin: "0 auto" }}>
          <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(19px, 3vw, 24px)", color: "var(--ink)", margin: "0 0 20px" }}>
            more from {shop.name || "this shop"}
          </h2>
          <div className="shop-grid">
            {related.map((g) => (
              <ShopCard key={g.id} g={g} slug={slug}
                saved={wish.has(g.id)} onToggleSave={() => wish.toggle(g.id)} onAdd={() => cart.add(g, g.sizes[0] || "")} />
            ))}
          </div>
        </section>
      )}

      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.45)", textAlign: "center", fontSize: 12.5, padding: "26px 16px" }}>
        powered by <b className="wordmark" style={{ color: "var(--paper)", fontSize: 13 }}>p<span className="ee">ee</span>q</b> · a little look before you buy
        {" · "}
        <Link href="/privacy" style={{ color: "rgba(250,246,240,.55)", textUnderlineOffset: 3 }}>privacy</Link>
      </footer>

      {cartOpen && (
        <CartDrawer shop={shop} cart={cart} catalog={catalog}
          defaultName={contact.name} defaultPhone={contact.phone} loggedIn={!!user && configured}
          onClose={() => setCartOpen(false)} onKeepShopping={() => setCartOpen(false)} />
      )}
    </div>
  );
}

function BuyPanel({ garment, slug, shop, onAdd }: {
  garment: Garment; slug: string; shop: Shop; onAdd: (size: string, qty: number) => void;
}) {
  const hasSizes = garment.sizes.length > 0;
  const [size, setSize] = useState(garment.sizes.length === 1 ? garment.sizes[0] : "");
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState(false);

  const add = () => {
    if (hasSizes && !size) { setErr(true); return; }
    onAdd(size, qty);
  };

  const wa = waLink(
    shop.whatsapp,
    `Namaste! I saw "${garment.name}" (${npr(garment.price)}) on ${shop.name || "your"} peeq storefront and I'm interested.`
  );

  return (
    <div>
      <h1 className="ph-display" style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, color: "var(--ink)", margin: "0 0 6px", lineHeight: 1.15 }}>
        {garment.name}
      </h1>
      <div style={{ fontSize: 20, color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}>{npr(garment.price)}</div>
      <div style={{ color: "var(--stone)", fontSize: 13.5 }}>
        {garment.category}
        {garment.stitchedToOrder && <> · stitched to order</>}
        {!garment.inStock && <span style={{ color: "var(--forest)", fontWeight: 600 }}> · out of stock</span>}
      </div>

      {garment.inStock && (
        <>
          {hasSizes && (
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--stone)", marginBottom: 9 }}>
                Size {err && <span style={{ color: "#C0554D" }}>· please pick one</span>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {garment.sizes.map((s) => (
                  <button key={s} className="ph-btn" onClick={() => { setSize(s); setErr(false); }}
                    style={{
                      minWidth: 50, padding: "11px 16px", fontSize: 14, fontWeight: 600, borderRadius: 12,
                      background: size === s ? "var(--violet)" : "var(--cream)",
                      color: size === s ? "#fff" : "var(--ink)",
                      border: "1.5px solid " + (size === s ? "var(--violet)" : "var(--line)"),
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--stone)" }}>Quantity</span>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden", background: "var(--cream)" }}>
              <button className="ph-btn" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Decrease quantity" style={{ width: 42, height: 42, fontSize: 19, color: "var(--ink)" }}>−</button>
              <span style={{ minWidth: 30, textAlign: "center", fontWeight: 600 }}>{qty}</span>
              <button className="ph-btn" onClick={() => setQty((n) => Math.min(20, n + 1))} aria-label="Increase quantity" style={{ width: 42, height: 42, fontSize: 19, color: "var(--ink)" }}>+</button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 26, maxWidth: 420 }}>
        {garment.inStock && (
          <button className="ph-btn btn-violet" onClick={add} style={{ width: "100%" }}>
            add to bag · {npr(garment.price * qty)}
          </button>
        )}
        {garment.inStock && (
          <Link href={`/k/${slug}?g=${encodeURIComponent(garment.id)}`} className="btn-outline" style={{ width: "100%" }}>
            see it on you first
          </Link>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa" style={{ width: "100%" }}>
            ask on WhatsApp
          </a>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 18, lineHeight: 1.6, maxWidth: 420 }}>
        No online payment — add pieces to your bag and the shop confirms price, payment and delivery with you directly.
      </p>
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

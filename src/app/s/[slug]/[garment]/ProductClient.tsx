"use client";

import { useState, useEffect, useId, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { npr, waLink } from "@/lib/constants";
import { useCart, useWishlist } from "@/lib/cart";
import { useAccount, getContact } from "@/lib/account";
import AccountMenu from "@/components/AccountMenu";
import { ShopCard, CartDrawer, HeartButton } from "@/components/storefront";
import GarmentImage from "@/components/GarmentImage";
import TryOnCta, { type TryOnState } from "@/components/TryOnCta";
import Icon from "@/components/Icon";
import type { Garment, Shop } from "@/lib/types";

/* Product page — a real, linkable, shareable URL per garment
   (/s/[slug]/[garment]). Pick a size, choose quantity, add to the bag, or see
   it on you first. Replaces the old quick-view modal. */

export default function ProductClient({
  initialShop = null,
  initialCatalog = null,
  tryOn = { enabled: true, left: 1 },
}: {
  initialShop?: Shop | null;
  initialCatalog?: Garment[] | null;
  tryOn?: TryOnState;
}) {
  const params = useParams<{ slug: string; garment: string }>();
  const router = useRouter();
  const slug = params.slug;
  const garmentId = decodeURIComponent(params.garment);

  // Supabase mode ships shop + catalog in the HTML; local mode self-fetches.
  const [shop, setShop] = useState<Shop | null>(initialShop);
  const [catalog, setCatalog] = useState<Garment[] | null>(initialCatalog);
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
    if (initialShop && initialCatalog) return; // server already rendered it
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) { setNotFound(true); return; }
      setShop(s);
      setCatalog(await loadCatalog(s.id));
    })();
  }, [slug, initialShop, initialCatalog]);

  const garment = useMemo(
    () => (catalog ? catalog.find((g) => g.id === garmentId) ?? null : null),
    [catalog, garmentId]
  );

  /* No document.title here. generateMetadata in page.tsx already sets the
     real, per-garment title server-side — this effect ran after paint, so the
     tab flashed the layout default and then swapped, and any crawler that
     doesn't execute JS only ever saw the default. */

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

  const contactWa = waLink(shop.whatsapp, `Namaste! I have a question about ${shop.name || "your shop"}. (via peeq)`);

  const related = catalog
    .filter((g) => g.id !== garment.id && g.inStock)
    .sort((a, b) => Number(b.category === garment.category) - Number(a.category === garment.category))
    .slice(0, 4);

  return (
    <div style={{ background: "var(--paper)", minHeight: "100dvh" }}>
      {/* Same announce bar and same nav tools as the collection page. They had
          diverged: a plain "account" link instead of the AccountMenu, no
          wishlist, no Contact, no announce bar — so walking between the two
          pages shifted the entire top of the site. */}
      <div style={{ background: "var(--butter)", color: "var(--on-light)", textAlign: "center", fontSize: 13, fontWeight: 500, padding: "9px 12px" }}>
        try it on before you buy · one photo, account optional · order in a tap
      </div>

      <nav className="efc-nav">
        <div className="nav-links garment-rail">
          <Link href={"/s/" + slug} style={{ color: "inherit" }}>← {shop.name || "the shop"}</Link>
        </div>
        <div className="nav-logo">
          <Link href={"/s/" + slug} className="ph-display" style={{ fontSize: "clamp(17px, 4vw, 21px)", fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
            {shop.name || "The shop"}
          </Link>
          {shop.area && (
            <div style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--stone)", marginTop: 2 }}>{shop.area}</div>
          )}
        </div>
        <div className="nav-tools">
          <Link href={"/s/" + slug} className="ph-btn" aria-label={wish.count === 0 ? "Saved pieces — nothing saved yet" : `Saved pieces (${wish.count})`}
            style={{ color: wish.count > 0 ? "var(--violet)" : "var(--stone)", fontWeight: 600, opacity: wish.count > 0 ? 1 : 0.55, textDecoration: "none" }}>
            <Icon name={wish.count > 0 ? "heart-filled" : "heart"} /> saved{wish.count > 0 ? ` (${wish.count})` : ""}
          </Link>
          {contactWa && (
            <a href={contactWa} target="_blank" rel="noopener noreferrer" style={{ color: "var(--whatsapp)" }}>Contact</a>
          )}
          <AccountMenu />
          {/* "Bag, 1 items". The collection page next door pluralises. */}
          <button className="ph-btn" onClick={() => setCartOpen(true)} aria-label={`Bag, ${cart.count} item${cart.count !== 1 ? "s" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink)", fontWeight: 600 }}>
            <Icon name="bag" /> bag
            {cart.count > 0 && (
              <span style={{ background: "var(--violet)", color: "var(--on-accent)", fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, borderRadius: "var(--radius-pill)", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* breadcrumb */}
      <div id="main" style={{ maxWidth: 1040, margin: "0 auto", padding: "16px min(32px, 5vw) 0", fontSize: 12.5, color: "var(--stone)" }}>
        <Link href={"/s/" + slug} style={{ color: "var(--stone)", textUnderlineOffset: 3 }}>collection</Link>
        {/* the middle crumb was the only one that wasn't a link, which is the
            one place a breadcrumb is actually used to go somewhere */}
        <span> / </span>
        <Link href={`/s/${slug}#collection`} style={{ color: "var(--stone)", textUnderlineOffset: 3 }}>{garment.category}</Link>
        <span> / </span>
        <span style={{ color: "var(--ink)" }} aria-current="page">{garment.name}</span>
      </div>

      {/* product */}
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px min(32px, 5vw) 10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32, alignItems: "start" }}>
        {/* Capped, not stretched. The grid cell is ~500px wide on a desktop
            and 3:4 turns that into ~670px of height — taller than the fold,
            so the buy panel beside it got pushed off screen. */}
        <div style={{ position: "relative", aspectRatio: "3/4", width: "100%", maxWidth: 380, maxHeight: "min(64vh, 520px)", background: "var(--paper-deep)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)" }}>
          {/* The largest image on the site was the one raw <img> left, while
              every thumbnail around it went through GarmentImage — so the hero
              was the one photo Next never optimised, sized or lazy-rated. */}
          <GarmentImage src={garment.image} alt={garment.name} grayscale={!garment.inStock} priority />
          <HeartButton saved={wish.has(garment.id)} onClick={() => wish.toggle(garment.id)} />
          {!garment.inStock && (
            <span style={{ position: "absolute", bottom: 12, left: 12, background: "var(--ink)", color: "var(--paper)", fontSize: 12.5, fontWeight: 600, padding: "5px 14px", borderRadius: "var(--radius-pill)" }}>
              out of stock
            </span>
          )}
        </div>

        <BuyPanel
          garment={garment} slug={slug} shop={shop} tryOn={tryOn}
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
              /* shop + tryOn passed through. Without them ShopCard defaults to
                 {type:"apparel", enabled:true}, so a general shop — or one that
                 has run out of try-ons — hid the CTA at the top of the page and
                 then offered "see it on you" on four cards underneath it. */
              <ShopCard key={g.id} g={g} slug={slug} shop={shop} tryOn={tryOn}
                saved={wish.has(g.id)} onToggleSave={() => wish.toggle(g.id)} onAdd={() => cart.add(g, g.sizes[0] || "")} />
            ))}
          </div>
        </section>
      )}

      <footer style={{ background: "var(--slab)", color: "var(--on-slab-quiet)", textAlign: "center", fontSize: 12.5, padding: "26px 16px" }}>
        powered by <b className="wordmark" style={{ color: "var(--on-slab)", fontSize: 13 }}>p<span className="ee">ee</span>q</b> · a little look before you buy
        {" · "}
        <Link href="/privacy" style={{ color: "rgba(250,246,240,.55)", textUnderlineOffset: 3 }}>privacy</Link>
      </footer>

      {cartOpen && (
        <CartDrawer shop={shop} cart={cart} catalog={catalog}
          defaultName={contact.name} defaultPhone={contact.phone} loggedIn={!!user && configured}
          onClose={() => setCartOpen(false)}
          onKeepShopping={() => { setCartOpen(false); router.push(`/s/${slug}#collection`); }} />
      )}
    </div>
  );
}

function BuyPanel({ garment, slug, shop, tryOn, onAdd }: {
  garment: Garment; slug: string; shop: Shop; tryOn: TryOnState;
  onAdd: (size: string, qty: number) => void;
}) {
  const hasSizes = garment.sizes.length > 0;
  const [size, setSize] = useState(garment.sizes.length === 1 ? garment.sizes[0] : "");
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState(false);
  const sizeLabelId = useId();

  const add = () => {
    if (hasSizes && !size) { setErr(true); return; }
    onAdd(size, qty);
  };

  const wa = waLink(
    shop.whatsapp,
    garment.inStock
      ? `Namaste! I saw "${garment.name}" (${npr(garment.price)}) on ${shop.name || "your"} peeq storefront and I'm interested.`
      : `Namaste! "${garment.name}" (${npr(garment.price)}) is out of stock on your peeq storefront — can you get it in or stitch it to order?`
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
        {/* This was `var(--forest)`, a legacy alias of --ink, so "out of
            stock" rendered in exactly the same colour as the category text
            beside it. --warn is the token for "attention, not failure". */}
        {!garment.inStock && <span style={{ color: "var(--warn)", fontWeight: 700 }}> · out of stock</span>}
      </div>

      {garment.inStock && (
        <>
          {/* A radiogroup, so a screen reader announces "Size, M, 2 of 4,
              selected" instead of four unrelated buttons — and the "please
              pick one" error is in role="alert", so it is actually heard. */}
          {hasSizes && (
            <div style={{ marginTop: 22 }}>
              <div id={sizeLabelId} style={{ fontSize: 13, fontWeight: 600, color: "var(--stone)", marginBottom: 9 }}>
                Size {err && <span role="alert" style={{ color: "var(--danger)" }}>· please pick one</span>}
              </div>
              <div role="radiogroup" aria-labelledby={sizeLabelId} aria-required
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {garment.sizes.map((s) => (
                  <button key={s} className="ph-btn" role="radio" aria-checked={size === s}
                    onClick={() => { setSize(s); setErr(false); }}
                    style={{
                      minWidth: 44, minHeight: 44, padding: "9px 14px", fontSize: 13.5, fontWeight: 600,
                      borderRadius: "var(--radius-md)",
                      background: size === s ? "var(--violet)" : "var(--card)",
                      color: size === s ? "var(--on-accent)" : "var(--ink)",
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
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", overflow: "hidden", background: "var(--card)" }}>
              <button className="ph-btn" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Decrease quantity" style={{ width: 40, height: 40, fontSize: 18, color: "var(--ink)" }}>−</button>
              <span aria-live="polite" style={{ minWidth: 30, textAlign: "center", fontWeight: 600 }}>{qty}</span>
              <button className="ph-btn" onClick={() => setQty((n) => Math.min(20, n + 1))} aria-label="Increase quantity" style={{ width: 40, height: 40, fontSize: 18, color: "var(--ink)" }}>+</button>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 24, maxWidth: 330 }}>
        {garment.inStock ? (
          <button className="ph-btn btn-violet" onClick={add} style={{ width: "100%", padding: "11px 20px", fontSize: 14.5 }}>
            <Icon name="bag" /> add to bag · {npr(garment.price * qty)}
          </button>
        ) : (
          /* Out of stock used to hide sizes, quantity, add-to-bag AND try-on,
             leaving a near-empty page with one WhatsApp button and nothing to
             do. A sold-out piece is still a piece someone wants: they can
             still see it on themselves, and they can still ask the shop to
             get it in. */
          <div style={{ background: "var(--warn-bg)", border: "1px solid var(--warn)", borderRadius: "var(--radius-card)", padding: "12px 15px", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6 }}>
            <b style={{ color: "var(--warn)" }}>Out of stock right now.</b> Ask the shop below —
            they can often get it in or stitch it to order.
          </div>
        )}
        {/* try-on survives being sold out: seeing it on you is exactly how a
            shopper decides whether it's worth asking for */}
        <TryOnCta shop={shop} state={tryOn} href={`/k/${slug}?g=${encodeURIComponent(garment.id)}`}
          className="btn-outline" style={{ width: "100%", textAlign: "center", padding: "9px 20px", fontSize: 14.5 }}>
          see it on you {garment.inStock ? "first" : "anyway"}
        </TryOnCta>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa" style={{ width: "100%", padding: "11px 20px", fontSize: 14 }}>
            {garment.inStock ? "ask on WhatsApp" : "ask them to get it in"}
          </a>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--stone)", marginTop: 16, lineHeight: 1.6, maxWidth: 330 }}>
        No online payment. Add pieces to your bag and the shop confirms price, payment and delivery with you directly.
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "var(--paper)" }}>
      {children}
    </div>
  );
}

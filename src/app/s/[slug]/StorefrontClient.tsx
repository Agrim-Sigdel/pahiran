"use client";

import { Fragment, useState, useEffect, useId, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getShopBySlug, loadCatalog } from "@/lib/storage";
import { waLink, STOREFRONT_DEFAULTS } from "@/lib/constants";
import { storefrontLook } from "@/lib/storefront-theme";
import { storefrontFontVars } from "@/lib/storefront-fonts";
import { osmViewUrl } from "@/lib/osm";
import { useCart, useWishlist } from "@/lib/cart";
import { useAccount, getContact } from "@/lib/account";
import AccountMenu from "@/components/AccountMenu";
import {
  ShopCard, CartDrawer,
  AnnounceBar, HeroSection, FeaturedSection, PromoSection,
  resolveStorefrontSlots, defaultHeroBody, type SectionLayout,
} from "@/components/storefront";
import TryOnCta, { offersTryOn, type TryOnState } from "@/components/TryOnCta";
import Icon from "@/components/Icon";
import type { Garment, Shop, StorefrontSectionId } from "@/lib/types";

/* Public storefront — a traditional shopping experience: browse, save, pick a
   size, add to a bag, and check out as one itemised order. Every piece links
   to its own product page (/s/[slug]/[garment]); the AI try-on ("see it on
   you") rides along as a secondary action. */

/* "featured" is gone. It and "new" both fell through to `() => 0`, so the
   collection had two sort options producing byte-identical grids and no way
   for a shopper to tell — and there is no ranking signal on this page that
   would make "featured" mean anything real. Three options that each do
   something beats four where two are decoration. */
type Sort = "new" | "price-asc" | "price-desc";

export default function StorefrontClient({
  initialShop = null,
  initialCatalog = null,
  tryOn = { enabled: true, left: 1 },
}: {
  initialShop?: Shop | null;
  initialCatalog?: Garment[] | null;
  tryOn?: TryOnState;
}) {
  const { slug } = useParams<{ slug: string }>();
  // Supabase mode hands us the shop + catalog from the server, already in the
  // HTML. Local mode has no server data, so we fall back to fetching on mount.
  const [shop, setShop] = useState<Shop | null>(initialShop);
  const [catalog, setCatalog] = useState<Garment[] | null>(initialCatalog);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("new");
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
    if (initialShop && initialCatalog) return; // server already rendered it
    (async () => {
      const s = await getShopBySlug(slug);
      if (!s) { setNotFound(true); return; }
      setShop(s);
      setCatalog(await loadCatalog(s.id));
    })();
  }, [slug, initialShop, initialCatalog]);

  const cats = useMemo(
    () => (catalog ? Array.from(new Set(catalog.map((g) => g.category))) : []),
    [catalog]
  );


  if (notFound) {
    return (
      <Centered>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)" }}>shop not found</div>
        <p style={{ color: "var(--stone)", maxWidth: 380 }}>This link doesn't match any shop on peeq.</p>
        {/* was a dead end with no nav and no link home */}
        <Link href="/" className="ph-btn btn-violet">browse shops on peeq</Link>
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
  /* The vendor's page description: which words, which pictures where, which
     sections in which order. Always complete (see normalizeStorefront) — a
     null field means "the default", so a shop that never opened the editor
     renders exactly the page this file always rendered. */
  const cfg = shop.storefront;
  const slots = resolveStorefrontSlots(cfg, catalog, slug);
  /* The shop's look: the preset classes it wears, plus the derived light/dark
     pairs for any colour it picked off the wheel. Both are computed from the
     config alone, so this is settled in the server-rendered HTML rather than
     painted on after hydration. */
  const look = storefrontLook(cfg);
  const layout = (cfg.layout ?? "boutique") as SectionLayout;

  // collection pipeline: category / saved → search → sort
  let shown = savedOnly ? catalog.filter((g) => wish.has(g.id)) : (filter === "All" ? catalog : catalog.filter((g) => g.category === filter));
  const q = query.trim().toLowerCase();
  if (q) shown = shown.filter((g) => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
  /* Catalog arrives newest-first, so "newest" IS the natural order. That is
     exactly why "Featured" and "Newest first" both used to fall through to
     `() => 0` and produce identical grids — two options, one behaviour, and
     no way for a shopper to tell. Featured now means something: the pieces
     shoppers have actually been trying on, most-tried first, which is the
     only ranking signal this page has. */
  const bySort =
    sort === "price-asc" ? (a: Garment, b: Garment) => a.price - b.price
    : sort === "price-desc" ? (a: Garment, b: Garment) => b.price - a.price
    : () => 0;
  shown = [...shown].sort((a, b) => Number(b.inStock) - Number(a.inStock) || bySort(a, b));

  const askWa = shop.whatsapp
    ? waLink(shop.whatsapp, ask.trim() ? `Namaste! ${ask.trim()} (via ${shop.name || "your"} peeq storefront)` : `Namaste! I have a question about your collection.`)
    : null;
  const contactWa = waLink(shop.whatsapp, `Namaste! I have a question about ${shop.name || "your shop"}. (via peeq)`);

  const searchId = useId();
  const sortId = useId();
  const askId = useId();

  const openCollectionSaved = () => {
    setSavedOnly(true);
    setFilter("All");
    document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
  };

  // first row is above the fold on most screens — let it load eagerly
  const card = (g: Garment, i: number) => (
    <ShopCard key={g.id} g={g} slug={slug} priority={i < 2} shop={shop} tryOn={tryOn}
      saved={wish.has(g.id)} onToggleSave={() => wish.toggle(g.id)} onAdd={() => cart.add(g, g.sizes[0] || "")} />
  );

  /* The sections, in the vendor's order, hidden ones dropped. Every text is
     the vendor's words or the default — never both, never neither. */
  const visibleSections = cfg.sections.filter((s) => !s.hidden);
  const announceFirst = visibleSections[0]?.id === "announce";
  const bodySections = announceFirst ? visibleSections.slice(1) : visibleSections;

  const sectionFor = (id: StorefrontSectionId): React.ReactNode => {
    switch (id) {
      case "announce":
        return <AnnounceBar text={cfg.announceText ?? STOREFRONT_DEFAULTS.announceText} />;
      case "hero":
        return (
          <HeroSection shop={shop}
            kicker={cfg.hero.kicker ?? STOREFRONT_DEFAULTS.heroKicker}
            headline={cfg.hero.headline ?? STOREFRONT_DEFAULTS.heroHeadline}
            body={cfg.hero.body ?? defaultHeroBody(shop)}
            slides={slots.heroSlides} tryOn={tryOn} tryonHref={tryonHref} layout={layout} />
        );
      case "featured":
        return slots.featured.length > 0 ? (
          <FeaturedSection heading={cfg.featured.heading ?? STOREFRONT_DEFAULTS.featuredHeading} layout={layout}>
            {slots.featured.map(card)}
          </FeaturedSection>
        ) : null;
      case "promo":
        /* the whole section is about a feature a general shop doesn't have,
           so it goes rather than greys out — whatever the config says */
        return offersTryOn(shop) ? (
          <PromoSection shop={shop}
            kicker={cfg.promo.kicker ?? STOREFRONT_DEFAULTS.promoKicker}
            heading={cfg.promo.heading ?? STOREFRONT_DEFAULTS.promoHeading}
            body={cfg.promo.body ?? STOREFRONT_DEFAULTS.promoBody}
            promo={slots.promo} tryOn={tryOn} tryonHref={tryonHref} layout={layout} />
        ) : null;
      case "collection":
        return (
          <section id="collection" className="section-pad">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(20px, 3vw, 26px)", color: "var(--ink)", margin: 0 }}>
                {savedOnly ? "saved pieces" : "the collection"}
              </h2>
              {/* aria-live, so a shopper filtering with a screen reader hears the
                  result count change instead of typing into silence */}
              <span aria-live="polite" style={{ color: "var(--stone)", fontSize: 13 }}>{shown.length} piece{shown.length !== 1 ? "s" : ""}</span>
            </div>

            {/* search + sort */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: "1 1 220px", position: "relative", display: "flex" }}>
                <label htmlFor={searchId} className="sr-only">Search the collection</label>
                <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the collection…"
                  style={{ flex: 1, padding: "11px 16px", paddingRight: query ? 40 : 16, borderRadius: "var(--radius-pill)", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 14 }} />
                {query && (
                  <button className="ph-btn" onClick={() => setQuery("")} aria-label="Clear the search"
                    style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: 8, color: "var(--stone)", fontSize: 14 }}>
                    <Icon name="close" />
                  </button>
                )}
              </div>
              {/* No "Sort:" prefix on one option and not on the others — it read
                  as a heading above a list of three rather than one of four. */}
              <label htmlFor={sortId} className="sr-only">Sort the collection</label>
              <select id={sortId} value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                className="ph-select"
                style={{ padding: "11px 16px", borderRadius: "var(--radius-pill)", border: "1px solid var(--line)", backgroundColor: "var(--card)", color: "var(--ink)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
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
                  <button className={"efc-chip " + (savedOnly ? "on" : "off")} onClick={() => setSavedOnly(true)}><Icon name="heart-filled" /> Saved</button>
                )}
              </div>
            )}

            {shown.length === 0 ? (
              <div style={{ color: "var(--stone)", padding: 50, textAlign: "center" }}>
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
        );
    }
  };

  return (
    /* The look classes and the picked-colour variables sit on the same element
       the page's background comes from, so every token they re-point — the
       accent, the paper ramp, the radii, the heading face — is already in
       scope for everything below, nav and footer included. The font variables
       ride along because .sf-font-* names them; on a shop that never chose a
       face they are simply unused. */
    <div className={[look.className, storefrontFontVars].filter(Boolean).join(" ")}
      style={{ ...look.style, background: "var(--paper)", minHeight: "100dvh" }}>
      {/* The announce bar belongs above the nav when it leads the order —
          which is the default, and the strip this page always opened with.
          Moved down the order, it renders in place like any other section. */}
      {announceFirst && sectionFor("announce")}

      {/* nav */}
      <nav className="efc-nav">
        {/* These set filter state, so they are buttons that scroll — not <a>s
            pretending the hash is the whole story. They carry the same active
            state as the chips further down doing the identical job, which they
            previously did not. */}
        <div className="nav-links garment-rail">
          {cats.slice(0, 4).map((c) => {
            const on = !savedOnly && filter === c;
            return (
              <button key={c} className="ph-btn" aria-pressed={on}
                onClick={() => { setSavedOnly(false); setFilter(c); document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ color: on ? "var(--violet)" : "inherit", fontWeight: on ? 700 : 500, fontSize: 14, padding: "2px 0", whiteSpace: "nowrap", textDecoration: on ? "underline" : "none", textUnderlineOffset: 5 }}>
                {c}
              </button>
            );
          })}
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
          {/* Always rendered, disabled until there is something in it. It used
              to appear the instant you hearted your first piece, which shoved
              the whole nav sideways under the shopper's thumb. */}
          <button className="ph-btn" onClick={openCollectionSaved} disabled={wish.count === 0}
            aria-label={wish.count === 0 ? "Saved pieces — nothing saved yet" : `Saved pieces (${wish.count})`}
            style={{ color: wish.count > 0 ? "var(--violet)" : "var(--stone)", fontWeight: 600, opacity: wish.count > 0 ? 1 : 0.55, cursor: wish.count > 0 ? "pointer" : "default" }}>
            <Icon name={wish.count > 0 ? "heart-filled" : "heart"} /> saved{wish.count > 0 ? ` (${wish.count})` : ""}
          </button>
          {contactWa && (
            <a href={contactWa} target="_blank" rel="noopener noreferrer" style={{ color: "var(--whatsapp)" }}>Contact</a>
          )}
          <AccountMenu />
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

      {/* The skip-link's target: everything below the nav, in whatever order
          the vendor put it. The hero markup (and the fallback stock shot for
          a shop with nothing to show) lives in HeroSection — see
          storefront.tsx, where the editor's live preview reads it too. */}
      <div id="main">
        {bodySections.map((s) => (
          <Fragment key={s.id}>{sectionFor(s.id)}</Fragment>
        ))}
      </div>

      {/* footer */}
      <footer className="section-pad" style={{ background: "var(--slab)", color: "var(--on-slab)", paddingBottom: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28, maxWidth: 900, margin: "0 auto" }}>
          <div>
            <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--on-slab)", fontWeight: 600 }}>
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
            <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--on-slab)", fontWeight: 600 }}>shop</h4>
            <a href="#collection" style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }}>browse the collection</a>
            <TryOnCta shop={shop} state={tryOn} href={tryonHref}
              style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, textDecoration: "none", display: "block" }} />
            <button className="ph-btn" onClick={() => setCartOpen(true)} style={{ fontSize: 13, color: "rgba(250,246,240,.65)", lineHeight: 1.8, display: "block" }}>your bag ({cart.count})</button>
          </div>
          {askWa && (
            <div>
              <h4 className="ph-display" style={{ fontSize: 19, marginBottom: 12, color: "var(--on-slab)", fontWeight: 600 }}>order &amp; ask</h4>
              <p style={{ fontSize: 13, color: "rgba(250,246,240,.65)", margin: "0 0 12px" }}>Fastest reply on WhatsApp:</p>
              <div style={{ display: "flex", gap: 8 }}>
              {/* --on-slab, not --paper. --paper is #1E1310 in dark mode and
                  --slab is #4A2A20, so the typed question was ~1.5:1 — the
                  exact trap the token comments in globals.css warn about in
                  prose: anything ON the slab takes --on-slab, which is light
                  in both themes. */}
              <label htmlFor={askId} className="sr-only">What are you looking for?</label>
                <input id={askId} value={ask} maxLength={200} onChange={(e) => setAsk(e.target.value)} placeholder="What are you looking for?"
                  style={{ flex: 1, padding: "11px 15px", borderRadius: "var(--radius-pill)", border: "1px solid rgba(250,246,240,.25)", background: "rgba(255,255,255,.06)", color: "var(--on-slab)", fontSize: 13 }} />
                <a href={askWa} target="_blank" rel="noopener noreferrer" className="ph-btn"
                  style={{ background: "var(--whatsapp)", color: "#fff", padding: "11px 20px", fontSize: 13, fontWeight: 600, borderRadius: "var(--radius-pill)", textDecoration: "none", display: "flex", alignItems: "center" }}>
                  send
                </a>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(250,246,240,.45)", marginTop: 34 }}>
          powered by <b className="wordmark" style={{ color: "var(--on-slab)", fontSize: 13 }}>p<span className="ee">ee</span>q</b> · a little look before you buy
          {" · "}
          <Link href="/privacy" style={{ color: "rgba(250,246,240,.55)", textUnderlineOffset: 3 }}>privacy</Link>
        </div>
      </footer>

      {cartOpen && (
        <CartDrawer shop={shop} cart={cart} catalog={catalog}
          defaultName={contact.name} defaultPhone={contact.phone} loggedIn={!!user && configured}
          onClose={() => setCartOpen(false)}
          /* actually goes to the collection, rather than just closing the
             drawer and leaving the shopper wherever they were */
          onKeepShopping={() => {
            setCartOpen(false);
            setSavedOnly(false);
            setFilter("All");
            document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
          }} />
      )}
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

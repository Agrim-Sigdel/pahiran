import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ShopsMap, { type MapShop } from "@/components/ShopsMap";
import HeroTryOn from "@/components/HeroTryOn";
import AccountMenu from "@/components/AccountMenu";
import GarmentImage from "@/components/GarmentImage";
import { npr } from "@/lib/constants";

/* Landing — vendor-facing marketing page. Shoppers normally arrive at a
   shop's own storefront (/s/…) or kiosk (/k/…) via link or hanger QR.
   Shops that opted in (shops.listed) appear in the directory below. */

export const revalidate = 300;

const CONTACT_EMAIL = "contact@agrimsigdel.com.np";

/* shopper-facing steps — the vendor version lives on /owner */
const STEPS: [string, string, string][] = [
  ["1", "pick a shop", "Browse shops near you, or scan a hanger QR in store."],
  ["2", "one photo", "Snap a photo of yourself — it's never stored."],
  ["3", "see it on you", "Any piece in the shop, on your body, in seconds."],
  ["4", "make it yours", "Save the look, share it, or tell the shop your size."],
];

interface ListedShop { slug: string; name: string; area: string | null; lat: number | null; lng: number | null }

async function getListedShops(): Promise<ListedShop[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const query = (cols: string) => sb
      .from("shops")
      .select(cols)
      .eq("listed", true)
      .neq("name", "")
      .order("created_at", { ascending: true })
      .limit(24);
    let { data } = await query("slug, name, area, lat, lng");
    if (!data) {
      // lat/lng columns missing (20260715_shop_location.sql not applied) —
      // keep the directory alive without the map.
      ({ data } = await query("slug, name, area"));
    }
    return (data as unknown as ListedShop[]) ?? [];
  } catch {
    return [];
  }
}

interface FeedItem {
  id: string; name: string; category: string; price_npr: number; image_url: string;
  shop: { slug: string; name: string; area: string | null };
}

/* Random cross-shop product feed for the landing directory. Garments from
   listed shops, shuffled then dealt round-robin by shop so one big catalog
   can't flood the feed. Reshuffles on each ISR revalidation. */
async function getFeed(): Promise<FeedItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb
      .from("garments")
      .select("id, name, category, price_npr, image_url, shops!inner(slug, name, area, listed)")
      .eq("in_stock", true)
      .eq("shops.listed", true)
      .neq("shops.name", "")
      .limit(80);
    if (!data) return [];
    const items: FeedItem[] = (data as unknown as (Omit<FeedItem, "shop"> & { shops: FeedItem["shop"] })[])
      .map(({ shops, ...g }) => ({ ...g, shop: shops }));
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    const byShop = new Map<string, FeedItem[]>();
    for (const g of items) {
      byShop.set(g.shop.slug, [...(byShop.get(g.shop.slug) ?? []), g]);
    }
    const feed: FeedItem[] = [];
    const queues = [...byShop.values()];
    while (feed.length < 12 && queues.some((q) => q.length)) {
      for (const q of queues) {
        const g = q.shift();
        if (g) feed.push(g);
        if (feed.length === 12) break;
      }
    }
    return feed;
  } catch {
    return [];
  }
}

export default async function Home() {
  const [shops, feed] = await Promise.all([getListedShops(), getFeed()]);
  const pinned = shops.filter((s): s is ListedShop & MapShop => s.lat != null && s.lng != null);
  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      {/* nav — three columns: destinations left, wordmark centred, account right.
          "for store owners" sits with the other destinations rather than in
          nav-tools, so the right-hand side is only ever the shopper's own
          account. It's a navigation link, not a tool. */}
      <nav className="efc-nav">
        {/* "shops" first and unconditional. It used to be conditional on the
            directory being non-empty, so the nav gained a link — and every
            other link slid sideways — the moment a shop published. */}
        <div className="nav-links">
          {shops.length > 0 && <a href="#shops">shops</a>}
          <a href="#how">how it works</a>
          <Link href="/owner" style={{ color: "var(--violet)" }}>for store owners</Link>
        </div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>p<span className="ee">ee</span>q</div>
        </div>
        <div className="nav-tools" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AccountMenu />
        </div>
      </nav>

      {/* hero — the whole promise in one crossfade: same you, new fit */}
      <section id="main" className="hero2">
        <div className="hero2-copy">
          <div className="kicker">a little look before you buy · किन्नु अघि एक झलक</div>
          <h1 className="ph-display" style={{ fontSize: "clamp(42px, 6.5vw, 68px)", lineHeight: 1.05, color: "var(--ink)", margin: 0 }}>
            try it on,<br />without<br />trying it on
          </h1>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            {/* The label follows the destination. "browse shops" scrolling to
                "how it works" because no shop had published yet was a CTA
                lying about where it goes — which is the one thing a CTA
                cannot do. */}
            <a href={shops.length > 0 ? "#shops" : "#how"} className="btn-violet" style={{ padding: "15px 36px" }}>
              {shops.length > 0 ? "browse shops" : "see how it works"}
            </a>
            <Link href="/owner" className="btn-outline" style={{ padding: "13px 30px" }}>I own a store →</Link>
          </div>
          <div style={{ fontSize: 13, color: "var(--stone)", fontWeight: 500 }}>
            free for shoppers · no account needed · नेपाली र english
          </div>
        </div>
        <HeroTryOn />
      </section>

      {/* shop directory (opt-in) */}
      {shops.length > 0 && (
        <section id="shops" className="section-pad">
          {/* One noun. The section was id="shops", headed "browse shops",
              full of garments, subtitled "12 pieces from 3 shops" — and the
              nav link to it said "shops". It is a feed of pieces; the shops
              are how you get to more of them. */}
          <div style={{ textAlign: "center", margin: "0 0 34px" }}>
            <div className="kicker" style={{ marginBottom: 8 }}>fresh picks</div>
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 32px)", color: "var(--ink)", margin: 0 }}>
              {feed.length > 0 ? "pieces you can try on" : "shops on peeq"}
            </h2>
            {feed.length > 0 && (
              <div style={{ fontSize: 13.5, color: "var(--stone)", marginTop: 8 }}>
                {feed.length} piece{feed.length !== 1 ? "s" : ""} from {shops.length} shop{shops.length !== 1 ? "s" : ""} — every one of them tries on
              </div>
            )}
          </div>
          {feed.length > 0 ? (
            <div className="feed-grid">
              {feed.map((g) => (
                <FeedCard key={g.id} g={g} />
              ))}
            </div>
          ) : (
            /* no garments to show yet — fall back to plain shop cards */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
              {shops.map((s) => (
                <div key={s.slug} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
                  <div className="ph-display" style={{ fontSize: 21, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>{s.name}</div>
                  {s.area && <div style={{ fontSize: 13, color: "var(--stone)", marginTop: 3 }}>{s.area}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <Link href={"/s/" + s.slug} className="btn-outline" style={{ padding: "8px 18px", fontSize: 14 }}>storefront</Link>
                    <Link href={"/k/" + s.slug} className="btn-violet" style={{ padding: "8px 18px", fontSize: 14 }}>peeq it</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          {pinned.length > 0 && (
            <div style={{ marginTop: 46 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <h3 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(18px, 2.6vw, 22px)", color: "var(--ink)", margin: 0 }}>
                  find them near you
                </h3>
              </div>
              <ShopsMap shops={pinned} />
            </div>
          )}
        </section>
      )}

      {/* the fork — shopper stays, store owner diverts to /owner */}
      <section className="section-pad" style={{ padding: "56px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, maxWidth: 880, margin: "0 auto" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "34px 30px", textAlign: "center" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>here to shop?</div>
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(22px, 3vw, 28px)", color: "var(--ink)", margin: "0 0 18px" }}>
              see it on you first
            </h2>
            <a href={shops.length > 0 ? "#shops" : "#how"} className="btn-violet" style={{ padding: "13px 34px" }}>
              {shops.length > 0 ? "browse shops" : "see how it works"}
            </a>
          </div>
          <div style={{ background: "var(--slab)", color: "var(--on-slab)", borderRadius: "var(--radius-card)", padding: "34px 30px", textAlign: "center" }}>
            <div className="kicker" style={{ marginBottom: 10, color: "var(--butter)" }}>own a store?</div>
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(22px, 3vw, 28px)", color: "var(--on-slab)", margin: "0 0 18px" }}>
              put <span className="wordmark" style={{ color: "var(--on-slab)", fontSize: "inherit" }}>p<span className="ee">ee</span>q</span> in your shop
            </h2>
            <Link href="/owner" className="ph-btn" style={{ background: "var(--butter)", color: "var(--on-light)", padding: "13px 34px", fontSize: 16, fontWeight: 700, fontFamily: "var(--font-display), sans-serif", borderRadius: "var(--radius-pill)", textDecoration: "none", display: "inline-block" }}>
              peeq for store owners →
            </Link>
          </div>
        </div>
      </section>

      {/* how it works — reference detail, tucked above the footer */}
      <section id="how" className="section-pad" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 32px)", color: "var(--ink)", textAlign: "center", margin: "0 0 30px" }}>
          how it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
          {STEPS.map(([n, t, d]) => (
            <div key={n} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
              <div className="ee-mark" style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--butter)", fontSize: 17, color: "var(--on-light)" }}>{n}</div>
              <div className="ph-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "12px 0 4px" }}>{t}</div>
              <div style={{ fontSize: 14.5, color: "var(--stone)", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      {/* One link (privacy) was the whole footer. A shopper who wants to
          reach the shop side, or a human, had nowhere to go. */}
      <footer style={{ background: "var(--slab)", color: "var(--on-slab-quiet)", padding: "30px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 26, color: "var(--on-slab)" }}>p<span className="ee">ee</span>q</div>
        <nav aria-label="Footer" style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginTop: 14, fontSize: 13 }}>
          <Link href="/owner" style={{ color: "rgba(250,246,240,.6)", textUnderlineOffset: 3 }}>for store owners</Link>
          <Link href="/privacy" style={{ color: "rgba(250,246,240,.6)", textUnderlineOffset: 3 }}>privacy</Link>
          <a href={"mailto:" + CONTACT_EMAIL} style={{ color: "rgba(250,246,240,.6)", textUnderlineOffset: 3 }}>contact</a>
        </nav>
      </footer>
    </main>
  );
}

function FeedCard({ g }: { g: FeedItem }) {
  return (
    <div className="feed-card">
      {/* the piece's own page, not straight into the kiosk — the shopper gets
          sizes, price and shop context first, and peeqs it from there */}
      {/* GarmentImage, like the rest of the app — these were the only raw
          <img>s left in the feed, so the busiest grid on the site was the one
          Next never sized or optimised.

          The pill says "view", because it links to the product page, not to
          the try-on. It said "peeq it", which is the product's word for
          trying something on. */}
      <Link className="feed-img" href={"/s/" + g.shop.slug + "/" + encodeURIComponent(g.id)}>
        <GarmentImage src={g.image_url} alt={g.name} sizes="(max-width: 640px) 50vw, (max-width: 920px) 33vw, 260px" />
        <span className="feed-cta">view</span>
      </Link>
      <div className="feed-meta">
        <Link className="feed-shop" href={"/s/" + g.shop.slug}>
          {g.shop.name}{g.shop.area ? " · " + g.shop.area : ""}
        </Link>
        <div className="feed-name-row">
          <span className="nm">{g.name}</span>
          <span className="pr">{npr(g.price_npr)}</span>
        </div>
      </div>
    </div>
  );
}

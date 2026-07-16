import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ShopsMap, { type MapShop } from "@/components/ShopsMap";
import { npr } from "@/lib/constants";

/* Landing — vendor-facing marketing page. Shoppers normally arrive at a
   shop's own storefront (/s/…) or kiosk (/k/…) via link or hanger QR.
   Shops that opted in (shops.listed) appear in the directory below. */

export const revalidate = 300;

const STEPS: [string, string, string][] = [
  ["1", "photograph the rack", "Add each garment with one phone photo."],
  ["2", "print the QR tags", "Each garment gets a QR code for its hanger."],
  ["3", "shoppers peeq it", "One photo of themselves, no account needed."],
  ["4", "leads reach you", "Size and contact arrive in your dashboard."],
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
    <main style={{ minHeight: "100vh", background: "var(--paper)" }}>
      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links">
          <a href="#how">how it works</a>
          {shops.length > 0 && <a href="#shops">shops</a>}
        </div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>p<span className="ee">ee</span>q</div>
        </div>
        <div className="nav-tools">
          <Link href="/login" style={{ color: "var(--violet)" }}>vendor log in</Link>
        </div>
      </nav>

      {/* hero — the whole promise in one crossfade: same you, new fit */}
      <section className="hero2">
        <div className="hero2-copy">
          <div className="kicker">a little look before you buy · किन्नु अघि एक झलक</div>
          <h1 className="ph-display" style={{ fontSize: "clamp(42px, 6.5vw, 68px)", lineHeight: 1.05, color: "var(--ink)", margin: 0 }}>
            try it on,<br />without<br />trying it on
          </h1>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/login" className="btn-violet" style={{ padding: "15px 36px" }}>create your shop</Link>
            <a href="#how" className="linklike" style={{ fontSize: 15 }}>how it works ↓</a>
          </div>
        </div>
        <div className="hero2-visual">
          <img src="/hero/hero-a.jpg" alt="A shopper in her own outfit" />
          <img src="/hero/hero-b.jpg" alt="The same shopper in a garment from the rack, as rendered by peeq" className="fit-b" />
          <div className="hero2-chip">
            <span className="ee-mark ee-blink" style={{ fontSize: 15, color: "var(--butter-deep)" }}><span>ee</span></span>
            same you · new fit
          </div>
        </div>
      </section>

      {/* shop directory (opt-in) */}
      {shops.length > 0 && (
        <section id="shops" className="section-pad">
          <div style={{ textAlign: "center", margin: "0 0 34px" }}>
            <div className="kicker" style={{ marginBottom: 8 }}>fresh off the rack</div>
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 32px)", color: "var(--ink)", margin: 0 }}>
              browse shops
            </h2>
            {feed.length > 0 && (
              <div style={{ fontSize: 13.5, color: "var(--stone)", marginTop: 8 }}>
                {feed.length} pieces from {shops.length} shop{shops.length !== 1 ? "s" : ""} — every one of them tries on
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

      {/* final CTA */}
      <section className="section-pad" style={{ textAlign: "center", padding: "56px 20px" }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(26px, 4vw, 36px)", color: "var(--ink)", margin: "0 0 20px" }}>
          put it in your shop
        </h2>
        <Link href="/login" className="btn-solid" style={{ padding: "15px 40px" }}>get started</Link>
      </section>

      {/* how it works — reference detail, tucked above the footer */}
      <section id="how" className="section-pad" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 32px)", color: "var(--ink)", textAlign: "center", margin: "0 0 30px" }}>
          how it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
          {STEPS.map(([n, t, d]) => (
            <div key={n} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
              <div className="ee-mark" style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--butter)", fontSize: 17, color: "var(--ink)" }}>{n}</div>
              <div className="ph-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "12px 0 4px" }}>{t}</div>
              <div style={{ fontSize: 14.5, color: "var(--stone)", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.6)", padding: "30px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 26, color: "var(--paper)" }}>p<span className="ee">ee</span>q</div>
      </footer>
    </main>
  );
}

function FeedCard({ g }: { g: FeedItem }) {
  return (
    <div className="feed-card">
      <Link className="feed-img" href={"/k/" + g.shop.slug + "?g=" + encodeURIComponent(g.id)}>
        <img src={g.image_url} alt={g.name} loading="lazy" />
        <span className="feed-cta">peeq it · see it on you</span>
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

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ShopsMap, { type MapShop } from "@/components/ShopsMap";

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

export default async function Home() {
  const shops = await getListedShops();
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
          <div className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>peeq</div>
        </div>
        <div className="nav-tools">
          <Link href="/login" style={{ color: "var(--violet)" }}>vendor log in</Link>
        </div>
      </nav>

      {/* hero */}
      <section style={{ maxWidth: 680, margin: "0 auto", padding: "72px 20px 64px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div className="kicker">a little look before you buy · किन्नु अघि एक झलक</div>
        <h1 className="ph-display" style={{ fontSize: "clamp(36px, 6vw, 60px)", lineHeight: 1.1, color: "var(--ink)", margin: 0 }}>
          try it on,<br />without trying it on
        </h1>
        <p style={{ color: "var(--stone)", fontSize: 17, maxWidth: 440, lineHeight: 1.65, margin: 0 }}>
          Shoppers take one photo and see any garment from your rack on their own body.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/login" className="btn-violet">create your shop</Link>
          <a href="#how" className="btn-outline">how it works</a>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--stone)", fontWeight: 500 }}>
          free to start · works on any phone · नेपाली र english
        </div>
      </section>

      {/* how it works */}
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

      {/* shop directory (opt-in) */}
      {shops.length > 0 && (
        <section id="shops" className="section-pad">
          <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 32px)", color: "var(--ink)", textAlign: "center", margin: "0 0 30px" }}>
            browse shops
          </h2>
          <ShopsMap shops={pinned} />
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
        </section>
      )}

      {/* final CTA */}
      <section className="section-pad" style={{ textAlign: "center", padding: "56px 20px" }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(26px, 4vw, 36px)", color: "var(--ink)", margin: "0 0 20px" }}>
          put it in your shop
        </h2>
        <Link href="/login" className="btn-solid" style={{ padding: "15px 40px" }}>get started</Link>
      </section>

      {/* footer */}
      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.6)", padding: "30px 20px", textAlign: "center" }}>
        <div className="ee-mark ee-blink" style={{ fontSize: 26, color: "var(--butter)", marginBottom: 6 }}><span>ee</span></div>
        <div className="wordmark" style={{ fontSize: 18, color: "var(--paper)" }}>peeq</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>a little look before you buy</div>
      </footer>
    </main>
  );
}

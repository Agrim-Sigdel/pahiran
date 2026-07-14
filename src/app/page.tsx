import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* Landing — vendor-facing marketing page. Shoppers normally arrive at a
   shop's own storefront (/s/…) or kiosk (/k/…) via link or hanger QR.
   Shops that opted in (shops.listed) appear in the directory below. */

export const revalidate = 300;

const STEPS: [string, string, string][] = [
  ["1", "Photograph the rack", "Add each garment with one phone photo."],
  ["2", "Print the QR tags", "Each garment gets a QR code for its hanger."],
  ["3", "Shoppers try it on", "One photo of themselves, no account needed."],
  ["4", "Leads reach you", "Size and contact arrive in your dashboard."],
];

interface ListedShop { slug: string; name: string; area: string | null }

async function getListedShops(): Promise<ListedShop[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb
      .from("shops")
      .select("slug, name, area")
      .eq("listed", true)
      .neq("name", "")
      .order("created_at", { ascending: true })
      .limit(24);
    return (data as ListedShop[]) ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const shops = await getListedShops();
  return (
    <main style={{ minHeight: "100vh", background: "var(--sage)" }}>
      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links">
          <a href="#how">How it works</a>
          {shops.length > 0 && <a href="#shops">Shops</a>}
        </div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: "clamp(17px, 4vw, 22px)" }}>EasyFitCheck</div>
        </div>
        <div className="nav-tools">
          <Link href="/login">Vendor log in</Link>
        </div>
      </nav>

      {/* hero */}
      <section style={{ maxWidth: 680, margin: "0 auto", padding: "72px 20px 64px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div className="kicker">Virtual try-on · Nepal</div>
        <h1 className="ph-display" style={{ fontWeight: 500, fontSize: "clamp(34px, 5.4vw, 56px)", lineHeight: 1.1, color: "var(--forest-deep)", letterSpacing: ".04em", textTransform: "uppercase", margin: 0 }}>
          Try it on, without trying it on
        </h1>
        <p style={{ color: "var(--mut)", fontSize: 16, maxWidth: 420, lineHeight: 1.65, margin: 0 }}>
          Shoppers take one photo and see any garment from your rack on their own body.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/login" className="btn-solid">Create your shop</Link>
          <a href="#how" className="btn-outline">How it works</a>
        </div>
        <div style={{ fontSize: 12, color: "var(--mut)" }}>
          Free to start · works on any phone · नेपाली र English
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="section-pad" style={{ background: "var(--cream)", borderTop: "1px solid var(--line)" }}>
        <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(22px, 3.6vw, 30px)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--forest-deep)", textAlign: "center", margin: "0 0 30px" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
          {STEPS.map(([n, t, d]) => (
            <div key={n} style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
              <div className="ph-display" style={{ fontSize: 30, color: "var(--camel)", lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--forest-deep)", margin: "10px 0 6px" }}>{t}</div>
              <div style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* shop directory (opt-in) */}
      {shops.length > 0 && (
        <section id="shops" className="section-pad">
          <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(22px, 3.6vw, 30px)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--forest-deep)", textAlign: "center", margin: "0 0 30px" }}>
            Browse shops
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
            {shops.map((s) => (
              <div key={s.slug} style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
                <div className="ph-display" style={{ fontSize: 21, color: "var(--forest-deep)", lineHeight: 1.3 }}>{s.name}</div>
                {s.area && <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 3 }}>{s.area}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <Link href={"/s/" + s.slug} className="btn-outline" style={{ padding: "9px 16px", fontSize: 11 }}>Storefront</Link>
                  <Link href={"/k/" + s.slug} className="btn-outline" style={{ padding: "9px 16px", fontSize: 11 }}>Try-on kiosk</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* final CTA */}
      <section className="section-pad" style={{ textAlign: "center", padding: "56px 20px" }}>
        <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(24px, 4vw, 34px)", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--forest-deep)", margin: "0 0 20px" }}>
          Put it in your shop
        </h2>
        <Link href="/login" className="btn-solid" style={{ padding: "16px 40px" }}>Get started</Link>
      </section>

      {/* footer */}
      <footer style={{ background: "var(--forest-deep)", color: "rgba(237,239,224,.6)", padding: "26px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 16, color: "var(--cream)" }}>EasyFitCheck</div>
      </footer>
    </main>
  );
}

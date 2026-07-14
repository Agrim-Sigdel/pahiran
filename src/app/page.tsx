import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--sage)" }}>
      {/* nav */}
      <nav style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "18px 28px", background: "var(--cream)", borderBottom: "1px solid var(--line)", gap: 12 }}>
        <div style={{ display: "flex", gap: 22, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500 }}>
          <a href="#how" style={{ color: "inherit", textDecoration: "none" }}>How it works</a>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="wordmark" style={{ fontSize: 22 }}>EasyFitCheck</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500 }}>
          <Link href="/login" style={{ color: "inherit", textDecoration: "none" }}>Vendor log in</Link>
        </div>
      </nav>

      {/* hero */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", minHeight: 440 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 24px 48px min(56px, 6vw)", gap: 22 }}>
          <div className="kicker">Virtual try-on · Nepal</div>
          <h1 className="ph-display" style={{ fontWeight: 500, fontSize: "clamp(36px, 5.4vw, 58px)", lineHeight: 1.08, color: "var(--forest-deep)", letterSpacing: ".04em", textTransform: "uppercase", margin: 0 }}>
            Try it on,<br />without<br />trying it on
          </h1>
          <p style={{ color: "var(--mut)", fontSize: 16, maxWidth: 380, lineHeight: 1.65, margin: 0 }}>
            One photo is all it takes. See any garment from your favourite local shop on you, before you visit.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link href="/login" className="btn-solid">For shops — get started</Link>
            <a href="#how" className="btn-outline">How it works</a>
          </div>
        </div>
        <div style={{ margin: "36px 36px 36px 0", minHeight: 280, borderRadius: 4, boxShadow: "var(--shadow-soft)", background: "linear-gradient(145deg, #D7DCC4, #C3CBAE)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="ph-display" style={{ fontSize: 44, color: "var(--forest-deep)", opacity: .5 }}>EFC</span>
        </div>
      </div>

      {/* value strip */}
      <div id="how" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", borderTop: "1px solid var(--line)", background: "var(--cream)" }}>
        {[
          ["One photo", "Snap once, try the whole catalog on you."],
          ["No account", "No name, no number, no sign-up for shoppers."],
          ["Order on WhatsApp", "Tell the shop what you want with one tap."],
        ].map(([t, d]) => (
          <div key={t} style={{ padding: "26px 20px", textAlign: "center", borderLeft: "1px solid var(--line)" }}>
            <div className="ph-display" style={{ fontSize: 19, color: "var(--forest-deep)", marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

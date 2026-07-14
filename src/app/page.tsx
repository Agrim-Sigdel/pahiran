import Link from "next/link";

/* Landing — vendor-facing marketing page. Shoppers normally arrive at a
   shop's own storefront (/s/…) or kiosk (/k/…) via link or hanger QR. */

const STEPS: [string, string, string][] = [
  ["1", "Photograph the rack", "Add each garment to your catalog with one phone photo — flat-lay or mannequin."],
  ["2", "Print the QR tags", "Every garment gets its own QR code for the hanger, plus a kiosk link for a tablet."],
  ["3", "Shoppers try it on", "One photo of themselves and they see any piece on their own body — no account."],
  ["4", "Leads land with you", "\"I want this\" sends size and contact straight to your dashboard and WhatsApp."],
];

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--sage)" }}>
      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#audiences">For shops</a>
        </div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: "clamp(17px, 4vw, 22px)" }}>EasyFitCheck</div>
        </div>
        <div className="nav-tools">
          <Link href="/login">Vendor log in</Link>
        </div>
      </nav>

      {/* hero */}
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="kicker">Virtual try-on · Nepal</div>
          <h1 className="ph-display" style={{ fontWeight: 500, fontSize: "clamp(34px, 5.4vw, 58px)", lineHeight: 1.08, color: "var(--forest-deep)", letterSpacing: ".04em", textTransform: "uppercase", margin: 0 }}>
            Try it on,<br />without<br />trying it on
          </h1>
          <p style={{ color: "var(--mut)", fontSize: 16, maxWidth: 380, lineHeight: 1.65, margin: 0 }}>
            One photo is all it takes. Your shoppers see any garment from your rack on
            their own body — before the changing room, before they even visit.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link href="/login" className="btn-solid">Create your shop — free</Link>
            <a href="#how" className="btn-outline">How it works</a>
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)" }}>
            No app to install · works on any phone · Nepali &amp; English
          </div>
        </div>
        <div className="hero-visual" style={{ background: "linear-gradient(145deg, #D7DCC4, #C3CBAE)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div className="ph-display" style={{ fontSize: "clamp(40px, 8vw, 64px)", color: "var(--forest-deep)", opacity: .45, lineHeight: 1 }}>EFC</div>
            <div style={{ fontSize: 11, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--forest)", marginTop: 8 }}>the trial room, reinvented</div>
          </div>
        </div>
      </div>

      {/* value strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "var(--cream)" }}>
        {[
          ["One photo", "Snap once, try the whole catalog on you."],
          ["No account", "No name, no number, no sign-up for shoppers."],
          ["Order on WhatsApp", "Tell the shop what you want with one tap."],
        ].map(([t, d]) => (
          <div key={t} style={{ padding: "24px 20px", textAlign: "center" }}>
            <div className="ph-display" style={{ fontSize: 19, color: "var(--forest-deep)", marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 13, color: "var(--mut)", lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* how it works */}
      <section id="how" className="section-pad">
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>From rack to result</div>
          <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(22px, 3.6vw, 30px)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--forest-deep)", margin: 0 }}>
            How it works
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
          {STEPS.map(([n, t, d]) => (
            <div key={n} style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "22px 20px" }}>
              <div className="ph-display" style={{ fontSize: 30, color: "var(--camel)", lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--forest-deep)", margin: "10px 0 6px" }}>{t}</div>
              <div style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* audiences */}
      <section id="audiences" className="section-pad" style={{ background: "var(--sage-mist)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "32px 28px" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>For shops</div>
            <h3 className="ph-display" style={{ fontWeight: 400, fontSize: 26, lineHeight: 1.25, color: "var(--forest-deep)", margin: "0 0 12px" }}>
              A virtual trial room, running this week
            </h3>
            <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, fontSize: 14, color: "var(--mut)", lineHeight: 1.55 }}>
              <li>— A storefront page and try-on kiosk under your own shop link</li>
              <li>— QR tags per garment; leads with size &amp; phone in your inbox</li>
              <li>— See your most-tried pieces — know what to put in the window</li>
              <li>— Works on the tablet or phone you already own</li>
            </ul>
            <Link href="/login" className="btn-solid">Create your shop</Link>
          </div>
          <div style={{ background: "var(--forest-deep)", borderRadius: "var(--radius-card)", padding: "32px 28px", color: "var(--sage)" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>For shoppers</div>
            <h3 className="ph-display" style={{ fontWeight: 400, fontSize: 26, lineHeight: 1.25, color: "var(--cream)", margin: "0 0 12px" }}>
              See it on you before you queue for the trial room
            </h3>
            <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, fontSize: 14, color: "rgba(237,239,224,.75)", lineHeight: 1.55 }}>
              <li>— Scan the QR on any hanger, or open the shop's link</li>
              <li>— One photo, kept private — never stored by the shop</li>
              <li>— Save your favourite looks on your phone, share to friends</li>
              <li>— नेपाली र English दुवैमा</li>
            </ul>
            <div style={{ fontSize: 12.5, color: "rgba(237,239,224,.6)", lineHeight: 1.6 }}>
              Shoppers don't sign up here — just scan a tag in a partner shop.
            </div>
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="section-pad" style={{ textAlign: "center" }}>
        <h2 className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(24px, 4vw, 34px)", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--forest-deep)", margin: "0 0 10px" }}>
          Put it in your shop
        </h2>
        <p style={{ color: "var(--mut)", fontSize: 15, maxWidth: 440, margin: "0 auto 24px", lineHeight: 1.65 }}>
          Photograph your rack this afternoon, print your QR tags tonight,
          and your shoppers are trying clothes on tomorrow.
        </p>
        <Link href="/login" className="btn-solid" style={{ padding: "16px 40px" }}>Get started — free</Link>
      </section>

      {/* footer */}
      <footer style={{ background: "var(--forest-deep)", color: "rgba(237,239,224,.6)", padding: "26px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 16, color: "var(--cream)", marginBottom: 6 }}>EasyFitCheck</div>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase" }}>
          try it on, without trying it on · Nepal
        </div>
      </footer>
    </main>
  );
}

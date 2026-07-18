import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";

/* Vendor landing — where "I own a store" traffic from the main page lands.
   Structure: hook → the poster creative → three proof blocks (in-store QR,
   catalog, analytics) → steps strip → close. Every CTA funnels to /login. */

const VENDOR_STEPS: [string, string][] = [
  ["photograph your pieces", "one phone photo per garment. we help you shoot it"],
  ["print the QR tags", "every hanger gets its own try-on code"],
  ["shoppers peeq it", "on their own photo, no app, no account"],
  ["leads reach you", "name, size and number in your dashboard"],
];

export default function OwnerPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)" }}>
      {/* nav */}
      <nav className="efc-nav">
        <div className="nav-links">
          <Link href="/">← for shoppers</Link>
        </div>
        <div className="nav-logo">
          <Link href="/" style={{ textDecoration: "none" }}>
            <div className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>p<span className="ee">ee</span>q</div>
          </Link>
        </div>
        <div className="nav-tools" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/login" style={{ color: "var(--violet)" }}>vendor log in</Link>
          <AccountMenu />
        </div>
      </nav>

      {/* hook */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 36px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div className="kicker">peeq for store owners</div>
        <h1 className="ph-display" style={{ fontSize: "clamp(38px, 6vw, 60px)", lineHeight: 1.08, color: "var(--ink)", margin: 0 }}>
          stop answering<br />&ldquo;will this suit me?&rdquo;
        </h1>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/login" className="btn-violet" style={{ padding: "15px 40px" }}>create your shop free</Link>
          <Link href="/" className="btn-outline">try it as a shopper</Link>
        </div>
      </section>

      {/* the poster — main selling creative. Landscape on desktop; phones get
          the vertical cut plus the DM-demo panel stacked below it. */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "0 20px 24px" }}>
        <picture>
          <source media="(max-width: 760px)" srcSet="/hero/owner-hero-m1.jpg" />
          <img className="owner-poster" src="/hero/owner-hero.jpg" alt="Send once. They see it on them — peeq try-on links in your Instagram DMs"
            style={{ width: "100%", display: "block", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-soft)", border: "1px solid var(--line)" }} />
        </picture>
        <img className="owner-hero-dm" src="/hero/owner-hero-m2.jpg"
          alt="Send once. They see it on them — peeq try-on links in your DMs" />
      </section>

      {/* proof blocks */}
      <section className="section-pad" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div className="owner-row">
          <div className="owner-copy">
            <div className="kicker">in your shop</div>
            <h2 className="ph-display" style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, color: "var(--ink)", margin: "10px 0 12px" }}>
              a QR on every hanger
            </h2>
            <p>
              Shoppers scan the tag, take one photo, and see the piece on themselves
              before they queue for the trial room. No kiosk hardware needed — their
              phone is the trial room.
            </p>
          </div>
          <img src="/hero/owner-instore.jpg" alt="A shopper scanning a hanger QR and seeing the shirt on themselves" />
        </div>

        <div className="owner-row flip">
          <div className="owner-copy">
            <div className="kicker">your catalog</div>
            <h2 className="ph-display" style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, color: "var(--ink)", margin: "10px 0 12px" }}>
              one photo per garment, done
            </h2>
            <p>
              Name, price, sizes, in-stock toggle — the whole catalog is online in an
              afternoon. Print hanger QR tags straight from the dashboard, and your
              public storefront updates itself.
            </p>
          </div>
          <img src="/hero/owner-catalog.jpg" alt="The peeq vendor dashboard — adding a garment with one photo" />
        </div>

        <div className="owner-row">
          <div className="owner-copy">
            <div className="kicker">in your pocket</div>
            <h2 className="ph-display" style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, color: "var(--ink)", margin: "10px 0 12px" }}>
              run the store from anywhere
            </h2>
            <p>
              The whole dashboard works on your phone — flip a piece out of stock,
              change a price, reprint a QR tag, or answer a lead from the counter,
              the wholesale trip, or the couch. Install it like an app, no app store.
            </p>
          </div>
          <img className="phone" src="/hero/owner-mobile.jpg" alt="The peeq dashboard on a phone — catalog with try-on counts per garment" />
        </div>

        <div className="owner-row flip">
          <div className="owner-copy">
            <div className="kicker">your numbers</div>
            <h2 className="ph-display" style={{ fontSize: "clamp(24px, 3.4vw, 32px)", fontWeight: 600, color: "var(--ink)", margin: "10px 0 12px" }}>
              know what&rsquo;s hot before it sells
            </h2>
            <p>
              Try-ons per day, most-tried items, and a leads inbox — every
              &ldquo;I want this&rdquo; arrives with a name, size and phone number.
              You'll know what to restock.
            </p>
          </div>
          <img className="phone" src="/hero/owner-analytics.jpg" alt="peeq analytics — try-ons per day and most-tried items" />
        </div>
      </section>

      {/* custom solution / demo call */}
      <section style={{ maxWidth: 1040, margin: "0 auto", padding: "0 20px 40px" }}>
        <div style={{ background: "var(--ink)", borderRadius: "var(--radius-card)", padding: "38px 30px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8 }}>
          <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(20px, 2.8vw, 26px)", color: "var(--paper)", margin: 0, maxWidth: 560 }}>
            need a custom solution or integration for your business?
          </h2>
          <p style={{ color: "rgba(250,246,240,.65)", fontSize: 14.5, margin: 0 }}>
            schedule a free demo call with us. 15 minutes, no strings.
          </p>
          <a href="https://cal.com/contractorops/15min" target="_blank" rel="noopener noreferrer" className="ph-btn"
            style={{ background: "var(--butter)", color: "var(--ink)", padding: "13px 32px", fontSize: 15, fontWeight: 700, fontFamily: "'Baloo 2', cursive", borderRadius: 999, textDecoration: "none", display: "inline-block", marginTop: 12 }}>
            book a free demo call →
          </a>
        </div>
      </section>

      {/* steps strip */}
      <section className="section-pad" style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
        <div style={{ textAlign: "center", margin: "0 0 26px" }}>
          <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(22px, 3vw, 28px)", color: "var(--ink)", margin: 0 }}>
            your whole shop, on peeq
          </h2>
          <p style={{ color: "var(--stone)", fontSize: 14.5, margin: "8px auto 0", maxWidth: 460, lineHeight: 1.6 }}>
            set up in one afternoon, then manage your inventory, prices, QR tags and
            customer leads from a single dashboard.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, maxWidth: 1040, margin: "0 auto" }}>
          {VENDOR_STEPS.map(([t, d], i) => (
            <div key={t} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "20px 18px" }}>
              <div className="ee-mark" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--butter)", fontSize: 16, color: "var(--ink)" }}>{i + 1}</div>
              <div className="ph-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", margin: "11px 0 3px" }}>{t}</div>
              <div style={{ fontSize: 14, color: "var(--stone)", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* close */}
      <section className="section-pad" style={{ textAlign: "center", padding: "56px 20px" }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(26px, 4vw, 36px)", color: "var(--ink)", margin: "0 0 8px" }}>
          put it in your shop this week
        </h2>
        <p style={{ color: "var(--stone)", fontSize: 15, margin: "0 0 22px" }}>
          free to start · works on any phone or tablet · नेपाली र english
        </p>
        <Link href="/login" className="btn-solid" style={{ padding: "15px 44px" }}>create your shop</Link>
      </section>

      {/* footer */}
      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.6)", padding: "30px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 26, color: "var(--paper)" }}>p<span className="ee">ee</span>q</div>
      </footer>
    </main>
  );
}

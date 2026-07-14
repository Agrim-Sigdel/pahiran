import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        background: "radial-gradient(120% 100% at 50% 0%, #3A2140 0%, var(--ink) 55%)",
        color: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 13,
          letterSpacing: ".28em",
          textTransform: "uppercase",
          color: "var(--marigold)",
          marginBottom: 18,
        }}
      >
        Virtual try-on · Nepal
      </div>
      <h1 className="ph-display" style={{ fontSize: "clamp(38px, 7vw, 64px)", margin: 0, lineHeight: 1.1 }}>
        Pahiran<span style={{ color: "var(--rani-soft)" }}>.</span>
      </h1>
      <p style={{ color: "rgba(255,255,255,.6)", fontSize: 17, maxWidth: 460, margin: "16px 0 36px" }}>
        Try it on — without trying it on. One platform for clothing shops, influencer stores, and
        shoppers.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/dashboard"
          className="ph-btn"
          style={{
            background: "linear-gradient(120deg, var(--rani), var(--rani-soft))",
            color: "#fff",
            padding: "16px 32px",
            fontSize: 17,
            borderRadius: 32,
            textDecoration: "none",
            boxShadow: "0 10px 34px rgba(196,37,97,.45)",
          }}
        >
          Vendor dashboard
        </Link>
        <Link
          href="/kiosk"
          className="ph-btn"
          style={{
            background: "rgba(255,255,255,.12)",
            color: "#fff",
            padding: "16px 32px",
            fontSize: 17,
            borderRadius: 32,
            textDecoration: "none",
          }}
        >
          Launch kiosk
        </Link>
      </div>
    </main>
  );
}

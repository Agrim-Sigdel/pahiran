import Link from "next/link";

/* Rendered when notFound() fires in page.tsx — a real 404 status, so dead shop
   links don't get indexed the way a 200-with-sad-copy would. */

export default function ShopNotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "var(--sage)" }}>
      <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)" }}>shop not found</div>
      <p style={{ color: "var(--stone)", maxWidth: 380, margin: 0 }}>
        This link doesn&apos;t match any shop on peeq. It may have moved, or the shop may have changed its link.
      </p>
      <Link href="/" className="btn-violet" style={{ marginTop: 6 }}>browse shops</Link>
    </div>
  );
}

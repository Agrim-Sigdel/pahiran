"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/logging";

/* Segment error boundary — covers the storefront and its product pages. Without
   it a thrown render error drops the shopper on Next's default error page. */

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError("storefront", error.message || "storefront render failed", { digest: error.digest });
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "var(--sage)" }}>
      <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)" }}>something went wrong</div>
      <p style={{ color: "var(--stone)", maxWidth: 380, margin: 0 }}>
        We couldn&apos;t load the collection just now. Your bag is safe.
      </p>
      <button className="btn-violet ph-btn" onClick={reset} style={{ marginTop: 6 }}>try again</button>
    </div>
  );
}

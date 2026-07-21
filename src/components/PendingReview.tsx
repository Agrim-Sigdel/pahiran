"use client";

import { SHOP_CATEGORIES } from "@/lib/constants";
import type { Shop } from "@/lib/types";

/* Shown instead of the dashboard once the shop profile is filled in but the
   admin hasn't approved it yet. The vendor has nothing to do here — the
   database refuses catalog writes and try-ons for an unapproved shop anyway
   (see 20260721000100_admin_console.sql), so showing the full dashboard would
   just be a wall of controls that fail on use. Read-only summary instead, so
   they can confirm what we have on file while they wait. */

const COPY: Record<string, { tone: string; title: string; body: string }> = {
  pending: {
    tone: "var(--camel)",
    title: "verification pending",
    body: "We review every new vendor before the shop goes live. Nothing more is needed from you — we'll give you a call to confirm, usually within a day.",
  },
  rejected: {
    tone: "var(--rust, #b4432c)",
    title: "shop not approved",
    body: "Your shop isn't visible to shoppers and can't run try-ons. We'll call you to explain — you can ask us to review it again on that call.",
  },
  suspended: {
    tone: "var(--rust, #b4432c)",
    title: "shop suspended",
    body: "Your storefront is hidden and try-ons are paused. Your catalog is safe — we'll call you to sort this out.",
  },
};

export default function PendingReview({ shop, signOut }: {
  shop: Shop;
  signOut: (() => void) | null;
}) {
  const c = COPY[shop.status] ?? COPY.pending;
  const host = typeof window === "undefined" ? "" : window.location.host;

  return (
    <div style={{ minHeight: "100vh", background: "var(--sage)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", width: 440, maxWidth: "100%", padding: "34px 30px" }}>
        <div className="wordmark" style={{ fontSize: 18, marginBottom: 18 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>

        <div className="ph-display" style={{ fontSize: 26, color: c.tone, marginBottom: 6 }}>{c.title}</div>
        <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6, margin: "0 0 20px" }}>{c.body}</p>

        {shop.statusNote && (
          <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 13, color: "var(--ink)", lineHeight: 1.6, marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: "var(--mut)", marginBottom: 3 }}>Note from the team</div>
            {shop.statusNote}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: "var(--mut)" }}>What we have on file</div>
          <Row label="Shop name" value={shop.name} />
          <Row label="Area / city" value={shop.area} />
          <Row label="Sells" value={SHOP_CATEGORIES.find((c) => c.id === shop.category)?.label ?? shop.category} />
          <Row label="AI try-on" value={shop.type === "apparel" ? "Included" : "Not included"} />
          <Row label="WhatsApp" value={shop.whatsapp || "— not set —"} />
          <Row label="Listed on peeq" value={shop.listed ? "Yes" : "No"} />
          <Row label="Map pin" value={shop.lat != null && shop.lng != null ? "Placed" : "— not placed —"} />

          {shop.slug && (
            <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 12.5, color: "var(--forest-deep)", lineHeight: 1.7, marginTop: 4 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: "var(--mut)", marginBottom: 3 }}>Your links, once approved</div>
              <div>Kiosk: <code>{host}/k/{shop.slug}</code></div>
              <div>Storefront: <code>{host}/s/{shop.slug}</code></div>
            </div>
          )}
        </div>

        {/* We call rather than email, so a missing number is the one thing that
            actually stalls a review — say so plainly instead of leaving the
            vendor waiting on a call that can't happen. */}
        <p style={{ fontSize: 12.5, color: shop.whatsapp ? "var(--mut)" : "var(--danger)", lineHeight: 1.6, margin: "20px 0 0" }}>
          {shop.whatsapp
            ? `We'll call you on ${shop.whatsapp}. Keep it reachable over the next day.`
            : "We don't have a phone number for you, so we can't complete your review — please send us one from the number you want to be reached on."}
        </p>

        {signOut && (
          <button className="ph-btn" onClick={signOut} style={{ marginTop: 18, width: "100%" }}>
            sign out
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13.5, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
      <span style={{ color: "var(--mut)" }}>{label}</span>
      <span style={{ color: "var(--ink)", textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

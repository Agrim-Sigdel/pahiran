"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SHOP_CATEGORIES } from "@/lib/constants";
import { phoneError } from "@/lib/validate";
import Icon from "@/components/Icon";
import type { Shop } from "@/lib/types";

/* Shown instead of the dashboard once the shop profile is filled in but the
   admin hasn't approved it yet. The vendor can't sell here — the database
   refuses catalog writes and try-ons for an unapproved shop (see
   20260721000100_admin_console.sql) — so showing the full dashboard would be a
   wall of controls that fail on use.

   But it was entirely READ-ONLY, and that turned one typo into a dead end:
   the page said "we can't complete your review — please send us one" with no
   field, no email link, no WhatsApp, no support contact anywhere on it. A
   vendor who mistyped their number could not fix it, could not be called, and
   therefore could not be approved, and had no way to tell anyone. The one
   field the review actually depends on is editable here now, and there is a
   way to reach a human either way. */

const CONTACT_EMAIL = "contact@agrimsigdel.com.np";

const COPY: Record<string, { tone: string; toneBg: string; title: string; body: string }> = {
  pending: {
    /* --warn. This was `var(--camel)`, a legacy alias of the body-text grey,
       so the status heading was drawn in exactly the colour of the paragraph
       under it and carried no signal at all. */
    tone: "var(--warn)",
    toneBg: "var(--warn-bg)",
    title: "verification pending",
    body: "We review every new vendor before the shop goes live. Nothing more is needed from you — we'll give you a call to confirm, usually within a day.",
  },
  rejected: {
    tone: "var(--danger)",
    toneBg: "var(--danger-bg)",
    title: "shop not approved",
    body: "Your shop isn't visible to shoppers and can't run try-ons. We'll call you to explain — you can ask us to review it again on that call.",
  },
  suspended: {
    tone: "var(--danger)",
    toneBg: "var(--danger-bg)",
    title: "shop suspended",
    body: "Your storefront is hidden and try-ons are paused. Your catalog is safe — we'll call you to sort this out.",
  },
};

export default function PendingReview({ shop, signOut, updateShop }: {
  shop: Shop;
  signOut: (() => void) | null;
  /* Omit to keep the page read-only (the old behaviour). Passing it is what
     lets a vendor unstick their own review. */
  updateShop?: (s: Shop) => void;
}) {
  const c = COPY[shop.status] ?? COPY.pending;
  const [host, setHost] = useState("");
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(shop.whatsapp);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // window isn't there on the server, and reading it during render desyncs
  // the first client paint from the HTML
  useEffect(() => setHost(window.location.host), []);
  useEffect(() => { setPhone(shop.whatsapp); }, [shop.whatsapp]);

  const savePhone = () => {
    const problem = phoneError(phone);
    if (problem) { setErr(problem); return; }
    setErr(null);
    updateShop?.({ ...shop, whatsapp: phone.trim() });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  };

  const mailHref =
    `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`peeq review — ${shop.name || "my shop"}`)}` +
    `&body=${encodeURIComponent(`Shop: ${shop.name}\nArea: ${shop.area}\nPhone: ${shop.whatsapp || "(not set)"}\n\n`)}`;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-up sheet" style={{ width: 460, maxWidth: "100%", padding: "34px 30px" }}>
        <Link href="/" className="wordmark" style={{ fontSize: 18, marginBottom: 18, display: "inline-block", textDecoration: "none" }}>
          p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q
        </Link>

        <div className="ph-display" style={{ fontSize: 26, color: c.tone, marginBottom: 6 }}>{c.title}</div>
        <p style={{ fontSize: 13.5, color: "var(--stone)", lineHeight: 1.6, margin: "0 0 20px" }}>{c.body}</p>

        {shop.statusNote && (
          <div style={{ background: c.toneBg, border: "1px solid " + c.tone, borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 13, color: "var(--ink)", lineHeight: 1.6, marginBottom: 18 }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", color: c.tone, fontWeight: 700, marginBottom: 3 }}>Note from the team</div>
            {shop.statusNote}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, letterSpacing: ".12em", color: "var(--stone)", fontWeight: 600 }}>What we have on file</div>
          <Row label="Shop name" value={shop.name} />
          <Row label="Area / city" value={shop.area} />
          <Row label="Sells" value={SHOP_CATEGORIES.find((x) => x.id === shop.category)?.label ?? shop.category} />
          <Row label="AI try-on" value={shop.type === "apparel" ? "Included" : "Not included"} />
          <Row label="Listed on peeq" value={shop.listed ? "Yes" : "No"} />
          <Row label="Map pin" value={shop.lat != null && shop.lng != null ? "Placed" : "— not placed —"} />
        </div>

        {/* The phone number is the one field the review actually depends on,
            so it is the one field that stays editable while waiting. */}
        <div style={{ marginTop: 18, background: shop.whatsapp ? "var(--paper)" : "var(--danger-bg)", border: "1px solid " + (shop.whatsapp ? "var(--line)" : "var(--danger)"), borderRadius: "var(--radius-btn)", padding: "13px 15px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, letterSpacing: ".12em", color: "var(--stone)", fontWeight: 600 }}>WHATSAPP — WE CALL THIS NUMBER</span>
            {updateShop && !editing && (
              <button className="ph-btn" onClick={() => { setEditing(true); setErr(null); }}
                style={{ fontSize: 12.5, fontWeight: 700, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
                {shop.whatsapp ? "change" : "add it"}
              </button>
            )}
          </div>

          {editing ? (
            <div style={{ marginTop: 8 }}>
              <label className="field">
                <span className="sr-only">WhatsApp number</span>
                <input value={phone} maxLength={20} inputMode="tel" autoFocus
                  aria-invalid={!!err} aria-describedby={err ? "pending-phone-err" : undefined}
                  onChange={(e) => { setPhone(e.target.value.replace(/[^0-9+ ]/g, "")); setErr(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") savePhone(); if (e.key === "Escape") { setEditing(false); setPhone(shop.whatsapp); } }}
                  placeholder="e.g. 9779841000000" />
                {err && <span id="pending-phone-err" className="err">{err}</span>}
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="ph-btn btn-solid" onClick={savePhone} style={{ padding: "9px 20px", fontSize: 13 }}>save</button>
                <button className="ph-btn" onClick={() => { setEditing(false); setPhone(shop.whatsapp); setErr(null); }}
                  style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)" }}>
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 15, color: shop.whatsapp ? "var(--ink)" : "var(--danger)", fontWeight: 600 }}>
              {shop.whatsapp || "not set — we can't complete your review without it"}
            </div>
          )}
          {saved && <div role="status" style={{ marginTop: 8, fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}><Icon name="check" /> saved — we'll call this number</div>}
        </div>

        {shop.slug && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.7, marginTop: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", color: "var(--stone)", fontWeight: 600, marginBottom: 3 }}>Your links, once approved</div>
            <div>Kiosk: <code>{host}/k/{shop.slug}</code></div>
            <div>Storefront: <code>{host}/s/{shop.slug}</code></div>
          </div>
        )}

        <p style={{ fontSize: 12.5, color: "var(--stone)", lineHeight: 1.6, margin: "18px 0 0" }}>
          {shop.whatsapp
            ? `We'll call you on ${shop.whatsapp}. Keep it reachable over the next day.`
            : "Add a number above and we'll call you — or write to us and we'll take it from there."}
          {" "}
          <a href={mailHref} style={{ color: "var(--violet)", fontWeight: 600 }}>email us</a> if
          anything above is wrong.
        </p>

        {signOut && (
          /* was a bare .ph-btn — `background: none; border: none` — so the one
             control at the bottom of the page rendered as floating grey text
             that didn't look pressable */
          <button className="ph-btn" onClick={signOut}
            style={{ marginTop: 18, width: "100%", padding: "12px 20px", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)" }}>
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
      <span style={{ color: "var(--stone)" }}>{label}</span>
      <span style={{ color: "var(--ink)", textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

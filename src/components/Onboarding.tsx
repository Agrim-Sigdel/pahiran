"use client";

import { useState } from "react";
import type { Shop } from "@/lib/types";

/* First-login setup: shown instead of the dashboard until the shop has a
   name. The name becomes the public /k/{slug} and /s/{slug} links. */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function Onboarding({ shop, onComplete }: {
  shop: Shop;
  onComplete: (info: { name: string; area: string; whatsapp: string; listed: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [area, setArea] = useState(shop.area);
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp);
  const [listed, setListed] = useState(shop.listed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const slug = slugify(name);
  const host = typeof window === "undefined" ? "" : window.location.host;
  const canSave = name.trim().length >= 2 && area.trim().length >= 2 && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({ name: name.trim(), area: area.trim(), whatsapp: whatsapp.trim(), listed });
    } catch (e: any) {
      setError(e?.message || "Could not save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sage)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", width: 440, maxWidth: "100%", padding: "34px 30px" }}>
        <div className="wordmark" style={{ fontSize: 18, marginBottom: 18 }}>peeq</div>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--forest-deep)", marginBottom: 6 }}>set up your shop</div>
        <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6, margin: "0 0 20px" }}>
          Your shop name becomes your kiosk and storefront link.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">Shop name
            <input value={name} autoFocus placeholder="e.g. Juju Fashion House"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </label>
          <label className="field">Area / city
            <input value={area} placeholder="e.g. New Road, Kathmandu"
              onChange={(e) => setArea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </label>
          <label className="field">WhatsApp number
            <input value={whatsapp} placeholder="e.g. 9779841000000" inputMode="tel"
              onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--mut)", marginTop: 4, display: "block" }}>
              Orders arrive here. You can add or change it later in Settings.
            </span>
          </label>

          {shop.id && slug.length >= 3 && (
            <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 12.5, color: "var(--forest-deep)", lineHeight: 1.7 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: "var(--mut)", marginBottom: 3 }}>Your links</div>
              <div>Kiosk: <code>{host}/k/{slug}</code></div>
              <div>Storefront: <code>{host}/s/{slug}</code></div>
            </div>
          )}

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={listed} style={{ marginTop: 3, accentColor: "var(--forest)" }}
              onChange={(e) => setListed(e.target.checked)} />
            <span>
              Show my shop on the peeq landing page
              <span style={{ display: "block", fontSize: 12, color: "var(--mut)" }}>
                Shoppers can find and browse your storefront and kiosk.
              </span>
            </span>
          </label>

          {error && <div style={{ fontSize: 13, color: "var(--camel)" }}>{error}</div>}

          <button className="ph-btn btn-solid" disabled={!canSave} onClick={submit}
            style={{ marginTop: 4, opacity: canSave ? 1 : 0.55 }}>
            {busy ? "setting up…" : "open my dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

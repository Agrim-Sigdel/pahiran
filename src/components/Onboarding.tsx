"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";
import { nameError, phoneError, fieldErrorStyle } from "@/lib/validate";
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
  onComplete: (info: { name: string; area: string; whatsapp: string; listed: boolean; lat: number | null; lng: number | null }) => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [area, setArea] = useState(shop.area);
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp);
  const [listed, setListed] = useState(shop.listed);
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({ lat: shop.lat, lng: shop.lng });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [errors, setErrors] = useState<{ name?: string; area?: string; whatsapp?: string }>({});

  const slug = slugify(name);
  const host = typeof window === "undefined" ? "" : window.location.host;

  const validate = (): boolean => {
    const next = {
      name: nameError(name, "Shop name") ?? undefined,
      area: nameError(area, "Area / city") ?? undefined,
      whatsapp: phoneError(whatsapp, { required: false }) ?? undefined,
    };
    setErrors(next);
    return !next.name && !next.area && !next.whatsapp;
  };

  const submit = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({ name: name.trim(), area: area.trim(), whatsapp: whatsapp.trim(), listed, lat: pin.lat, lng: pin.lng });
    } catch (e: any) {
      setError(e?.message || "Could not save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--sage)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", width: 440, maxWidth: "100%", padding: "34px 30px" }}>
        <div className="wordmark" style={{ fontSize: 18, marginBottom: 18 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--forest-deep)", marginBottom: 6 }}>set up your shop</div>
        <p style={{ fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6, margin: "0 0 20px" }}>
          Your shop name becomes your kiosk and storefront link.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">Shop name
            <input value={name} autoFocus maxLength={60} placeholder="e.g. Juju Fashion House" aria-invalid={!!errors.name}
              style={errors.name ? { borderColor: "var(--camel)" } : undefined}
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.name && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.name}</span>}
          </label>
          <label className="field">Area / city
            <input value={area} maxLength={80} placeholder="e.g. New Road, Kathmandu" aria-invalid={!!errors.area}
              style={errors.area ? { borderColor: "var(--camel)" } : undefined}
              onChange={(e) => { setArea(e.target.value); if (errors.area) setErrors((x) => ({ ...x, area: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.area && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.area}</span>}
          </label>
          <label className="field">WhatsApp number
            <input value={whatsapp} maxLength={20} placeholder="e.g. 9779841000000" inputMode="tel" aria-invalid={!!errors.whatsapp}
              style={errors.whatsapp ? { borderColor: "var(--camel)" } : undefined}
              onChange={(e) => { setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, "")); if (errors.whatsapp) setErrors((x) => ({ ...x, whatsapp: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.whatsapp && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.whatsapp}</span>}
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--mut)", marginTop: 4, display: "block" }}>
              Orders arrive here. You can add or change it later in Settings.
            </span>
          </label>
          <div className="field">Pin your shop on the map
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--mut)", margin: "2px 0 8px", display: "block" }}>
              Optional — helps shoppers find you. Tap the map or use your location.
            </span>
            <LocationPicker lat={pin.lat} lng={pin.lng} onChange={(lat, lng) => setPin({ lat, lng })} />
          </div>

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

          <button className="ph-btn btn-solid" disabled={busy} onClick={submit}
            style={{ marginTop: 4, opacity: busy ? 0.55 : 1 }}>
            {busy ? "setting up…" : "open my dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import LocationPicker from "@/components/LocationPicker";
import Dropdown from "@/components/Dropdown";
import { nameError, phoneError, fieldErrorStyle } from "@/lib/validate";
import { SHOP_CATEGORIES, typeForCategory } from "@/lib/constants";
import type { Shop, ShopCategory } from "@/lib/types";

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
  onComplete: (info: { name: string; area: string; whatsapp: string; listed: boolean; type: Shop["type"]; category: ShopCategory; lat: number | null; lng: number | null }) => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [area, setArea] = useState(shop.area);
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp);
  const [listed, setListed] = useState(shop.listed);
  const [category, setCategory] = useState<ShopCategory>(shop.category);
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
      /* Required, not optional: verification happens over a phone call, so a
         shop with no number can't be reviewed and would sit pending forever. */
      whatsapp: phoneError(whatsapp, { required: true }) ?? undefined,
    };
    setErrors(next);
    return !next.name && !next.area && !next.whatsapp;
  };

  const submit = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    setError("");
    try {
      await onComplete({ name: name.trim(), area: area.trim(), whatsapp: whatsapp.trim(), listed, type: typeForCategory(category), category, lat: pin.lat, lng: pin.lng });
    } catch (e: any) {
      setError(e?.message || "Could not save. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="fade-up sheet" style={{ width: 440, maxWidth: "100%", padding: "34px 30px" }}>
        <div className="wordmark" style={{ fontSize: 18, marginBottom: 18 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>
        <div className="ph-display" style={{ fontSize: 26, color: "var(--ink)", marginBottom: 6 }}>set up your shop</div>
        <p style={{ fontSize: 13.5, color: "var(--stone)", lineHeight: 1.6, margin: "0 0 20px" }}>
          We&apos;ll call before going live.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="field">Shop name
            <input value={name} autoFocus maxLength={60} placeholder="e.g. Juju Fashion House" aria-invalid={!!errors.name}
              style={errors.name ? { borderColor: "var(--danger)" } : undefined}
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.name && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.name}</span>}
          </label>
          <label className="field">Area / city
            <input value={area} maxLength={80} placeholder="e.g. New Road, Kathmandu" aria-invalid={!!errors.area}
              style={errors.area ? { borderColor: "var(--danger)" } : undefined}
              onChange={(e) => { setArea(e.target.value); if (errors.area) setErrors((x) => ({ ...x, area: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.area && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.area}</span>}
          </label>
          {/* Drives whether this shop ever sees try-on, via typeForCategory.
              Asked at signup rather than inferred, because it changes what the
              vendor is buying. */}
          {/* A div, not a <label>: it wraps a button now, and a label wrapping a
              button forwards the press it was already given — the list would
              open and shut on the one click. */}
          <div className="field">What do you sell?
            <Dropdown value={category} ariaLabel="What do you sell?"
              onChange={(v) => setCategory(v as ShopCategory)}
              options={SHOP_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)", marginTop: 6, display: "block", lineHeight: 1.5 }}>
              {typeForCategory(category) === "apparel"
                ? "Catalog, kiosk, AI try-on."
                : "Catalog, kiosk, QR tags."}
            </span>
          </div>

          <label className="field">WhatsApp number <span style={{ color: "var(--danger)" }}>*</span>
            <input value={whatsapp} maxLength={20} placeholder="e.g. 9779841000000" inputMode="tel" aria-invalid={!!errors.whatsapp}
              style={errors.whatsapp ? { borderColor: "var(--danger)" } : undefined}
              onChange={(e) => { setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, "")); if (errors.whatsapp) setErrors((x) => ({ ...x, whatsapp: undefined })); }}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {errors.whatsapp && <span style={{ ...fieldErrorStyle, fontWeight: 400, letterSpacing: 0, textTransform: "none", marginTop: 4, display: "block" }}>{errors.whatsapp}</span>}
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)", marginTop: 4, display: "block" }}>
              Orders and verification calls here.
            </span>
          </label>
          <div className="field">Pin on the map
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)", margin: "2px 0 8px", display: "block" }}>
              Optional — tap to place.
            </span>
            <LocationPicker lat={pin.lat} lng={pin.lng} onChange={(lat, lng) => setPin({ lat, lng })} />
          </div>

          {shop.id && slug.length >= 3 && (
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "11px 13px", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.7 }}>
              <div style={{ fontSize: 10.5, letterSpacing: ".14em", color: "var(--stone)", marginBottom: 3 }}>Your links</div>
              <div>Kiosk: <code>{host}/k/{slug}</code></div>
              <div>Storefront: <code>{host}/s/{slug}</code></div>
            </div>
          )}

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
            <input type="checkbox" checked={listed} style={{ marginTop: 3, accentColor: "var(--ink)" }}
              onChange={(e) => setListed(e.target.checked)} />
            <span>Show my shop on peeq</span>
          </label>

          {error && <div style={{ fontSize: 13, color: "var(--danger)" }}>{error}</div>}

          <button className="ph-btn btn-solid" disabled={busy} onClick={submit}
            style={{ marginTop: 4, opacity: busy ? 0.55 : 1 }}>
            {busy ? "submitting…" : "submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}

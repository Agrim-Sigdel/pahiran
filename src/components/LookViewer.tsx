"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { npr } from "@/lib/constants";
import { downloadLook, shareLook, type SavedLook } from "@/lib/looks";

/* Full-page viewer for a saved look — opened by tapping a gallery thumbnail.
   Shared by the kiosk "my looks" overlay and the account page. Tap anywhere
   outside the buttons (or Esc) to close. */
export default function LookViewer({ look, src, onClose, labels }: {
  look: SavedLook;
  src: string; // caller's cached object/signed URL for the image
  onClose: () => void;
  labels?: { save?: string; share?: string };
}) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try { await downloadLook(look); } catch {} finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,23,20,.95)", display: "flex", flexDirection: "column", cursor: "zoom-out" }}>
      <button className="ph-btn" onClick={onClose} aria-label="Close"
        style={{ position: "absolute", top: 12, right: 12, zIndex: 1, background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 15, padding: "9px 11px", borderRadius: 999 }}>
        <Icon name="close" />
      </button>

      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 14px 0" }}>
        <img src={src} alt={"You wearing " + look.garmentName} className="fade-up"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 14, display: "block" }} />
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ padding: "14px 18px 22px", textAlign: "center", cursor: "default" }}>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{look.garmentName}</div>
        <div style={{ color: "rgba(255,255,255,.65)", fontSize: 12.5, marginTop: 2 }}>
          {npr(look.price)}{look.shopName ? " · " + look.shopName : ""}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="ph-btn btn-violet" onClick={save} disabled={saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 24px", fontSize: 14, opacity: saving ? 0.6 : 1 }}>
            <Icon name="point-down" /> {saving ? "…" : labels?.save || "save image"}
          </button>
          <button className="ph-btn" onClick={(e) => { e.stopPropagation(); shareLook(look).catch(() => {}); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 24px", fontSize: 14, fontWeight: 600, color: "#fff", border: "1.5px solid rgba(255,255,255,.5)", borderRadius: 999 }}>
            {labels?.share || "share"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Dialog, { confirmAsync } from "@/components/Dialog";
import { npr } from "@/lib/constants";
import { downloadLook, shareLook, type SavedLook } from "@/lib/looks";
import { toastFailure } from "@/lib/toast";

/* Full-page viewer for a saved look — opened by tapping a gallery thumbnail.
   Shared by the kiosk "my looks" overlay and the account page.

   Closing is by the × or Escape, and deliberately NOT by tapping the photo:
   the whole surface used to be the close button, and tapping a photo is what
   people do to look *closer* at one. Shoppers opened a look, tapped it to
   zoom, and it vanished. The backdrop around the image still closes. */
export default function LookViewer({ look, src, onClose, onDelete, labels }: {
  look: SavedLook;
  src: string; // caller's cached object/signed URL for the image
  onClose: () => void;
  /* Deciding you don't want a look happens while you're looking at it. Without
     this the shopper has to close, find the thumbnail again and hit a small
     link under it. Omit to hide the button. */
  onDelete?: () => void | Promise<void>;
  labels?: { save?: string; share?: string; del?: string; confirmDelete?: string; cancel?: string };
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await downloadLook(look); }
    catch (e) { toastFailure("Could not save that image", e); }
    finally { setSaving(false); }
  };

  return (
    <Dialog variant="full" onClose={onClose} ariaLabel={"You wearing " + look.garmentName} hideHeader
      scrimStyle={{ background: "rgba(26,23,20,.95)" }}
      panelStyle={{ background: "transparent" }}>
      <button className="ph-btn" onClick={onClose} aria-label="Close"
        style={{ position: "absolute", top: 12, right: 12, zIndex: 1, background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 15, padding: "9px 11px", borderRadius: "var(--radius-pill)" }}>
        <Icon name="close" />
      </button>

      {/* the image is inert — see the note above */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 14px 0" }}>
        {/* No img-blend here: this is the "view larger" for a saved look, and
            feathering the edges of a picture someone opened to inspect hides
            the part they zoomed in for. Blending is for photos sitting in the
            page; a zoom view is the photo on its own. */}
        <img src={src} alt={"You wearing " + look.garmentName} className="fade-up"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "var(--radius-lg)", display: "block" }} />
      </div>

      <div style={{ padding: "14px 18px 22px", textAlign: "center", flexShrink: 0 }}>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{look.garmentName}</div>
        <div style={{ color: "rgba(255,255,255,.65)", fontSize: 12.5, marginTop: 2 }}>
          {npr(look.price)}{look.shopName ? " · " + look.shopName : ""}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="ph-btn btn-violet" onClick={save} disabled={saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 24px", fontSize: 14, opacity: saving ? 0.6 : 1 }}>
            <Icon name="download" /> {saving ? "…" : labels?.save || "save image"}
          </button>
          <button className="ph-btn" onClick={() => { shareLook(look).catch(() => toastFailure("Could not share that look")); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 24px", fontSize: 14, fontWeight: 600, color: "#fff", border: "1.5px solid rgba(255,255,255,.5)", borderRadius: "var(--radius-pill)" }}>
            <Icon name="share" /> {labels?.share || "share"}
          </button>
        </div>
        {/* Deliberately below the other two and quieter than them: deleting is
            the one action here that can't be taken back, so it shouldn't sit at
            thumb height next to the one people press most. */}
        {onDelete && (
          <button className="ph-btn" disabled={deleting}
            onClick={async () => {
              const ok = await confirmAsync({
                title: labels?.del || "Delete this look?",
                body: labels?.confirmDelete || "Delete this look? This can't be undone.",
                confirmLabel: labels?.del || "delete", cancelLabel: labels?.cancel || "cancel",
                destructive: true,
              });
              if (!ok) return;
              setDeleting(true);
              try {
                await onDelete();
              } catch (e) {
                toastFailure("Could not delete that look", e);
                setDeleting(false); // stay open so the shopper can retry
                return;
              }
              onClose(); // last: this unmounts us, so nothing may set state after it
            }}
            style={{ marginTop: 12, color: "rgba(255,255,255,.72)", fontSize: 12.5, padding: "6px 12px", textDecoration: "underline", textUnderlineOffset: 3, opacity: deleting ? 0.5 : 1 }}>
            {deleting ? "…" : labels?.del || "delete this look"}
          </button>
        )}
      </div>
    </Dialog>
  );
}

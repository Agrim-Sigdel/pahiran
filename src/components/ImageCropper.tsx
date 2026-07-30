"use client";

import { useRef, useState } from "react";
import Dialog from "@/components/Dialog";
import { cropToCompressedDataURL, type CropRect } from "@/lib/images";

/* Crop before upload, not after.

   A bolt photographed on a counter arrives with counter in it, and everything
   downstream then treats that counter as part of the product: it goes into the
   catalog card, it goes to the image model as "the cloth this must be stitched
   from", and it goes into the colour reader as pixels of the fabric. Cropping
   afterwards fixes none of that, because by then the wrong picture is the one
   every stitched preview was made from.

   Deliberately no aspect ratio. A bolt is a rectangle of unknown proportion, a
   stitched sample is usually tall, a swatch is square; forcing any one of
   those crops away cloth the vendor meant to keep. The card layouts already
   cover their frames, so an odd shape costs nothing.

   Skippable, always. A vendor with a queue at the counter must be able to
   press past this, and a photo that already fills the frame with weave needs
   no crop at all. */

/** Fraction of the frame the crop can't go below — small enough for one motif,
    large enough that a stray drag can't produce an empty picture. */
const MIN = 0.08;

type Drag =
  | { mode: "move"; px: number; py: number; start: CropRect }
  | { mode: "resize"; corner: "nw" | "ne" | "sw" | "se"; px: number; py: number; start: CropRect }
  | null;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function ImageCropper({
  src, title = "Crop the photo", hint, confirmLabel = "Use this", onCancel, onDone,
}: {
  /** The full-size photo, straight off the file input. */
  src: string;
  title?: string;
  hint?: string;
  confirmLabel?: string;
  onCancel: () => void;
  /** Receives the cropped, compressed image — ready to store. */
  onDone: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState<CropRect>({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<Drag>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  /* Pointer deltas arrive in pixels and the crop is kept in fractions, so
     every move divides by the frame's current size. Measured per event rather
     than cached, so a mid-drag reflow can't leave the box tracking a size the
     frame no longer has. */
  const frameSize = () => {
    const r = frameRef.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null;
  };

  const begin = (e: React.PointerEvent, make: (px: number, py: number) => Drag) => {
    const f = frameSize();
    if (!f) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = make(e.clientX / f.w, e.clientY / f.h);
  };

  const startMove = (e: React.PointerEvent) =>
    begin(e, (px, py) => ({ mode: "move", px, py, start: crop }));

  const startResize = (corner: "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.stopPropagation(); // a corner drag is a resize, never also a move
    begin(e, (px, py) => ({ mode: "resize", corner, px, py, start: crop }));
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const f = frameSize();
    if (!d || !f) return;
    /* Only the delta is used, so it doesn't matter that clientX is measured
       from the viewport rather than the frame — the origin cancels. */
    const dx = e.clientX / f.w - d.px;
    const dy = e.clientY / f.h - d.py;

    if (d.mode === "move") {
      // Clamped as a whole box: sliding it into an edge stops it there rather
      // than letting the far side run off-picture.
      setCrop({
        ...d.start,
        x: Math.max(0, Math.min(1 - d.start.w, d.start.x + dx)),
        y: Math.max(0, Math.min(1 - d.start.h, d.start.y + dy)),
      });
      return;
    }

    const s = d.start;
    let { x, y, w, h } = s;
    if (d.corner === "nw" || d.corner === "sw") {
      const nx = clamp01(Math.min(s.x + dx, s.x + s.w - MIN));
      w = s.x + s.w - nx;
      x = nx;
    } else {
      w = Math.max(MIN, Math.min(1 - s.x, s.w + dx));
    }
    if (d.corner === "nw" || d.corner === "ne") {
      const ny = clamp01(Math.min(s.y + dy, s.y + s.h - MIN));
      h = s.y + s.h - ny;
      y = ny;
    } else {
      h = Math.max(MIN, Math.min(1 - s.y, s.h + dy));
    }
    setCrop({ x, y, w, h });
  };

  const endDrag = () => { drag.current = null; };

  const finish = async (rect: CropRect) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await cropToCompressedDataURL(src, rect));
    } catch {
      setError("Could not read that image. Try a JPG or PNG.");
      setBusy(false);
    }
  };

  const handle = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", width: 26, height: 26, borderRadius: "50%",
    background: "var(--card)", border: "2px solid var(--ink)",
    touchAction: "none", cursor: "grab", ...pos,
  });

  return (
    <Dialog onClose={onCancel} hideHeader width={520} ariaLabel={title}
      closeOnBackdrop={!busy}
      panelStyle={{ padding: "24px 22px 22px" }}>
      <>
        <div className="ph-display" style={{ fontSize: 21, color: "var(--ink)", marginBottom: hint ? 3 : 14 }}>
          {title}
        </div>
        {hint && (
          <div style={{ fontSize: 12.5, color: "var(--stone)", marginBottom: 14, lineHeight: 1.6 }}>
            {hint}
          </div>
        )}

        {/* The frame shrink-wraps the picture — inline-block with the image
            free to size itself — so the frame's rect *is* the image's rect.
            Sized any other way, a tall photo letterboxes inside a full-width
            box and every crop fraction then measures against grey bars the
            vendor can see they didn't select.

            touchAction none throughout: on a phone every drag here would
            otherwise scroll the dialog instead of moving the crop. */}
        <div style={{ textAlign: "center" }}>
        <div ref={frameRef}
          onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          style={{ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0, borderRadius: "var(--radius-sm)", overflow: "hidden", touchAction: "none", userSelect: "none" }}>
          <img src={src} alt="" draggable={false}
            style={{ display: "block", maxWidth: "100%", maxHeight: "56vh", width: "auto", height: "auto" }} />

          {/* One element does the window and the shade: an enormous spread
              shadow darkens everything outside the box, so the two can never
              drift out of step the way four separate panels would. */}
          <div onPointerDown={startMove}
            style={{
              position: "absolute",
              left: crop.x * 100 + "%", top: crop.y * 100 + "%",
              width: crop.w * 100 + "%", height: crop.h * 100 + "%",
              border: "1.5px solid var(--card)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,.55)",
              cursor: "move", touchAction: "none",
            }}>
            <span style={handle({ left: -13, top: -13, cursor: "nwse-resize" })} onPointerDown={startResize("nw")} />
            <span style={handle({ right: -13, top: -13, cursor: "nesw-resize" })} onPointerDown={startResize("ne")} />
            <span style={handle({ left: -13, bottom: -13, cursor: "nesw-resize" })} onPointerDown={startResize("sw")} />
            <span style={handle({ right: -13, bottom: -13, cursor: "nwse-resize" })} onPointerDown={startResize("se")} />
          </div>
        </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="ph-btn btn-solid" disabled={busy} onClick={() => finish(crop)}
            style={{ flex: 2, minWidth: 140, padding: 13, fontSize: 12, letterSpacing: ".06em" }}>
            {busy ? "cropping…" : confirmLabel}
          </button>
          {/* Not a cancel — this keeps the photo, whole. A vendor whose shot
              already fills the frame with weave shouldn't have to draw a box
              around all of it to get past this. */}
          <button className="ph-btn" disabled={busy}
            onClick={() => finish({ x: 0, y: 0, w: 1, h: 1 })}
            style={{ flex: 1, minWidth: 120, padding: 13, fontSize: 12, letterSpacing: ".06em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", color: "var(--ink)", fontWeight: 500 }}>
            use whole photo
          </button>
          <button className="ph-btn" disabled={busy} onClick={onCancel}
            style={{ padding: 13, fontSize: 12, letterSpacing: ".06em", color: "var(--stone)", fontWeight: 500 }}>
            cancel
          </button>
        </div>
      </>
    </Dialog>
  );
}

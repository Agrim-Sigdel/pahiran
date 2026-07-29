"use client";

import { useEffect, useRef, useState } from "react";
import { FABRIC_COLORS } from "@/lib/constants";
import { sampleImageHex } from "@/lib/color-detect";
import Icon from "@/components/Icon";

/* ── our own colour picker ──

   This replaced `<input type="color">`, which was never going to do this job.
   The native control opens the operating system's picker: a desktop dialog on
   a phone-first app, different on every device the shop might hold, unstyled by
   anything in globals.css, and — the part that actually mattered — with no way
   to put the fabric photo or the shop's palette anywhere near the wheel. A
   vendor correcting "the photo read this orange, the bolt is maroon" wants both
   in reach.

   Six controls, no prose: the wheel, how dark it is, the exact hex, our own
   twenty-one colours, the bolt's photo to sample from, and a way back. What the
   shade will be *filed* as is not repeated here — the row this panel opens
   under already says it, in a dropdown that can change it.

   The wheel is exact HSV, drawn in CSS rather than a canvas:

     hue         a conic gradient through the six primaries at 60° steps, which
                 is not an approximation — the HSV hue ramp at S=V=1 *is*
                 piecewise linear between them.
     saturation  white at the centre fading to transparent at the rim. HSV with
                 V=1 is the hue blended toward white by (1 - S), and the radial
                 gradient's alpha falls off as exactly 1 - r/R.
     value       black over the top at (1 - V), which is what multiplying RGB by
                 V amounts to.

   Which means no canvas, no repaint on every drag frame, and a wheel that stays
   sharp on a cheap phone's screen and a retina one alike. */

type Hsv = { h: number; s: number; v: number };

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** "6E1B24", "#6e1b24", "#abc" → "#6e1b24". Null for anything else, which is
    what lets the hex field accept half-typed input without fighting the user. */
export function normalizeHex(input: string): string | null {
  const t = input.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(t);
  if (short) {
    const [r, g, b] = short[1].split("");
    return ("#" + r + r + g + g + b + b).toLowerCase();
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(t);
  return full ? "#" + full[1].toLowerCase() : null;
}

function hexToHsv(hex: string): Hsv {
  const h = normalizeHex(hex) ?? "#cccccc";
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  return { h: hue < 0 ? hue + 360 : hue, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const ch = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + ch(5) + ch(3) + ch(1);
}

const HUE_RING =
  "conic-gradient(from 0deg, #ff0000, #ffff00 60deg, #00ff00 120deg, " +
  "#00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg)";
const SAT_FADE = "radial-gradient(circle closest-side, #ffffff, rgba(255,255,255,0))";

/* How far the wheel can be darkened. It has to track the brightness or the
   wheel and the shade under the handle visibly disagree — the thing that reads
   as the picker "not taking the colour". It also cannot go all the way, or the
   bottom of the slider leaves a black disc and a vendor hunting a deep maroon
   is aiming at nothing. */
const DIM_MAX = 0.82;

/** How far one arrow key moves, and how far one with shift held. */
const STEP = { hue: 3, hueBig: 15, sat: 0.03, satBig: 0.12 };

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, flexShrink: 0, fontSize: 15,
  borderRadius: "var(--radius-field)", border: "1px solid var(--line)",
  background: "var(--card)", color: "var(--stone)", padding: 0, cursor: "pointer",
};

export default function ColorWheel({ hex, onChange, image, onDone }: {
  /** The shade being edited. Anything unparseable is treated as light grey. */
  hex: string;
  onChange: (hex: string) => void;
  /** The bolt photo, enabling sample-from-the-picture. Null where there is no
      photo, or where the photo is the thing being called wrong — sampling a
      tube-lit picture only re-reads the error it is there to correct. */
  image?: string | null;
  /** Rendered as a "done" button when given — the picker opens inline, so
      something has to close it. */
  onDone?: () => void;
}) {
  /* Hue and saturation are held here rather than re-derived from the hex on
     every render, because the hex cannot carry them at the edges: every shade
     at brightness zero is #000000, and every unsaturated one has no hue at all.
     Without this, dragging the brightness slider to the bottom would lose the
     colour the vendor had just spent ten seconds finding, and pulling it back
     up would return black. */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(hex));
  /** The last hex we sent out, so an echo of our own value doesn't reset the
      hue and saturation we are deliberately holding on to. */
  const emitted = useRef(hex);
  /** What the picker was opened on, for "put it back". */
  const opened = useRef(normalizeHex(hex) ?? "#cccccc");
  /* What is in the hex field while it is being typed in. It has to be separate
     from the colour: a field bound straight to the current shade cannot be
     edited at all, because every keystroke that isn't yet a whole valid hex is
     rejected and the field snaps back — deleting one character puts it
     straight back. Null means "not mid-edit, show the real value". */
  const [typed, setTyped] = useState<string | null>(null);

  useEffect(() => {
    if (normalizeHex(hex) === normalizeHex(emitted.current)) return;
    emitted.current = hex;
    setHsv(hexToHsv(hex));
  }, [hex]);

  const push = (next: Hsv) => {
    setHsv(next);
    // Any change from the wheel, the slider or the palette ends the edit in the
    // hex field — leaving it stale would show one colour and mean another.
    setTyped(null);
    const out = hsvToHex(next);
    emitted.current = out;
    onChange(out);
  };

  /** A hex from outside the wheel — typed, tapped off the palette, or sampled
      from the photo. Hue and saturation are kept where the colour is too dark
      or too grey to imply them, so the wheel handle doesn't jump to red the
      moment someone picks black. */
  const pushHex = (h: string) => {
    const next = hexToHsv(h);
    push({
      h: next.s === 0 || next.v === 0 ? hsv.h : next.h,
      s: next.v === 0 ? hsv.s : next.s,
      v: next.v,
    });
  };

  const current = hsvToHex(hsv);

  /* ── the wheel ── */
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const readWheel = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    // Angle clockwise from twelve o'clock, matching the conic gradient's own
    // zero — read any other way the handle sits somewhere the colour isn't.
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    push({ ...hsv, h: deg, s: clamp01(Math.hypot(dx, dy) / (Math.min(r.width, r.height) / 2)) });
  };

  const onKey = (e: React.KeyboardEvent) => {
    const big = e.shiftKey;
    const d = { h: 0, s: 0 };
    if (e.key === "ArrowRight") d.h = big ? STEP.hueBig : STEP.hue;
    else if (e.key === "ArrowLeft") d.h = -(big ? STEP.hueBig : STEP.hue);
    else if (e.key === "ArrowUp") d.s = big ? STEP.satBig : STEP.sat;
    else if (e.key === "ArrowDown") d.s = -(big ? STEP.satBig : STEP.sat);
    else return;
    e.preventDefault();
    push({ ...hsv, h: (hsv.h + d.h + 360) % 360, s: clamp01(hsv.s + d.s) });
  };

  const rad = (hsv.h * Math.PI) / 180;

  /* ── the photo eyedropper ──
     A vendor cannot pick "the navy of this bolt" off a wheel from memory, but
     they can put a finger on it in the photo of the bolt in their hand. */
  const [sampling, setSampling] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  /* What is under the pointer, in pixels from the image's top-left. Sampling
     only on release made this a guessing game: the shade taken is the average
     of a small patch rather than the one pixel under the crosshair, and on a
     phone the finger covers the very thing it is aiming at. The loupe answers
     both — it shows the patch the tap would take, above the finger, where it
     can be seen. */
  const [over, setOver] = useState<{ x: number; y: number; hex: string } | null>(null);

  /** One reader for the loupe and for the tap, so what is shown is exactly what
      gets taken. Two paths here would drift by a pixel and the vendor would be
      picking one colour and getting another. */
  const readImage = (host: HTMLElement, clientX: number, clientY: number) => {
    const el = host.querySelector("img");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = sampleImageHex(el, (clientX - r.left) / r.width, (clientY - r.top) / r.height);
    return hit ? { x: clientX - r.left, y: clientY - r.top, hex: hit } : null;
  };

  const takeFromPhoto = (e: React.MouseEvent<HTMLButtonElement>) => {
    const hit = readImage(e.currentTarget, e.clientX, e.clientY);
    if (hit) pushHex(hit.hex);
    setSampling(false);
    setOver(null);
  };

  /* Touch as well as mouse: this is a phone app first, and on a phone there is
     no hover to preview with. The finger goes down, drags to the right thread
     of the weave, and lifts — touchmove keeps the loupe under it the whole way,
     and the click that follows the lift takes the colour. */
  const trackMouse = (e: React.MouseEvent<HTMLButtonElement>) =>
    setOver(readImage(e.currentTarget, e.clientX, e.clientY));
  const trackTouch = (e: React.TouchEvent<HTMLButtonElement>) => {
    const t = e.touches[0];
    if (t) setOver(readImage(e.currentTarget, t.clientX, t.clientY));
  };

  const canSample = Boolean(image) && !imgBroken;
  const changed = normalizeHex(current) !== opened.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, padding: 12, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-field)" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div ref={wheelRef} tabIndex={0} role="group" onKeyDown={onKey}
          aria-label={"Colour wheel, currently " + current
            + ". Arrow keys change the shade — left and right for the colour, up and down for how strong it is."}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            readWheel(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => { if (dragging.current) readWheel(e.clientX, e.clientY); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          style={{
            position: "relative", width: "min(100%, 196px)", aspectRatio: "1",
            borderRadius: "50%", background: SAT_FADE + ", " + HUE_RING,
            boxShadow: "inset 0 0 0 1px var(--line-strong)",
            // Without this the browser claims the drag as a page scroll on the
            // first vertical pixel, and the wheel is unusable on a phone.
            touchAction: "none", cursor: "crosshair",
          }}>
          <span aria-hidden style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "#000", opacity: Math.min(1 - hsv.v, DIM_MAX),
            pointerEvents: "none",
          }} />
          <span aria-hidden style={{
            position: "absolute",
            left: (50 + hsv.s * Math.sin(rad) * 50) + "%",
            top: (50 - hsv.s * Math.cos(rad) * 50) + "%",
            width: 22, height: 22, marginLeft: -11, marginTop: -11,
            borderRadius: "50%", background: current,
            border: "2.5px solid #fff", pointerEvents: "none",
            boxShadow: "0 0 0 1px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.35)",
          }} />
        </div>
      </div>

      <input type="range" min={0} max={100} className="cw-range" aria-label="How light or dark"
        value={Math.round(hsv.v * 100)}
        onChange={(e) => push({ ...hsv, v: Number(e.target.value) / 100 })}
        style={{ background: "linear-gradient(90deg, #000, " + hsvToHex({ ...hsv, v: 1 }) + ")" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "var(--radius-field)", background: current, border: "1px solid var(--line-strong)" }} />
        <input value={typed ?? current} maxLength={7} spellCheck={false}
          aria-label="Colour as a hex value" inputMode="text"
          onChange={(e) => {
            const raw = e.target.value;
            /* Six digits only while typing. Three-digit shorthand is a real
               colour, so honouring it here means "#1e2a47" flashes the wheel
               bright green as it passes through "#1e2" on its way to navy.
               Blur takes it, which is where someone typing "#fff" ends up. */
            if (/^#?[0-9a-f]{6}$/i.test(raw.trim())) pushHex(normalizeHex(raw)!);
            // Set after pushHex, which clears it — the field has to keep
            // showing what was typed for as long as it is being typed.
            setTyped(raw);
          }}
          onBlur={() => {
            const n = normalizeHex(typed ?? "");
            if (n) pushHex(n);
            setTyped(null);
          }}
          style={{ flex: 1, minWidth: 0, padding: "9px 11px", fontSize: 14, fontFamily: "ui-monospace, monospace", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", letterSpacing: 0, textTransform: "none", fontWeight: 400 }} />

        {canSample && !sampling && (
          <button type="button" onClick={() => { setOver(null); setSampling(true); }}
            aria-label="Take a colour from the photo"
            title="Take a colour from the photo" style={iconBtn}>
            <Icon name="camera" />
          </button>
        )}
        {changed && (
          <button type="button" onClick={() => pushHex(opened.current)}
            aria-label={"Put it back to " + opened.current}
            title={"Put it back to " + opened.current} style={iconBtn}>
            <Icon name="reset" />
          </button>
        )}
      </div>

      {canSample && sampling && (
        <button type="button" onClick={takeFromPhoto}
          onMouseMove={trackMouse} onMouseLeave={() => setOver(null)}
          onTouchStart={trackTouch} onTouchMove={trackTouch} onTouchEnd={() => setOver(null)}
          aria-label="Drag over the cloth and lift to take its colour"
          style={{ position: "relative", padding: 0, border: "1px solid var(--line)", borderRadius: "var(--radius-field)", background: "none", lineHeight: 0, cursor: "crosshair", overflow: "hidden", display: "block", alignSelf: "center", maxWidth: "100%", touchAction: "none" }}>
          {/* Stored photos are cross-origin; without this the canvas is tainted
              and the pixels cannot be read at all. */}
          <img src={image!} alt="" crossOrigin="anonymous"
            onError={() => { setImgBroken(true); setSampling(false); }}
            style={{ maxWidth: "100%", maxHeight: 180, width: "auto", display: "block" }} />
          {over && (
            <>
              {/* The ring sits on the spot, the reading floats above it and out
                  from under the finger. Both are inert to pointer events, or
                  the loupe eats the tap it exists to aim. */}
              <span aria-hidden style={{
                position: "absolute", left: over.x, top: over.y, width: 26, height: 26,
                marginLeft: -13, marginTop: -13, borderRadius: "50%",
                background: over.hex, border: "2px solid #fff", pointerEvents: "none",
                boxShadow: "0 0 0 1px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.35)",
              }} />
              <span aria-hidden style={{
                position: "absolute", left: over.x, top: over.y - 22,
                transform: "translate(-50%, -100%)", pointerEvents: "none",
                background: "rgba(26,23,20,.92)", color: "#fff",
                fontSize: 11, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap",
                fontFamily: "ui-monospace, monospace",
                padding: "6px 8px", borderRadius: "var(--radius-btn)",
              }}>
                {over.hex}
              </span>
            </>
          )}
        </button>
      )}

      {/* Straight to a palette colour, because most of the time the answer is
          simply "navy" and making someone hunt for it on a wheel is a worse
          question than the dropdown ever was. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {FABRIC_COLORS.map((p) => {
          const on = normalizeHex(p.hex) === normalizeHex(current);
          return (
            <button key={p.id} type="button" title={p.label} aria-label={p.label}
              aria-pressed={on} onClick={() => pushHex(p.hex)}
              style={{
                width: 26, height: 26, borderRadius: "50%", background: p.hex,
                border: on ? "2px solid var(--ink)" : "1px solid var(--line-strong)",
                boxShadow: on ? "0 0 0 2px var(--card) inset" : "none",
                padding: 0, cursor: "pointer", flexShrink: 0,
              }} />
          );
        })}
      </div>

      {onDone && (
        <button type="button" className="ph-btn" onClick={onDone}
          style={{ alignSelf: "flex-end", fontSize: 11.5, fontWeight: 600, color: "var(--card)", background: "var(--ink)", borderRadius: "var(--radius-btn)", padding: "6px 16px", minHeight: 30 }}>
          done
        </button>
      )}
    </div>
  );
}

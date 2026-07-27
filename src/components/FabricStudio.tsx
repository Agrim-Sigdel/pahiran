"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FAMILIES, npr, fabricPrice, familyLabel } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import EeMark from "@/components/EeMark";
import Icon from "@/components/Icon";
import { COVERAGES, staleReason } from "@/lib/types";
import type { Composition, Fabric, Style, StyleCoverage, StyleFamily } from "@/lib/types";

/* The fabric studio: pick the cuts this cloth gets stitched into, render them,
   review them, publish them.

   Everything here is vendor-authored on purpose. A shopper only ever sees a
   combination a human chose, priced and published — which is what stops the
   catalog filling up with cuts the tailor can't actually make. */

const SUGGESTED = 3; // most shops stitch a handful of cuts in any given cloth
const MAX_BATCH = 8; // matches the server cap; past this it's noise, not catalog

/* Same voice as the kiosk's try-on copy — this is peeq working, and it should
   sound like peeq whichever side of the counter you're on. The verbs are the
   tailor's rather than the photographer's, because that's the work being
   described here. */
export const STITCH_MESSAGES = [
  "Kapada kaatdai...",
  "Naap milaudai...",
  "Silai gardai...",
  "Buttaa ra border milaudai...",
  "Sana sana details milaudai...",
  "Almost tayar!",
  "La, sakinai lagyo, ahha la daami cha",
];
const STITCH_FOOTER = "harek cut lai aadha minute jati — pheri load garnu pardaina";
/* Once the wait runs long, say so. Silence is what turns a slow render into a
   render the vendor assumes has failed. */
const STITCH_SLOW = "ali dhilo bhairacha — banirahecha, nabandanus hai";

interface Props {
  fabric: Fabric;
  styles: Style[];
  compositions: Composition[];
  onClose: () => void;
  onCompose: (styleIds: string[]) => Promise<void>;
  onCreateStyle: (s: {
    name: string;
    family: StyleFamily;
    hint: string;
    coverage: StyleCoverage;
    refImage: string | null;
  }) => Promise<void>;
  onUpdateStyle: (s: Style) => Promise<void>;
  onPublish: (id: string, published: boolean) => void;
  onPrice: (id: string, price: number) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
}

export default function FabricStudio({
  fabric, styles, compositions, onClose, onCompose, onCreateStyle, onUpdateStyle,
  onPublish, onPrice, onNote, onRemove,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* One form, three jobs. "copy" exists because a library cut cannot be
     edited — it belongs to every shop — so wanting to change one really means
     wanting your own version of it. */
  const [cutForm, setCutForm] = useState<
    { mode: "new" | "edit" | "copy"; style?: Style } | null
  >(null);

  // Only cuts that belong to this cloth's family — a lehenga silhouette has
  // nothing to say about a suit length.
  const cuts = useMemo(
    () => styles.filter((s) => s.family === fabric.family),
    [styles, fabric.family]
  );

  const byStyle = useMemo(() => {
    const m = new Map<string, Composition>();
    for (const c of compositions) if (c.styleId) m.set(c.styleId, c);
    return m;
  }, [compositions]);

  const rendered = compositions.filter((c) => c.status === "ready");
  /* A cut counts as done only while its render still matches its note. Edit
     the note and it becomes pickable again, which is how a re-stitch is
     asked for — no separate mode, the same button as the first time. */
  const done = (styleId: string): boolean => {
    const c = byStyle.get(styleId);
    return !!c && c.status === "ready" && !staleReason(c, styles.find((s) => s.id === styleId));
  };
  const unrendered = cuts.filter((c) => !done(c.id));

  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= MAX_BATCH ? cur : [...cur, id]
    );

  const pickSuggested = () => setPicked(unrendered.slice(0, SUGGESTED).map((c) => c.id));

  const run = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onCompose(picked);
      setPicked([]);
    } catch (e: any) {
      setError(e?.message || "Could not render — please try again.");
    }
    setBusy(false);
  };

  return (
    <div onClick={busy ? undefined : onClose}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 55, padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up sheet"
        style={{ width: 760, maxWidth: "100%", margin: "24px 0", padding: "26px 26px 30px" }}>

        {/* ── the cloth ── */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
          <img src={fabric.image} alt={fabric.name}
            style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--sage-mist)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {fabric.itemCode && (
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".08em", color: "var(--camel)" }}>{fabric.itemCode}</div>
            )}
            <div className="ph-display" style={{ fontSize: 23, color: "var(--forest-deep)", lineHeight: 1.25 }}>{fabric.name}</div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 3 }}>
              {[familyLabel(fabric.family), fabric.composition, fabric.color].filter(Boolean).join(" · ")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--camel)", fontWeight: 500, marginTop: 3 }}>
              {fabricPrice(fabric.price, fabric.unit)}
            </div>
          </div>
          <button className="ph-btn" onClick={onClose} disabled={busy}
            style={{ color: "var(--mut)", fontSize: 12, padding: "4px 8px" }}>close</button>
        </div>

        {!fabric.note && (
          <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 13px", marginBottom: 18, fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
            No note on this cloth yet. Editing the fabric to say where a border sits, or how
            heavily it drapes, makes every render below noticeably more accurate.
          </div>
        )}

        {/* ── pick the cuts ── */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <div className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)" }}>stitch this into</div>
          <button className="ph-btn" onClick={() => setCutForm({ mode: "new" })} disabled={busy}
            style={{ fontSize: 12, color: "var(--forest-deep)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
            + add your own cut
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 12, lineHeight: 1.6 }}>
          Pick only the cuts you'd actually stitch in this cloth — each one is a render, and
          each render is a promise your tailor has to keep.
        </div>

        {cuts.length === 0 ? (
          <div style={{ color: "var(--mut)", fontSize: 13, padding: "18px 0" }}>
            No cuts for {familyLabel(fabric.family)} yet — add one to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
            {cuts.map((c) => {
              const isDone = done(c.id);
              const on = picked.includes(c.id);
              /* Which pieces this cut makes, said on the chip. Without it the
                 vendor cannot tell "Kurtha" the top from "Kurtha" the set
                 until a render comes back half an outfit short. */
              const cov = COVERAGES.find((x) => x.id === c.coverage);
              const mine = !!c.shopId;
              /* Two buttons side by side rather than one inside the other —
                 picking a cut and changing it are different acts, and a button
                 cannot legally contain a button. */
              return (
                <span key={c.id} style={{
                  display: "inline-flex", alignItems: "stretch", borderRadius: "var(--radius-btn)",
                  border: "1px solid " + (on ? "var(--forest)" : "var(--line)"), overflow: "hidden",
                  opacity: isDone ? 0.65 : 1,
                }}>
                  <button type="button" className="ph-btn" disabled={busy || isDone}
                    onClick={() => toggle(c.id)}
                    title={isDone ? "Already stitched below" : c.hint || c.name}
                    style={{
                      padding: "8px 13px", fontSize: 12, fontWeight: 500, border: "none",
                      background: isDone ? "var(--sage-mist)" : on ? "var(--forest)" : "var(--sage)",
                      color: isDone ? "var(--mut)" : on ? "var(--cream)" : "var(--forest-deep)",
                      cursor: isDone ? "default" : "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    {c.name}
                    {cov && (
                      <span style={{ fontSize: 9.5, letterSpacing: ".06em", opacity: 0.7, textTransform: "uppercase" }}>
                        {c.coverage === "set" ? "set" : c.coverage}
                      </span>
                    )}
                    {mine && <span style={{ fontSize: 9.5, letterSpacing: ".08em", opacity: 0.75 }}>YOURS</span>}
                    {isDone && <Icon name="check" />}
                  </button>
                  <button type="button" className="ph-btn" disabled={busy}
                    onClick={() => setCutForm({ mode: mine ? "edit" : "copy", style: c })}
                    title={mine ? "Change this cut" : "Library cut — take a copy you can change"}
                    aria-label={mine ? "Change " + c.name : "Copy " + c.name}
                    style={{
                      padding: "0 9px", fontSize: 11, border: "none",
                      borderLeft: "1px solid " + (on ? "rgba(255,255,255,.3)" : "var(--line)"),
                      background: isDone ? "var(--sage-mist)" : on ? "var(--forest)" : "var(--sage)",
                      color: on ? "var(--cream)" : "var(--mut)", cursor: "pointer",
                    }}>
                    <Icon name={mine ? "edit" : "copy"} />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <button className="ph-btn btn-solid" disabled={busy || picked.length === 0} onClick={run}
            style={{ padding: "11px 22px", fontSize: 12, opacity: busy || picked.length === 0 ? 0.5 : 1 }}>
            {busy ? "stitching…" : picked.length ? `stitch ${picked.length} cut${picked.length !== 1 ? "s" : ""}` : "stitch"}
          </button>
          {unrendered.length > 0 && !busy && (
            <button className="ph-btn" onClick={pickSuggested}
              style={{ fontSize: 12, color: "var(--forest-deep)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              pick {Math.min(SUGGESTED, unrendered.length)} for me
            </button>
          )}
          {picked.length >= MAX_BATCH && (
            <span style={{ fontSize: 11.5, color: "var(--mut)" }}>{MAX_BATCH} at a time is the limit.</span>
          )}
        </div>
        {error && (
          <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8 }}>{error}</div>
        )}

        {/* ── what's been made ── */}
        {compositions.length > 0 && (
          <>
            <div className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)", margin: "26px 0 4px" }}>
              stitched previews
            </div>
            <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 13, lineHeight: 1.6 }}>
              Check each one before publishing. Shoppers only see what you publish — and these
              are previews, not photographs, so pattern placement is close, not exact.
            </div>
            <div className="studio-grid">
              {compositions.map((c) => (
                <RenderCard key={c.id} composition={c}
                  style={styles.find((s) => s.id === c.styleId)}
                  busy={busy}
                  onPublish={onPublish} onPrice={onPrice} onNote={onNote} onRemove={onRemove}
                  onRestitch={c.styleId ? () => onCompose([c.styleId as string]) : undefined} />
              ))}
            </div>
          </>
        )}

        {compositions.length === 0 && !busy && (
          <div style={{ marginTop: 22, padding: "22px 18px", background: "var(--sage)", border: "1px dashed var(--line)", borderRadius: 6, textAlign: "center", color: "var(--mut)", fontSize: 12.5, lineHeight: 1.7 }}>
            Nothing stitched from this cloth yet.<br />
            Pick a cut or two above — three is usually plenty to start.
          </div>
        )}

        {rendered.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 11.5, color: "var(--mut)" }}>
            {rendered.filter((c) => c.published).length} of {rendered.length} published
          </div>
        )}
      </div>

      {busy && (
        <StitchingOverlay image={fabric.image} steps={picked.length}
          caption={fabric.name + " · " + picked.length + " cut" + (picked.length !== 1 ? "s" : "")} />
      )}

      {cutForm && (
        <CutModal
          family={fabric.family}
          mode={cutForm.mode}
          initial={cutForm.style}
          onClose={() => setCutForm(null)}
          onSave={async (s) => {
            /* A copy saves as a brand-new shop cut, so the library one is left
               exactly as every other shop still sees it. */
            if (cutForm.mode === "edit" && cutForm.style) {
              await onUpdateStyle({ ...cutForm.style, ...s });
            } else {
              await onCreateStyle(s);
            }
            setCutForm(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------- stitching overlay: peeq is at the machine ----------
   Deliberately the same shape as the kiosk's generating overlay — the ee
   blinks over the dimmed subject, the copy rotates, and the bar eases toward
   a finish it never claims to reach. There the subject is the shopper's
   photo; here it is the cloth, because the cloth is what's being worked on.
   No spinners on either side of the counter.

   Exported because the counter waits on the same machines for the same cloth
   and deserves the same wait; it passes its own copy and its own step count. */
export function StitchingOverlay({
  image, caption, steps, messages = STITCH_MESSAGES, footer = STITCH_FOOTER, preview,
}: {
  image: string;
  caption: string;
  /** How many image generations this run takes — paces the bar. */
  steps: number;
  messages?: string[];
  footer?: string;
  /** A finished intermediate render to show in the clear while the next step
      runs — the counter passes the stitched piece here during the fitting. */
  preview?: string;
}) {
  const [msg, setMsg] = useState(0);
  const [progress, setProgress] = useState(4);
  const [slow, setSlow] = useState(false);

  /* Every cut is its own image edit, so three cuts take roughly three times as
     long as one. Scaling the time constant by the batch keeps the bar's pace
     tied to what was actually asked for instead of drifting to the top and
     sitting there while five more renders run. */
  const tau = 45 * Math.max(1, steps);
  const SLOW_AFTER = 70 * Math.max(1, steps);

  /* Stops on the last line rather than looping back to the first, which reads
     as having started over. */
  useEffect(() => {
    const timer = setInterval(
      () => setMsg((m) => Math.min(m + 1, messages.length - 1)),
      3200
    );
    return () => clearInterval(timer);
  }, [messages.length]);

  useEffect(() => {
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      // Ceiling 99, not 96: a bar that stops moving reads as a crash, and the
      // last percent belongs to the render actually landing.
      setProgress(Math.max(4, Math.min(99, Math.round(100 * (1 - Math.exp(-s / tau))))));
      setSlow(s > SLOW_AFTER);
    }, 300);
    return () => clearInterval(timer);
  }, [tau, SLOW_AFTER]);

  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 58, background: "var(--stage)", overflow: "hidden" }}>

      {/* the cloth itself, dimmed — the thing being worked on, not decoration */}
      <img src={image} alt="" aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(26px) brightness(.42) saturate(1.1)", transform: "scale(1.15)" }} />

      {/* One centred column: the subject (the ee, or the stitched piece once
          it exists) with the words directly under it — not pinned to the
          bottom edge with a screen of empty dark between them. */}
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "26px 14px", textAlign: "center" }}>
        {preview ? (
          <img src={preview} alt="The stitched piece" className="fade-up"
            style={{ maxWidth: "min(78%, 320px)", maxHeight: "52vh", minHeight: 0, objectFit: "contain", borderRadius: 12, boxShadow: "0 14px 44px rgba(0,0,0,.45)" }} />
        ) : (
          <EeMark size="clamp(38px, 12vw, 64px)" looking color="#fff" />
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.16)", borderRadius: 999, padding: "5px 14px 5px 5px", maxWidth: "88vw" }}>
            <img src={image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {caption}
            </span>
          </div>
          <div key={msg} className="peek ph-display" style={{ fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.35, fontWeight: 600, color: "#fff", maxWidth: 340, padding: "0 6px" }}>
            {messages[msg % messages.length]}
          </div>
          <div style={{ width: "min(72vw, 300px)", height: 5, borderRadius: 5, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", borderRadius: 5, background: "#fff", transition: "width .3s linear" }} />
          </div>
          <div style={{ color: "rgba(255,255,255,.55)", fontSize: 11.5, lineHeight: 1.5, maxWidth: 320, padding: "0 8px" }}>
            {progress}% · {slow ? STITCH_SLOW : footer}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── one render ── */
function RenderCard({ composition, style, busy, onPublish, onPrice, onNote, onRemove, onRestitch }: {
  composition: Composition;
  style?: Style;
  busy: boolean;
  onPublish: (id: string, published: boolean) => void;
  onPrice: (id: string, price: number) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
  onRestitch?: () => void;
}) {
  const c = composition;
  const [price, setPrice] = useState(String(c.price || ""));
  const [note, setNote] = useState(c.note);
  const [zoom, setZoom] = useState(false);
  const styleName = style?.name ?? "Cut";
  const why = staleReason(c, style);
  const stale = why !== null;

  return (
    <div style={{ background: "var(--cream)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid " + (c.published ? "var(--forest)" : "var(--line)") }}>
      <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--sage-mist)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {c.status === "ready" && c.image ? (
          <button type="button" onClick={() => setZoom(true)} title="View larger"
            style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
            <img src={c.image} alt={styleName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ) : c.status === "failed" ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--warn)", fontSize: 12, lineHeight: 1.6 }}>
            Didn&apos;t come out.<br />
            <span style={{ color: "var(--mut)", fontSize: 11 }}>Delete and try again.</span>
          </div>
        ) : (
          <div style={{ color: "var(--mut)", fontSize: 12 }}>stitching…</div>
        )}
        {c.status === "ready" && (
          <span style={{ position: "absolute", top: 10, left: 10, background: "var(--stage-veil)", color: "var(--on-slab)", fontSize: 9.5, fontWeight: 500, letterSpacing: ".09em", padding: "4px 9px", borderRadius: 2 }}>
            STYLE PREVIEW
          </span>
        )}
        {/* The note moved on from what made this picture. Said on the image
            itself, because that image is now the thing that's wrong. */}
        {stale && (
          <span style={{ position: "absolute", top: 10, right: 10, background: "var(--warn)", color: "var(--on-accent)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".08em", padding: "4px 9px", borderRadius: 2 }}>
            {why === "cut" ? "CUT CHANGED" : "NOTE CHANGED"}
          </span>
        )}
      </div>
      <div style={{ padding: "12px 13px 13px" }}>
        <div style={{ fontWeight: 500, fontSize: 11.5, letterSpacing: ".1em", marginBottom: 8 }}>{styleName}</div>
        {c.status === "ready" && (
          <>
            <input
              value={price} inputMode="numeric" placeholder="Price (NPR)"
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              onBlur={() => onPrice(c.id, Number(price || 0))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 13, background: "var(--card)", marginBottom: 8 }}
            />
            {/* Refines the cut for this cloth only. It cannot add or remove a
                piece — that's the cut's own top/bottom/set, and try-on reads
                that to know where the garment goes. */}
            <textarea
              value={note} maxLength={300} placeholder="Note for this cloth in this cut (optional)"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => { if (note.trim() !== c.note.trim()) onNote(c.id, note.trim()); }}
              style={{ width: "100%", padding: "7px 9px", borderRadius: "var(--radius-btn)", border: "1px solid " + (stale ? "var(--warn)" : "var(--line)"), fontSize: 12, background: "var(--card)", marginBottom: 8, minHeight: 46, resize: "vertical", fontFamily: "inherit" }}
            />
            {stale && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--mut)", lineHeight: 1.5, marginBottom: 6 }}>
                  {why === "cut"
                    ? "The cut has been changed since this was made, so this picture shows the old one. Stitch it again to catch up — that costs one render."
                    : "This picture was made before that note. Stitch it again to apply it — that costs one render."}
                </div>
                <button className="ph-btn" disabled={busy || !onRestitch} onClick={onRestitch}
                  style={{ fontSize: 11, padding: "6px 12px", fontWeight: 500, borderRadius: "var(--radius-btn)", border: "1px solid var(--forest)", color: "var(--forest-deep)", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "stitching…" : "stitch again"}
                </button>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--mut)" }}>{c.price > 0 ? npr(c.price) : "no price yet"}</span>
              <span style={{ display: "flex", gap: 2 }}>
                <button className="ph-btn" onClick={() => onPublish(c.id, !c.published)}
                  title={c.price > 0 ? "" : "Set a price first"}
                  disabled={!c.published && c.price <= 0}
                  style={{ fontSize: 11, padding: "4px 6px", fontWeight: 500, color: c.published ? "var(--forest)" : "var(--mut)", opacity: !c.published && c.price <= 0 ? 0.45 : 1 }}>
                  {c.published ? "Published" : "Publish"}
                </button>
                <button className="ph-btn" onClick={() => { if (confirm("Delete this preview?")) onRemove(c.id); }}
                  style={{ fontSize: 11, padding: "4px 6px", fontWeight: 500, color: "var(--mut)" }}>
                  Delete
                </button>
              </span>
            </div>
          </>
        )}
        {c.status === "failed" && (
          <button className="ph-btn" onClick={() => onRemove(c.id)}
            style={{ fontSize: 11, padding: "4px 6px", fontWeight: 500, color: "var(--mut)" }}>Delete</button>
        )}
      </div>
      {zoom && c.image && <ImageZoom src={c.image} alt={styleName} onClose={() => setZoom(false)} />}
    </div>
  );
}

/* ── tap a preview, see it big ──
   Portalled to <body>: rendered in place it would sit inside the studio
   modal's .fade-up dialog, whose transform animation cages position: fixed.
   Exported for the counter, which zooms its recent fitting the same way. */
export function ImageZoom({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(26,23,20,.7)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
      <button className="ph-btn" onClick={onClose} aria-label="Close"
        style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 15, padding: "9px 11px", borderRadius: 999 }}>
        <Icon name="close" />
      </button>
      <img src={src} alt={alt} className="fade-up"
        style={{ maxWidth: "94%", maxHeight: "94%", objectFit: "contain", borderRadius: 12, boxShadow: "0 22px 64px rgba(0,0,0,.5)" }} />
    </div>,
    document.body
  );
}

/* ── define a cut: a photo, words, or both ──
   The database requires at least one of the two (styles_describable), because a
   cut with neither tells the compose step nothing. A photographed sample is the
   strongest input a vendor can give — it's their real tailoring rather than our
   description of a generic one — so it leads.

   Exported for the dashboard's designs tab, which opens it without a fabric in
   hand — `pickFamily` adds the family choice the fabric would otherwise carry. */
export function CutModal({ family, pickFamily, mode, initial, onClose, onSave }: {
  family: StyleFamily;
  pickFamily?: boolean;
  mode: "new" | "edit" | "copy";
  initial?: Style;
  onClose: () => void;
  onSave: (s: {
    name: string;
    family: StyleFamily;
    hint: string;
    coverage: StyleCoverage;
    refImage: string | null;
  }) => Promise<void>;
}) {
  const [fam, setFam] = useState<StyleFamily>(initial?.family ?? family);
  /* A copy opens on the original's wording so the vendor tweaks rather than
     retypes — the point of copying is usually one changed thing. */
  const [name, setName] = useState(
    mode === "copy" && initial ? initial.name + " (ours)" : initial?.name ?? ""
  );
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [coverage, setCoverage] = useState<StyleCoverage>(initial?.coverage ?? "set");
  const [image, setImage] = useState<string | null>(initial?.refImage ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setImage(await fileToCompressedDataURL(file)); }
    catch { setError("Could not read that image. Try a JPG or PNG."); }
    setBusy(false);
  };

  const describable = Boolean(image || hint.trim());
  const canSave = Boolean(name.trim() && describable && !busy);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), family: fam, hint: hint.trim(), coverage, refImage: image });
    } catch (e: any) {
      setError(e?.message || "Could not save this cut.");
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up sheet"
        style={{ width: 420, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: "28px 26px" }}>
        <div className="ph-display" style={{ fontSize: 24, color: "var(--forest-deep)", marginBottom: 4 }}>
          {mode === "edit" ? "change this cut" : mode === "copy" ? "make it your own" : "add your own cut"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--mut)", marginBottom: mode === "new" ? 18 : 12, lineHeight: 1.6 }}>
          {mode === "copy"
            ? `“${initial?.name}” is a peeq library cut, shared by every shop, so it can't be changed directly. This saves your own version of it — the original stays where it is.`
            : pickFamily
            ? "Show us a photo of one you've stitched, describe it in words, or both — whatever you have."
            : `For ${familyLabel(fam)}. Show us a photo of one you've stitched, describe it in words, or both — whatever you have.`}
        </div>
        {/* Editing the wording or the pieces changes what this cut means, and
            anything already stitched from it was made under the old meaning. */}
        {mode === "edit" && (
          <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 13px", marginBottom: 16, fontSize: 12, color: "var(--mut)", lineHeight: 1.6 }}>
            Anything already stitched from this cut will be marked as needing a re-stitch —
            those pictures were made from the old wording. Renaming it alone is free.
          </div>
        )}

        {/* Opened from the fabric studio the family is the cloth's and fixed;
            opened from the designs tab there is no cloth, so it's asked here. */}
        {pickFamily && mode === "new" && (
          <label className="field" style={{ marginBottom: 14 }}>Which family is this cut for?
            <select value={fam} onChange={(e) => setFam(e.target.value as StyleFamily)}
              style={{ width: "100%", padding: "11px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", fontSize: 13.5 }}>
              {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
        )}

        {/* Real label elements throughout: `.field` wraps its control so the
            two are associated, and `.field input` / `.field textarea` style it.
            A placeholder is an example, never a label — it disappears the
            moment anyone types. */}
        <label className="field" style={{ marginBottom: 14 }}>Name this cut
          <input value={name} maxLength={60}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Our house 3-piece" />
        </label>

        {/* The one thing the render can't infer reliably. Left to the wording,
            "worn over matching churidar" produces the churidar on some runs
            and not others — and try-on reads this to know whether it's placing
            a top, a bottom or a whole outfit on the shopper.

            A group of buttons rather than a control, so it gets role="group"
            and its heading by id — a <label> would have nothing to point at. */}
        <div className="field" style={{ marginBottom: 7 }} id="cut-coverage-label">
          What does this cut make?
        </div>
        <div role="group" aria-labelledby="cut-coverage-label"
          style={{ display: "flex", gap: 7, marginBottom: 6 }}>
          {COVERAGES.map((c) => (
            <button key={c.id} type="button" className="ph-btn" onClick={() => setCoverage(c.id)}
              aria-pressed={coverage === c.id}
              style={{
                flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 500, borderRadius: "var(--radius-btn)",
                background: coverage === c.id ? "var(--forest)" : "var(--sage)",
                color: coverage === c.id ? "var(--cream)" : "var(--forest-deep)",
                border: "1px solid " + (coverage === c.id ? "var(--forest)" : "var(--line)"),
              }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 16, lineHeight: 1.55 }}>
          {COVERAGES.find((c) => c.id === coverage)?.note}
        </div>

        {/* A button, not a clickable div — this opens a file picker, so it has
            to be reachable and operable from the keyboard. */}
        <button type="button" onClick={() => fileRef.current?.click()}
          aria-label={image ? "Replace the photo of this cut" : "Add a photo of this cut"}
          style={{ width: "100%", border: "1.5px dashed " + (image ? "var(--forest)" : "var(--line)"), borderRadius: 6, height: 150, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 6, overflow: "hidden", background: "var(--sage)", color: "var(--mut)", fontSize: 13.5, textAlign: "center", lineHeight: 1.6, padding: 0 }}>
          {image ? <img src={image} alt="Cut reference" style={{ height: "100%", objectFit: "contain" }} />
            : <span style={{ padding: 12 }}>Photo of this cut<br /><span style={{ fontSize: 11.5 }}>A stitched sample or a mannequin — any cloth, any colour</span></span>}
        </button>
        <div style={{ fontSize: 11, color: "var(--mut)", marginBottom: 14, lineHeight: 1.55 }}>
          We copy the shape from this photo, never its colour or fabric — those always come
          from the cloth you&apos;re stitching.
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />

        <label className="field">Describe the cut
          <textarea value={hint} maxLength={400} onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. single-breasted, one-button peak lapel, double side vents, tapered trousers" />
        </label>

        {!describable && (
          <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 8, lineHeight: 1.55 }}>
            Add a photo or a description — we need at least one to know what to stitch.
          </div>
        )}
        {error && <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ph-btn" onClick={onClose} disabled={busy}
            style={{ flex: 1, color: "var(--forest-deep)", padding: 13, fontSize: 12, letterSpacing: ".12em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
          <button className="ph-btn" disabled={!canSave} onClick={save}
            style={{ flex: 2, background: canSave ? "var(--forest)" : "var(--line)", color: canSave ? "var(--cream)" : "var(--mut)", padding: 13, fontSize: 12, letterSpacing: ".12em", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
            {busy ? "saving…" : mode === "edit" ? "save changes" : mode === "copy" ? "save my version" : "save cut"}
          </button>
        </div>
      </div>
    </div>
  );
}

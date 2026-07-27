"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FAMILIES, familyLabel, fabricPrice } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { downloadImage } from "@/lib/looks";
import { StitchingOverlay, ImageZoom } from "@/components/FabricStudio";
import Icon from "@/components/Icon";
import { COVERAGES } from "@/lib/types";
import type { CounterInput, CounterRun, Fabric, Garment, Style, StyleCoverage, StyleFamily } from "@/lib/types";

/* The counter: three photographs and a finished try-on, in one sitting.

   The Fabrics tab is authoring — list the bolt, define the cut, render ahead
   of anybody asking, publish what's worth selling. That is the right shape for
   a catalog and the wrong shape for the moment this panel exists for: someone
   is standing at the counter holding a bolt off the shelf that was never
   listed, asking what it would look like on them.

   So nothing here is a catalog row. The vendor uploads a cloth, shows or
   describes a cut, uploads the customer, and gets the piece and the person
   wearing it. Keeping any of it is a separate, deliberate act — one button,
   at the end, after they've seen whether it was worth keeping. */

interface Props {
  /** Runs the whole thing server-side. Throws with a vendor-readable message;
      a try-on that failed after the render succeeded carries `garmentUrl`.
      `onStitched` fires mid-run, the moment the piece exists. */
  onRun: (input: CounterInput, onStitched?: (garmentUrl: string) => void) => Promise<CounterRun>;
  /** Turns a run into a fabric, a cut of the shop's own, and the composition
      joining them — unpublished, exactly as the studio leaves one. */
  onKeep: (
    input: CounterInput,
    garmentUrl: string,
    names: { fabric: string; cut: string }
  ) => Promise<void>;
  /** False in local mode, where there's no server to spend or store anything. */
  enabled: boolean;
  /** Every cut the shop can stitch — the designs tab's list. Picking one here
      is the primary path; describing a new cut is the fallback. */
  styles: Style[];
  /** The shop's listed bolts, so a counter run can start from one of them
      instead of a fresh photograph. */
  fabrics: Fabric[];
  /** The catalog's own add — the other way to keep a run: the stitched render
      becomes a plain garment item, no fabric or cut rows involved. */
  onAddGarment: (g: Omit<Garment, "id" | "itemCode">) => Promise<void> | void;
}

/* The cloth is the one image every fidelity complaint will trace back to, so
   it gets the most pixels. The customer's photo matches what the kiosk sends;
   the cut reference only has to carry a silhouette. All three ride in one JSON
   body, which is why none of them is sent at full size. */
const CLOTH_QUALITY = [1200, 0.85] as const;
const CUT_QUALITY = [900, 0.8] as const;
const PERSON_QUALITY = [1000, 0.85] as const;

/* Same voice as the studio and the kiosk, but this run is two machines and the
   server now says when the first one finishes — so each phase gets its own
   copy. Phase one is the tailor's verbs; phase two opens by announcing the
   piece exists, because at that moment it is on screen behind the words. */
const COUNTER_STITCH_MESSAGES = [
  "Kapada kaatdai...",
  "Silai gardai...",
  "Naap milaudai...",
  "Sana sana details milaudai...",
  "Almost tayar!",
];
const counterFitMessages = (piece: string): string[] => [
  `${piece} ready vayo, aba lagauna baaki`,
  "Grahak lai lagaidai...",
  "Ainaa agadi rakhdai...",
  "Sana sana details milaudai...",
  "La, sakinai lagyo, ahha la daami cha",
];
const COUNTER_FOOTER = "ek minute jati — silaune ra lagaune, duitai";

/* ── the most recent fitting, kept in this browser ──
   The try-on's signed URL dies within the hour, so URLs alone can't be
   "recents" — both images are snapshotted as small data URLs instead. One
   entry only: the counter serves whoever is standing there now, and the last
   customer is the only one worth a glance back. */
const RECENT_KEY = "peeq-counter-recent";

interface RecentRun {
  at: string; // ISO
  family: StyleFamily;
  tryon: string; // data URL
  garment: string; // data URL
}

function readRecent(): RecentRun | null {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "null");
    return r?.tryon && r?.garment ? (r as RecentRun) : null;
  } catch {
    return null;
  }
}

/* Small on purpose: two of these live in one localStorage value, and the
   quota is ~5MB for the whole origin. */
async function toSmallDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return fileToCompressedDataURL(
    new File([blob], "recent.jpg", { type: blob.type || "image/png" }),
    700,
    0.72
  );
}

export default function CounterTryOn({ onRun, onKeep, enabled, styles, fabrics, onAddGarment }: Props) {
  const [family, setFamily] = useState<StyleFamily>(FAMILIES[0].id);
  const [coverage, setCoverage] = useState<StyleCoverage>("set");
  const [fabricImage, setFabricImage] = useState<string | null>(null);
  const [fabricNote, setFabricNote] = useState("");
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState("");
  const [personImage, setPersonImage] = useState<string | null>(null);
  /* The cut, two ways: an existing one from the designs list (primary), or a
     one-off photo/description for this customer. An existing cut carries its
     own wording, reference photo and coverage, so picking one answers all
     three at once. */
  const [cutSource, setCutSource] = useState<"existing" | "custom">("existing");
  const [styleId, setStyleId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);
  /* Which listed bolt the cloth photo came from, if any — highlight only.
     Uploading or shooting a fresh photo clears it. */
  const [pickedFabricId, setPickedFabricId] = useState<string | null>(null);

  const familyCuts = styles
    .filter((s) => s.family === family)
    .sort((a, b) => Number(!!b.shopId) - Number(!!a.shopId) || a.sort - b.sort || a.name.localeCompare(b.name));
  const pickedCut = cutSource === "existing" ? familyCuts.find((s) => s.id === styleId) ?? null : null;

  const [busy, setBusy] = useState(false);
  /* Set mid-run by the server's "stitched" event: the piece exists, the
     fitting is still going. Drives the overlay's second phase. */
  const [stitched, setStitched] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The run carries the inputs that produced it, not just the pictures. The
     form stays live underneath so the next customer only needs a new photo —
     which means by the time "keep it" is pressed, the fields may already
     describe a different cloth than the render on screen was stitched from. */
  const [run, setRun] = useState<{ result: CounterRun; from: CounterInput } | null>(null);
  /* A try-on can fail after the stitching succeeded. The vendor paid for that
     render, so it is shown rather than swallowed with the error. */
  const [orphanRender, setOrphanRender] = useState<string | null>(null);
  /* Loaded in an effect, not the initializer — localStorage doesn't exist
     during server render. */
  const [recent, setRecent] = useState<RecentRun | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  useEffect(() => { setRecent(readRecent()); }, []);

  const describable = cutSource === "existing"
    ? Boolean(pickedCut)
    : Boolean(styleImage || stylePrompt.trim());
  const ready = Boolean(fabricImage && personImage && describable && !busy);

  const input = (): CounterInput => ({
    family,
    coverage: pickedCut ? pickedCut.coverage : coverage,
    fabricImage: fabricImage as string,
    fabricNote: fabricNote.trim(),
    styleImage: pickedCut ? pickedCut.refImage : styleImage,
    stylePrompt: pickedCut ? pickedCut.hint : stylePrompt.trim(),
    personImage: personImage as string,
  });

  /* A listed bolt already carries everything step 1 asks for — photo, family,
     note. The API takes data URLs only, so a storage-hosted image is fetched
     and recompressed through the same pipeline an upload goes through. */
  const pickFabric = async (f: Fabric) => {
    setFabricPickerOpen(false);
    setError(null);
    try {
      let img = f.image;
      if (!img.startsWith("data:")) {
        const blob = await (await fetch(img)).blob();
        img = await fileToCompressedDataURL(
          new File([blob], "fabric.jpg", { type: blob.type || "image/jpeg" }),
          CLOTH_QUALITY[0],
          CLOTH_QUALITY[1]
        );
      }
      setFabricImage(img);
      setPickedFabricId(f.id);
      setFabricNote(f.note || "");
      if (f.family !== family) {
        setFamily(f.family);
        setStyleId(""); // the cut list just changed family under the selection
      }
    } catch {
      setError("Could not load that fabric's photo — try uploading it instead.");
    }
  };

  const start = async () => {
    if (!ready) return;
    setBusy(true);
    setStitched(null);
    setError(null);
    setRun(null);
    setOrphanRender(null);
    const from = input();
    try {
      /* An existing cut's reference photo is a storage URL, and the API only
         takes data URLs — fetch and recompress it exactly as an upload of the
         same photo would have been. */
      if (from.styleImage && !from.styleImage.startsWith("data:")) {
        const blob = await (await fetch(from.styleImage)).blob();
        from.styleImage = await fileToCompressedDataURL(
          new File([blob], "cut.jpg", { type: blob.type || "image/jpeg" }),
          CUT_QUALITY[0],
          CUT_QUALITY[1]
        );
      }
      const result = await onRun(from, setStitched);
      setRun({ result, from });
      /* Snapshot the fitting while its signed URL is still alive. Best-effort:
         a full localStorage or a failed fetch never touches the run itself. */
      try {
        const [tryon, garment] = await Promise.all([
          toSmallDataUrl(result.tryonUrl),
          toSmallDataUrl(result.garmentUrl),
        ]);
        const rec: RecentRun = { at: new Date().toISOString(), family: from.family, tryon, garment };
        localStorage.setItem(RECENT_KEY, JSON.stringify(rec));
        setRecent(rec);
      } catch {}
    } catch (e: any) {
      setError(e?.message || "That didn't come out — please try again.");
      setOrphanRender(e?.garmentUrl ?? null);
    }
    setBusy(false);
    setStitched(null);
  };

  const startOver = () => {
    setRun(null);
    setOrphanRender(null);
    setError(null);
    setFabricImage(null);
    setPickedFabricId(null);
    setFabricNote("");
    setStyleImage(null);
    setStylePrompt("");
    setPersonImage(null);
  };

  if (!enabled) {
    return (
      <div className="panel">
        <div className="panel-head"><span className="title">at the counter</span></div>
        <p style={{ color: "var(--mut)", fontSize: 13.5, lineHeight: 1.7, margin: 0, maxWidth: 520 }}>
          The counter stitches and fits on our servers, so it needs your shop connected to the
          cloud. In local mode the dashboard still works — the counter is the one thing that
          can&apos;t.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="cat-bar">
        <div>
          <span className="ph-display" style={{ fontSize: 22, color: "var(--forest-deep)" }}>at the counter</span>
          <span style={{ color: "var(--mut)", marginLeft: 10, fontSize: 13 }}>one cloth, one customer, right now</span>
        </div>
      </div>

      {/* ── the result, above the form: the vendor's eyes belong here the
          moment there is something to look at, and the form stays filled in
          below so the next customer only needs a new photo. ── */}
      {run && (
        <Result key={run.result.tryonUrl} run={run.result} input={run.from}
          onKeep={onKeep} onAddGarment={onAddGarment} onStartOver={startOver} />
      )}

      {/* The previous fitting, from this browser — shown only while there's no
          live result on screen. Tap either picture to see it big. */}
      {!run && recent && (
        <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "12px 14px", marginBottom: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setZoomSrc(recent.tryon)} title="View larger"
              style={{ padding: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", cursor: "zoom-in", background: "var(--sage-mist)", width: 62, height: 82 }}>
              <img src={recent.tryon} alt="Last fitting" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
            <button type="button" onClick={() => setZoomSrc(recent.garment)} title="View larger"
              style={{ padding: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", cursor: "zoom-in", background: "var(--sage-mist)", width: 62, height: 82 }}>
              <img src={recent.garment} alt="Last stitched piece" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--forest-deep)" }}>last fitting</div>
            <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 2 }}>
              {familyLabel(recent.family)} · {new Date(recent.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <button type="button" className="ph-btn"
            onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecent(null); }}
            style={{ fontSize: 11.5, color: "var(--mut)", padding: "4px 8px" }}>
            clear
          </button>
        </div>
      )}

      {error && (
        <div style={{ border: "1px solid var(--warn)", background: "var(--cream)", borderRadius: "var(--radius-card)", padding: "13px 16px", marginBottom: 18, fontSize: 13, color: "var(--warn)", lineHeight: 1.6 }}>
          {error}
          {orphanRender && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
              <img src={orphanRender} alt="The stitched piece" style={{ width: 68, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
              <span style={{ color: "var(--mut)", fontSize: 12, lineHeight: 1.55 }}>
                The stitching came out — only the fitting failed. Try again with a clearer,
                waist-up photo of the customer.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="counter-grid">
        {/* ── 1. the cloth ── */}
        <Step n={1} title="the cloth">
          <PhotoBox
            image={fabricImage}
            onImage={(img) => { setFabricImage(img); setPickedFabricId(null); }}
            max={CLOTH_QUALITY}
            label="Photo of the cloth"
            hint="Lay it flat in daylight — fill the frame with the weave"
            camera
            onError={setError}
          />
          {fabrics.length > 0 && (
            <button type="button" className="ph-btn" onClick={() => setFabricPickerOpen(true)}
              style={{ marginTop: 6, fontSize: 11.5, color: "var(--forest-deep)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5, padding: 0, alignSelf: "flex-start" }}>
              <Icon name="search" /> pick a listed fabric
            </button>
          )}
          <label className="field" style={{ marginTop: 12 }}>Stitched into
            <select value={family}
              onChange={(e) => { setFamily(e.target.value as StyleFamily); setStyleId(""); }}
              style={selectStyle}>
              {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginTop: 12 }}>Anything the photo can&apos;t show
            <textarea value={fabricNote} maxLength={300} onChange={(e) => setFabricNote(e.target.value)}
              placeholder="e.g. gold border runs along one edge only" style={{ minHeight: 62 }} />
          </label>
        </Step>

        {/* ── 2. the cut ── */}
        <Step n={2} title="the cut">
          {cutSource === "existing" ? (
            <>
              <div className="field">Pick a cut</div>
              <button type="button" onClick={() => setPickerOpen(true)}
                style={{ ...selectStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", textAlign: "left", color: pickedCut ? "var(--ink)" : "var(--mut)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pickedCut ? pickedCut.name : "Choose a cut…"}
                </span>
                <Icon name="search" />
              </button>
              {/* The chosen cut at photo-box scale — the same size its
                  neighbours give the cloth and the customer, not a thumbnail
                  in a card of white space. */}
              {pickedCut && (
                <div style={{ position: "relative", marginTop: 12, flex: "1 1 auto", minHeight: 168, background: "var(--sage-mist)", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {pickedCut.refImage ? (
                    <img src={pickedCut.refImage} alt={pickedCut.name}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 10, boxSizing: "border-box" }} />
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--mut)", fontStyle: "italic", lineHeight: 1.7, textAlign: "center", padding: "38px 18px 18px", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      “{pickedCut.hint}”
                    </div>
                  )}
                  <span style={{ position: "absolute", top: 10, left: 10, background: "var(--cream)", color: "var(--forest-deep)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".09em", padding: "3px 8px", borderRadius: 2, textTransform: "uppercase" }}>
                    {COVERAGES.find((c) => c.id === pickedCut.coverage)?.label}
                  </span>
                </div>
              )}
              {pickedCut?.refImage && pickedCut.hint && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--mut)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {pickedCut.hint}
                </div>
              )}
              <button type="button" className="ph-btn" onClick={() => setCutSource("custom")}
                style={{ marginTop: "auto", paddingTop: 12, alignSelf: "flex-start", fontSize: 12, color: "var(--forest-deep)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3, paddingLeft: 0, paddingRight: 0, paddingBottom: 0 }}>
                + make a new cut instead
              </button>
            </>
          ) : (
            <>
              <PhotoBox
                image={styleImage}
                onImage={setStyleImage}
                max={CUT_QUALITY}
                label="Photo of the cut"
                hint="A stitched sample or a mannequin — any cloth, any colour"
                optional
                onError={setError}
              />
              <label className="field" style={{ marginTop: 12 }}>…or describe it
                <textarea value={stylePrompt} maxLength={400} onChange={(e) => setStylePrompt(e.target.value)}
                  placeholder="e.g. single-breasted, one-button peak lapel, tapered trousers"
                  style={{ minHeight: 62 }} />
              </label>
              {/* The one thing the render can't infer reliably, and try-on reads it
                  too — it decides whether a top, a bottom or a whole outfit is
                  being placed on the customer. */}
              <div className="field" style={{ marginTop: 12, marginBottom: 7 }} id="counter-coverage-label">
                What does it make?
              </div>
              <div role="group" aria-labelledby="counter-coverage-label" style={{ display: "flex", gap: 6 }}>
                {COVERAGES.map((c) => (
                  <button key={c.id} type="button" className="ph-btn" onClick={() => setCoverage(c.id)}
                    aria-pressed={coverage === c.id} title={c.note}
                    style={{
                      flex: 1, padding: "9px 6px", fontSize: 11.5, fontWeight: 500, borderRadius: "var(--radius-btn)",
                      background: coverage === c.id ? "var(--forest)" : "var(--sage)",
                      color: coverage === c.id ? "var(--cream)" : "var(--forest-deep)",
                      border: "1px solid " + (coverage === c.id ? "var(--forest)" : "var(--line)"),
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <button type="button" className="ph-btn" onClick={() => setCutSource("existing")}
                style={{ marginTop: 12, fontSize: 12, color: "var(--forest-deep)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
                pick an existing cut instead
              </button>
            </>
          )}
        </Step>

        {/* ── 3. the customer ── */}
        <Step n={3} title="the customer">
          <PhotoBox
            image={personImage}
            onImage={setPersonImage}
            max={PERSON_QUALITY}
            label="Photo of the customer"
            hint="Waist-up, facing you, plain wall behind them"
            camera
            onError={setError}
          />
          {/* Their face, their call. The kiosk asks the shopper directly; here
              there is a counter between them and the upload, so the asking is
              the vendor's job and it has to be said out loud. */}
          <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 12, lineHeight: 1.6 }}>
            Ask before you photograph anyone. The photo stays private to this shop.
          </div>
        </Step>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
        <button className="ph-btn btn-solid" disabled={!ready} onClick={start}
          style={{ padding: "13px 26px", fontSize: 12.5, opacity: ready ? 1 : 0.5 }}>
          {busy ? "stitching…" : "stitch & try on"}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--mut)", lineHeight: 1.55 }}>
          {fabricImage && personImage && !describable
            ? cutSource === "existing"
              ? "Pick a cut to stitch this cloth into."
              : "Show us the cut in a photo, or describe it in words."
            : !fabricImage || !personImage
            ? "Needs the cloth and the customer."
            : "Uses one stitch and one try-on from your plan."}
        </span>
      </div>

      {/* Portalled to <body>: this panel sits inside the tab's .fade-up div,
          whose transform animation (fill-mode: both) makes it the containing
          block for position: fixed — an overlay rendered in place gets caged
          to the tab's box instead of the viewport. */}
      {busy && fabricImage && createPortal(
        stitched ? (
          /* Phase two: the piece exists — show it while it's being fitted.
             Keyed so the message rotation and the bar restart with it. */
          <StitchingOverlay key="fit" image={stitched} preview={stitched}
            caption={familyLabel(family) + " · at the counter"}
            steps={1} messages={counterFitMessages(familyLabel(family))} footer={COUNTER_FOOTER} />
        ) : (
          <StitchingOverlay key="stitch" image={fabricImage}
            caption={familyLabel(family) + " · at the counter"}
            steps={1} messages={COUNTER_STITCH_MESSAGES} footer={COUNTER_FOOTER} />
        ),
        document.body
      )}

      {pickerOpen && createPortal(
        <CutPickerModal
          cuts={familyCuts}
          familyName={familyLabel(family)}
          selectedId={styleId}
          onPick={(id) => { setStyleId(id); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />,
        document.body
      )}

      {zoomSrc && <ImageZoom src={zoomSrc} alt="Recent fitting" onClose={() => setZoomSrc(null)} />}

      {fabricPickerOpen && createPortal(
        <FabricPickerModal
          fabrics={fabrics}
          selectedId={pickedFabricId}
          onPick={pickFabric}
          onClose={() => setFabricPickerOpen(false)}
        />,
        document.body
      )}
    </>
  );
}

/* ── the cut picker: the designs page, shrunk to a choice ──
   Same two card faces as the designs tab — image-led when the cut has a
   reference photo, words-led when it doesn't — because this list IS that
   page's list, and it should be recognisable as such. */
function CutPickerModal({ cuts, familyName, selectedId, onPick, onClose }: {
  cuts: Style[];
  familyName: string;
  selectedId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const visible = query
    ? cuts.filter((c) => (c.name + " " + c.hint).toLowerCase().includes(query))
    : cuts;

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 60, padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up sheet"
        style={{ width: 680, maxWidth: "100%", margin: "18px 0", padding: "22px 20px 24px", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 68px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div>
            <span className="ph-display" style={{ fontSize: 20, color: "var(--forest-deep)" }}>pick a cut</span>
            <span style={{ color: "var(--mut)", marginLeft: 9, fontSize: 12.5 }}>{familyName}</span>
          </div>
          <button className="ph-btn" onClick={onClose}
            style={{ color: "var(--mut)", fontSize: 12, padding: "4px 8px" }}>close</button>
        </div>

        <div style={{ position: "relative", marginBottom: 14 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--mut)", display: "flex" }}>
            <Icon name="search" />
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            placeholder="Search cuts…" aria-label="Search cuts"
            style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", fontSize: 13.5, boxSizing: "border-box" }} />
        </div>

        <div style={{ overflowY: "auto", minHeight: 0 }}>
          {visible.length === 0 ? (
            <div style={{ color: "var(--mut)", fontSize: 13, padding: "26px 0", textAlign: "center" }}>
              No {familyName.toLowerCase()} cut matches that.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {visible.map((c) => {
                const mine = !!c.shopId;
                const on = c.id === selectedId;
                const cov = COVERAGES.find((x) => x.id === c.coverage);
                return (
                  <button key={c.id} type="button" onClick={() => onPick(c.id)}
                    style={{
                      textAlign: "left", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column",
                      background: "var(--cream)", borderRadius: "var(--radius-card)", overflow: "hidden",
                      border: on ? "2px solid var(--forest)" : "1px solid var(--line)",
                    }}>
                    {c.refImage ? (
                      <span style={{ display: "block", aspectRatio: "4/3", position: "relative", background: "var(--sage-mist)", width: "100%" }}>
                        <img src={c.refImage} alt=""
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }} />
                      </span>
                    ) : (
                      <span style={{ display: "block", padding: "10px 11px 0", fontSize: 10.5, color: "var(--mut)", fontStyle: "italic", lineHeight: 1.55 }}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          “{c.hint}”
                        </span>
                      </span>
                    )}
                    <span style={{ display: "flex", flexDirection: "column", gap: 4, padding: "9px 11px 10px", width: "100%", boxSizing: "border-box" }}>
                      <span style={{ fontWeight: 600, fontSize: 11.5, color: "var(--ink)", lineHeight: 1.4 }}>
                        {c.name}
                      </span>
                      <span style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                        {cov && (
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".08em", padding: "2px 6px", borderRadius: 2, textTransform: "uppercase", background: "var(--sage)", color: "var(--forest-deep)" }}>
                            {cov.label}
                          </span>
                        )}
                        {mine && (
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".08em", padding: "2px 6px", borderRadius: 2, background: "var(--forest)", color: "var(--cream)" }}>
                            YOURS
                          </span>
                        )}
                        {on && <Icon name="check" style={{ color: "var(--forest)", marginLeft: "auto" }} />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── the fabric picker: the fabrics tab, shrunk to a choice ──
   Same shape as the cut picker above; searches name, code, composition and
   colour, because a vendor reaching for "that blue banarasi" may know it by
   any of the four. */
function FabricPickerModal({ fabrics, selectedId, onPick, onClose }: {
  fabrics: Fabric[];
  selectedId: string | null;
  onPick: (f: Fabric) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const visible = query
    ? fabrics.filter((f) =>
        [f.name, f.itemCode ?? "", f.composition, f.color, familyLabel(f.family)]
          .join(" ").toLowerCase().includes(query))
    : fabrics;

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 60, padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up sheet"
        style={{ width: 680, maxWidth: "100%", margin: "18px 0", padding: "22px 20px 24px", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 68px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div>
            <span className="ph-display" style={{ fontSize: 20, color: "var(--forest-deep)" }}>pick a fabric</span>
            <span style={{ color: "var(--mut)", marginLeft: 9, fontSize: 12.5 }}>{fabrics.length} listed</span>
          </div>
          <button className="ph-btn" onClick={onClose}
            style={{ color: "var(--mut)", fontSize: 12, padding: "4px 8px" }}>close</button>
        </div>

        <div style={{ position: "relative", marginBottom: 14 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--mut)", display: "flex" }}>
            <Icon name="search" />
          </span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
            placeholder="Search by name, code, colour…" aria-label="Search fabrics"
            style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", fontSize: 13.5, boxSizing: "border-box" }} />
        </div>

        <div style={{ overflowY: "auto", minHeight: 0 }}>
          {visible.length === 0 ? (
            <div style={{ color: "var(--mut)", fontSize: 13, padding: "26px 0", textAlign: "center" }}>
              No fabric matches that.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {visible.map((f) => {
                const on = f.id === selectedId;
                return (
                  <button key={f.id} type="button" onClick={() => onPick(f)}
                    style={{
                      textAlign: "left", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column",
                      background: "var(--cream)", borderRadius: "var(--radius-card)", overflow: "hidden",
                      border: on ? "2px solid var(--forest)" : "1px solid var(--line)",
                      opacity: f.inStock ? 1 : 0.55,
                    }}>
                    <span style={{ display: "block", aspectRatio: "4/3", position: "relative", background: "var(--sage-mist)", width: "100%" }}>
                      <img src={f.image} alt=""
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      <span style={{ position: "absolute", top: 8, left: 8, background: "var(--cream)", color: "var(--forest-deep)", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", padding: "2px 7px", borderRadius: 2 }}>
                        {familyLabel(f.family)}
                      </span>
                      {!f.inStock && (
                        <span style={{ position: "absolute", bottom: 8, left: 8, background: "var(--forest-deep)", color: "var(--cream)", fontSize: 9, fontWeight: 500, letterSpacing: ".07em", padding: "2px 7px", borderRadius: 2 }}>
                          Out of stock
                        </span>
                      )}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3, padding: "9px 11px 10px", width: "100%", boxSizing: "border-box" }}>
                      <span style={{ fontWeight: 600, fontSize: 11.5, color: "var(--ink)", lineHeight: 1.4 }}>{f.name}</span>
                      {(f.composition || f.color) && (
                        <span style={{ fontSize: 10, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[f.composition, f.color].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, color: "var(--camel)", fontWeight: 500 }}>{fabricPrice(f.price, f.unit)}</span>
                        {on && <Icon name="check" style={{ color: "var(--forest)", marginLeft: "auto" }} />}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)",
  fontSize: 15, background: "var(--card)", color: "var(--ink)", fontWeight: 400,
  letterSpacing: 0, textTransform: "none", width: "100%",
};

/* ── one numbered step ── */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  /* A flex column so a child (the photo box) can grow into the shared row
     height the grid gives every card — that's what keeps the three steps'
     frames level with each other. */
  return (
    <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "16px 17px 18px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--forest)", color: "var(--cream)", fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {n}
        </span>
        <span className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* ── an upload slot ──
   A button, not a clickable div: it opens a file picker, so it has to be
   reachable and operable from the keyboard. `camera` adds capture= on a second
   input, which is what turns "upload" into "take a photo" on a phone at the
   counter without asking for camera permission up front. */
function PhotoBox({ image, onImage, max, label, hint, optional, camera, onError }: {
  image: string | null;
  onImage: (dataUrl: string) => void;
  max: readonly [number, number];
  label: string;
  hint: string;
  optional?: boolean;
  camera?: boolean;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try { onImage(await fileToCompressedDataURL(file, max[0], max[1])); }
    catch { onError("Could not read that image. Try a JPG or PNG."); }
    setReading(false);
  };

  return (
    <>
      <button type="button" onClick={() => fileRef.current?.click()}
        aria-label={image ? "Replace: " + label : label}
        style={{ width: "100%", border: "1.5px dashed " + (image ? "var(--forest)" : "var(--line)"), borderRadius: 6, minHeight: 168, flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: "var(--sage)", color: "var(--mut)", fontSize: 13, textAlign: "center", lineHeight: 1.6, padding: 0, position: "relative" }}>
        {reading ? <span>Reading photo…</span>
          : image ? <img src={image} alt={label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : (
            <span style={{ padding: 12 }}>
              {label}{optional && <span style={{ opacity: 0.7 }}> (optional)</span>}
              <br /><span style={{ fontSize: 11.5 }}>{hint}</span>
            </span>
          )}
      </button>
      <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
        {camera && (
          <button type="button" className="ph-btn" onClick={() => camRef.current?.click()}
            style={{ fontSize: 11.5, color: "var(--forest-deep)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="camera" /> use the camera
          </button>
        )}
        {image && (
          <button type="button" className="ph-btn" onClick={() => fileRef.current?.click()}
            style={{ fontSize: 11.5, color: "var(--mut)" }}>replace</button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => handle(e.target.files?.[0])} />
      {camera && (
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => handle(e.target.files?.[0])} />
      )}
    </>
  );
}

/* ── the finished fitting ──
   Two pictures, and they are not equals: the customer wearing it is what the
   sale turns on, so it leads at full size. The stitched piece sits beside it
   because that is the one worth keeping — it is what a shopper would browse
   later, and it is already paid for and already stored. */
/* The catalog speaks in CATEGORIES labels; the counter speaks in families.
   Sherwani has no catalog label of its own, so it files under Other. */
const familyCategory = (f: StyleFamily): string =>
  f === "suit" ? "Suit"
  : f === "lehenga" ? "Lehenga"
  : f === "kurtha" ? "Kurtha"
  : f === "daura-suruwal" ? "Daura Suruwal"
  : f === "sari-blouse" ? "Sari"
  : "Other";

function Result({ run, input, onKeep, onAddGarment, onStartOver }: {
  run: CounterRun;
  input: CounterInput;
  onKeep: (input: CounterInput, garmentUrl: string, names: { fabric: string; cut: string }) => Promise<void>;
  onAddGarment: (g: Omit<Garment, "id" | "itemCode">) => Promise<void> | void;
  onStartOver: () => void;
}) {
  /* One form open at a time: keeping as made-to-order and adding as a garment
     are alternative homes for the same render. */
  const [form, setForm] = useState<"fabric" | "garment" | null>(null);
  const [names, setNames] = useState({ fabric: "", cut: "" });
  const [garmentName, setGarmentName] = useState("");
  const [garmentPrice, setGarmentPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState<"fabric" | "garment" | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(names.fabric.trim() && names.cut.trim() && !saving);
  const canAddGarment = Boolean(garmentName.trim() && !saving);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onKeep(input, run.garmentUrl, names);
      setKept("fabric");
      setForm(null);
    } catch (e: any) {
      setError(e?.message || "Could not keep this — please try again.");
    }
    setSaving(false);
  };

  const addGarment = async () => {
    if (!canAddGarment) return;
    setSaving(true);
    setError(null);
    try {
      /* addGarment uploads a data URL; the render lives on the storage host,
         so it's fetched and recompressed like any garment photo upload. */
      const blob = await (await fetch(run.garmentUrl)).blob();
      const image = await fileToCompressedDataURL(
        new File([blob], "garment.jpg", { type: blob.type || "image/png" }),
        1200,
        0.85
      );
      await onAddGarment({
        name: garmentName.trim(),
        category: familyCategory(input.family),
        price: Number(garmentPrice || 0),
        image,
        sizes: [],
        inStock: true,
        tryonEnabled: true,
        /* No finished piece exists — this render is a promise the tailor
           stitches to measure, and the tag should say so. */
        stitchedToOrder: true,
      });
      setKept("garment");
      setForm(null);
    } catch (e: any) {
      setError(e?.message || "Could not add this to the catalog — please try again.");
    }
    setSaving(false);
  };

  return (
    <div style={{ background: "var(--cream)", border: "1px solid var(--forest)", borderRadius: "var(--radius-card)", padding: "18px 18px 20px", marginBottom: 20 }}>
      <div className="counter-result">
        <div style={{ position: "relative" }}>
          <img src={run.tryonUrl} alt="The customer wearing the stitched piece"
            style={{ width: "100%", borderRadius: 8, display: "block", background: "var(--sage-mist)" }} />
          <span style={{ position: "absolute", top: 10, left: 10, background: "var(--stage-veil)", color: "var(--on-slab)", fontSize: 9.5, fontWeight: 500, letterSpacing: ".09em", padding: "4px 9px", borderRadius: 2 }}>
            STYLE PREVIEW
          </span>
        </div>
        <div>
          <div className="ph-display" style={{ fontSize: 18, color: "var(--forest-deep)", marginBottom: 4 }}>
            {familyLabel(input.family)}, stitched and fitted
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.6, marginBottom: 12 }}>
            A preview of the style, not of the fit — the tailor still takes the measurements.
          </div>
          <img src={run.garmentUrl} alt="The stitched piece on its own"
            style={{ width: 128, borderRadius: 6, display: "block", border: "1px solid var(--line)", marginBottom: 12 }} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {/* Fetched and re-offered as a blob rather than linked with
                `download`: the result lives on the storage host, and the
                attribute is ignored cross-origin — it would open a tab instead
                of saving, which on a phone at the counter is a dead end. */}
            <button className="ph-btn" disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try { await downloadImage(run.tryonUrl, familyLabel(input.family)); } catch {}
                setDownloading(false);
              }}
              style={{ fontSize: 11.5, fontWeight: 500, color: "var(--forest-deep)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6, opacity: downloading ? 0.6 : 1 }}>
              <Icon name="download" /> {downloading ? "saving…" : "save the photo"}
            </button>
            <button className="ph-btn" onClick={onStartOver}
              style={{ fontSize: 11.5, fontWeight: 500, color: "var(--mut)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "8px 14px" }}>
              start again
            </button>
          </div>

          {/* Keeping it is the bridge back to the catalog: the cloth becomes a
              fabric, the words become one of the shop's own cuts, and the
              render they already paid for becomes the composition joining the
              two — waiting in the Fabrics tab for a price. */}
          {kept ? (
            <div style={{ fontSize: 12.5, color: "var(--forest)", lineHeight: 1.6 }}>
              <Icon name="check" />{" "}
              {kept === "fabric"
                ? "Kept. It's in your Fabrics tab — set a price there, then publish it for shoppers."
                : "Added. It's in your Catalog tab, in stock and try-on ready, marked stitched to order."}
            </div>
          ) : form === "fabric" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="field">Name this cloth
                <input value={names.fabric} maxLength={80} autoFocus
                  onChange={(e) => setNames((n) => ({ ...n, fabric: e.target.value }))}
                  placeholder="e.g. Navy Italian Wool" />
              </label>
              <label className="field">Name this cut
                <input value={names.cut} maxLength={60}
                  onChange={(e) => setNames((n) => ({ ...n, cut: e.target.value }))}
                  placeholder="e.g. Our house 3-piece" />
              </label>
              <div style={{ fontSize: 11, color: "var(--mut)", lineHeight: 1.55 }}>
                Saved without a price and unpublished, so nothing reaches shoppers until you say
                so. The customer&apos;s photo is not kept with it.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ph-btn" disabled={saving} onClick={() => setForm(null)}
                  style={{ flex: 1, color: "var(--forest-deep)", padding: 11, fontSize: 11.5, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
                <button className="ph-btn" disabled={!canSave} onClick={save}
                  style={{ flex: 2, background: canSave ? "var(--forest)" : "var(--line)", color: canSave ? "var(--cream)" : "var(--mut)", padding: 11, fontSize: 11.5, borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
                  {saving ? "keeping…" : "keep it"}
                </button>
              </div>
            </div>
          ) : form === "garment" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="field">Name this garment
                <input value={garmentName} maxLength={80} autoFocus
                  onChange={(e) => setGarmentName(e.target.value)}
                  placeholder={"e.g. " + familyLabel(input.family) + " in navy wool"} />
              </label>
              <label className="field">Price (NPR, optional)
                <input value={garmentPrice} inputMode="numeric"
                  onChange={(e) => setGarmentPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                  placeholder="e.g. 12500" />
              </label>
              <div style={{ fontSize: 11, color: "var(--mut)", lineHeight: 1.55 }}>
                Goes straight into your catalog as a stitched-to-order piece, try-on enabled.
                The customer&apos;s photo is not kept with it.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ph-btn" disabled={saving} onClick={() => setForm(null)}
                  style={{ flex: 1, color: "var(--forest-deep)", padding: 11, fontSize: 11.5, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
                <button className="ph-btn" disabled={!canAddGarment} onClick={addGarment}
                  style={{ flex: 2, background: canAddGarment ? "var(--forest)" : "var(--line)", color: canAddGarment ? "var(--cream)" : "var(--mut)", padding: 11, fontSize: 11.5, borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
                  {saving ? "adding…" : "add to catalog"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="ph-btn btn-solid" onClick={() => setForm("fabric")}
                style={{ padding: "10px 18px", fontSize: 11.5 }}>
                keep this in my fabrics
              </button>
              <button className="ph-btn" onClick={() => setForm("garment")}
                style={{ padding: "10px 18px", fontSize: 11.5, fontWeight: 500, color: "var(--forest-deep)", border: "1px solid var(--forest)", borderRadius: "var(--radius-btn)" }}>
                add to catalog as a garment
              </button>
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { FAMILIES, familyLabel } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { downloadImage } from "@/lib/looks";
import { StitchingOverlay } from "@/components/FabricStudio";
import Icon from "@/components/Icon";
import { COVERAGES } from "@/lib/types";
import type { CounterInput, CounterRun, StyleCoverage, StyleFamily } from "@/lib/types";

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
      a try-on that failed after the render succeeded carries `garmentUrl`. */
  onRun: (input: CounterInput) => Promise<CounterRun>;
  /** Turns a run into a fabric, a cut of the shop's own, and the composition
      joining them — unpublished, exactly as the studio leaves one. */
  onKeep: (
    input: CounterInput,
    garmentUrl: string,
    names: { fabric: string; cut: string }
  ) => Promise<void>;
  /** False in local mode, where there's no server to spend or store anything. */
  enabled: boolean;
}

/* The cloth is the one image every fidelity complaint will trace back to, so
   it gets the most pixels. The customer's photo matches what the kiosk sends;
   the cut reference only has to carry a silhouette. All three ride in one JSON
   body, which is why none of them is sent at full size. */
const CLOTH_QUALITY = [1200, 0.85] as const;
const CUT_QUALITY = [900, 0.8] as const;
const PERSON_QUALITY = [1000, 0.85] as const;

/* Same voice as the studio and the kiosk, but this run is two machines rather
   than one — the cloth is stitched, then the stitched piece is worn — so the
   copy walks through both. */
const COUNTER_MESSAGES = [
  "Kapada kaatdai...",
  "Silai gardai...",
  "Naap milaudai...",
  "Grahak lai lagaidai...",
  "Ainaa agadi rakhdai...",
  "Sana sana details milaudai...",
  "La, sakinai lagyo, ahha la daami cha",
];
const COUNTER_FOOTER = "ek minute jati — silaune ra lagaune, duitai";

export default function CounterTryOn({ onRun, onKeep, enabled }: Props) {
  const [family, setFamily] = useState<StyleFamily>(FAMILIES[0].id);
  const [coverage, setCoverage] = useState<StyleCoverage>("set");
  const [fabricImage, setFabricImage] = useState<string | null>(null);
  const [fabricNote, setFabricNote] = useState("");
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState("");
  const [personImage, setPersonImage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The run carries the inputs that produced it, not just the pictures. The
     form stays live underneath so the next customer only needs a new photo —
     which means by the time "keep it" is pressed, the fields may already
     describe a different cloth than the render on screen was stitched from. */
  const [run, setRun] = useState<{ result: CounterRun; from: CounterInput } | null>(null);
  /* A try-on can fail after the stitching succeeded. The vendor paid for that
     render, so it is shown rather than swallowed with the error. */
  const [orphanRender, setOrphanRender] = useState<string | null>(null);

  const describable = Boolean(styleImage || stylePrompt.trim());
  const ready = Boolean(fabricImage && personImage && describable && !busy);

  const input = (): CounterInput => ({
    family,
    coverage,
    fabricImage: fabricImage as string,
    fabricNote: fabricNote.trim(),
    styleImage,
    stylePrompt: stylePrompt.trim(),
    personImage: personImage as string,
  });

  const start = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setRun(null);
    setOrphanRender(null);
    const from = input();
    try {
      setRun({ result: await onRun(from), from });
    } catch (e: any) {
      setError(e?.message || "That didn't come out — please try again.");
      setOrphanRender(e?.garmentUrl ?? null);
    }
    setBusy(false);
  };

  const startOver = () => {
    setRun(null);
    setOrphanRender(null);
    setError(null);
    setFabricImage(null);
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

      <div style={{ background: "var(--sage)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "12px 15px", marginBottom: 18, fontSize: 12.5, color: "var(--mut)", lineHeight: 1.65 }}>
        For the bolt nobody listed yet. Photograph the cloth, show or describe the cut, photograph
        the customer — peeq stitches it and puts it on them. None of it touches your catalog
        unless you keep it at the end.
      </div>

      {/* ── the result, above the form: the vendor's eyes belong here the
          moment there is something to look at, and the form stays filled in
          below so the next customer only needs a new photo. ── */}
      {run && (
        <Result key={run.result.tryonUrl} run={run.result} input={run.from}
          onKeep={onKeep} onStartOver={startOver} />
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
            onImage={setFabricImage}
            max={CLOTH_QUALITY}
            label="Photo of the cloth"
            hint="Lay it flat in daylight — fill the frame with the weave"
            onError={setError}
          />
          <label className="field" style={{ marginTop: 12 }}>Stitched into
            <select value={family} onChange={(e) => setFamily(e.target.value as StyleFamily)}
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
          <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 7, lineHeight: 1.55 }}>
            {COVERAGES.find((c) => c.id === coverage)?.note}
          </div>
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
            Ask before you photograph anyone. The picture is used for this fitting and stored
            privately to your shop — never shown on your storefront, never shown to other shops.
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
            ? "Show us the cut in a photo, or describe it in words."
            : !fabricImage || !personImage
            ? "Needs the cloth and the customer."
            : "Uses one stitch and one try-on from your plan."}
        </span>
      </div>

      {busy && fabricImage && (
        <StitchingOverlay image={fabricImage} caption={familyLabel(family) + " · at the counter"}
          steps={2} messages={COUNTER_MESSAGES} footer={COUNTER_FOOTER} />
      )}
    </>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)",
  fontSize: 15, background: "#fff", color: "var(--ink)", fontWeight: 400,
  letterSpacing: 0, textTransform: "none", width: "100%",
};

/* ── one numbered step ── */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "16px 17px 18px" }}>
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
        style={{ width: "100%", border: "1.5px dashed " + (image ? "var(--forest)" : "var(--line)"), borderRadius: 6, height: 168, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", background: "var(--sage)", color: "var(--mut)", fontSize: 13, textAlign: "center", lineHeight: 1.6, padding: 0 }}>
        {reading ? <span>Reading photo…</span>
          : image ? <img src={image} alt={label} style={{ height: "100%", objectFit: "contain" }} />
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
function Result({ run, input, onKeep, onStartOver }: {
  run: CounterRun;
  input: CounterInput;
  onKeep: (input: CounterInput, garmentUrl: string, names: { fabric: string; cut: string }) => Promise<void>;
  onStartOver: () => void;
}) {
  const [keeping, setKeeping] = useState(false);
  const [names, setNames] = useState({ fabric: "", cut: "" });
  const [saving, setSaving] = useState(false);
  const [kept, setKept] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(names.fabric.trim() && names.cut.trim() && !saving);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onKeep(input, run.garmentUrl, names);
      setKept(true);
      setKeeping(false);
    } catch (e: any) {
      setError(e?.message || "Could not keep this — please try again.");
    }
    setSaving(false);
  };

  return (
    <div style={{ background: "var(--cream)", border: "1px solid var(--forest)", borderRadius: "var(--radius-card)", padding: "18px 18px 20px", marginBottom: 20 }}>
      <div className="counter-result">
        <div style={{ position: "relative" }}>
          <img src={run.tryonUrl} alt="The customer wearing the stitched piece"
            style={{ width: "100%", borderRadius: 8, display: "block", background: "var(--sage-mist)" }} />
          <span style={{ position: "absolute", top: 10, left: 10, background: "rgba(26,23,20,.78)", color: "var(--cream)", fontSize: 9.5, fontWeight: 500, letterSpacing: ".09em", padding: "4px 9px", borderRadius: 2 }}>
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
              <Icon name="check" /> Kept. It&apos;s in your Fabrics tab — set a price there, then
              publish it for shoppers.
            </div>
          ) : keeping ? (
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
                <button className="ph-btn" disabled={saving} onClick={() => setKeeping(false)}
                  style={{ flex: 1, color: "var(--forest-deep)", padding: 11, fontSize: 11.5, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
                <button className="ph-btn" disabled={!canSave} onClick={save}
                  style={{ flex: 2, background: canSave ? "var(--forest)" : "var(--line)", color: canSave ? "var(--cream)" : "var(--mut)", padding: 11, fontSize: 11.5, borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
                  {saving ? "keeping…" : "keep it"}
                </button>
              </div>
            </div>
          ) : (
            <button className="ph-btn btn-solid" onClick={() => setKeeping(true)}
              style={{ padding: "10px 18px", fontSize: 11.5 }}>
              keep this in my fabrics
            </button>
          )}
          {error && <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

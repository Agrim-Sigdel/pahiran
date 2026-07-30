"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FAMILIES, npr, fabricPrice, familyLabel, creditCost } from "@/lib/constants";
import { fileToDataURL } from "@/lib/images";
import ImageCropper from "@/components/ImageCropper";
import ColorList from "@/components/ColorList";
import Dropdown from "@/components/Dropdown";
import EeMark from "@/components/EeMark";
import Icon from "@/components/Icon";
import { confirmAsync } from "@/components/Dialog";
import { COVERAGES, staleReason } from "@/lib/types";
import type { Composition, Fabric, FabricColor, Style, StyleCoverage, StyleFamily } from "@/lib/types";

/* The fabric studio: pick the cuts this cloth gets stitched into, render them,
   review them, publish them.

   Everything here is vendor-authored on purpose. A shopper only ever sees a
   combination a human chose, priced and published — which is what stops the
   catalog filling up with cuts the tailor can't actually make. */

/* Two at a time, once the cloth has been checked. Not a technical limit — the
   server takes eight — but a pace. Every cut is a render the shop pays for and
   then has to look at, and a vendor who fires off eight sits through all of
   them before they can say the second one was wrong. Two comes back fast
   enough to judge, and judging is the only thing that stops the third being
   wrong the same way. */
const PICK_LIMIT = 2;

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
  /** The cut form is a page of its own now, one level deeper in the
      breadcrumbs — so the studio asks the dashboard to open it rather than
      stacking a dialog on itself, the same shape as onRephoto. */
  onEditCut: (form: { mode: "new" | "edit" | "copy"; style?: Style }) => void;
  onCompose: (styleIds: string[]) => Promise<void>;
  /** True while a stitch is running anywhere. It's one at a time, and the job
      outlives this dialog — so the studio is told, it doesn't own it. */
  composing: boolean;
  onPublish: (id: string, published: boolean) => void;
  onPrice: (id: string, price: number) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
  /** "I've looked at this and it's the cloth." */
  /** What came out wrong. `scope` decides whether it's true of this pairing
      only or of the cloth in every cut. */
  onCorrect: (id: string, correction: string, scope: "cut" | "cloth") => void;
  /** The cloth's real colours, corrected against a render that missed them. */
  onFixColor: (fabricId: string, colors: FabricColor[]) => void;
  /** The colour is wrong because the photo is. Hands the vendor back to the
      fabric form, on the picture — either shooting a new one or re-cropping
      what's there. One door for editing a bolt, rather than a second uploader
      living in the studio. */
  onRephoto: (mode: "replace" | "crop") => void;
}

export default function FabricStudio({
  fabric, styles, compositions, onEditCut, onCompose,
  composing, onPublish, onPrice, onNote, onRemove, onCorrect, onFixColor, onRephoto,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoomCloth, setZoomCloth] = useState(false);
  /* Renamed from a local `busy`: the stitch no longer belongs to this page.
     It runs at the page above, survives the studio closing, and can be
     minimised out of the way — so whether one is running is something the
     studio is told, not something it owns. */
  const busy = composing;

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

  /* ── one cut first ──
     Until this cloth has a preview the vendor has actually been through, only
     one cut can be stitched at a time. Everything the render is built from —
     the photo, the colours read off it, the note — is guesswork about a
     garment nobody has seen yet, and the first picture is what turns it into
     something a shop can judge. Finding out from that one that the cloth reads
     orange costs a render; finding out from a batch of eight costs eight, and
     the vendor has to sit through all of them being made before they can say
     so.

     What counts as "been through" is weaker than it was, and deliberately.
     The gate used to require an approval — the vendor pressing "No, it's
     right" on the verdict question each card opened. That question is gone (it
     was asked of everyone whether or not they had anything to say, so the
     answer became reflex), and with it the only signal that anyone had
     actually looked. What is left is that a preview of this cloth exists and
     is current: they have had a real render of this bolt on screen, and if it
     were obviously wrong the studio is where they are standing.

     Stale still doesn't count. Whatever was said about it hasn't been
     rendered yet, so nothing on screen is a current picture of this cloth.

     The colour still counts, and it is a fact about the bolt rather than about
     any one picture — so it's answered on the cloth itself, and a cloth we
     could read no colour from is not held to a question we were never able to
     ask. */
  const colourAnswered = fabric.colorsCorrected || fabric.colors.length === 0;
  const cutChecked = compositions.some(
    (c) =>
      c.status === "ready" &&
      !staleReason(c, styles.find((s) => s.id === c.styleId), fabric)
  );
  const checked = cutChecked && colourAnswered;
  const limit = checked ? PICK_LIMIT : 1;
  /* A cut counts as done only while its render still matches its note. Edit
     the note and it becomes pickable again, which is how a re-stitch is
     asked for — no separate mode, the same button as the first time. */
  const done = (styleId: string): boolean => {
    const c = byStyle.get(styleId);
    return !!c && c.status === "ready"
      && !staleReason(c, styles.find((s) => s.id === styleId), fabric);
  };
  const unrendered = cuts.filter((c) => !done(c.id));

  /* At a limit of one, picking a second cut swaps rather than refuses. A
     disabled chip would read as "this cut is unavailable", which is not what's
     being said — any one of them can be the first, just not two. */
  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : limit === 1 ? [id]
        : cur.length >= limit ? cur : [...cur, id]
    );

  const pickSuggested = () => setPicked(unrendered.slice(0, limit).map((c) => c.id));

  /* ── the colour question, asked of the cloth ──
     It lives here rather than on each preview because a colour is a fact about
     the bolt however it's cut: answering it eight times, once per card, is the
     same answer eight times, and any two of them could disagree. Asked
     directly under the fabric's photo, with the previews below in the same scroll,
     which is the comparison being asked for — the picture we made against the
     cloth in their hand.

     Only once a preview exists. Before that there is nothing to judge the
     reading against except the photo it was read off. */
  const [colourFix, setColourFix] = useState(false);
  const [colors, setColors] = useState<FabricColor[]>(fabric.colors);
  /* The strip stays after it's answered, as a line saying what the cloth is
     with a way back into it. An answer that can't be revised is a trap: a
     vendor confirms the colour on the first preview, sees the third one and
     realises it was the light, and the only door back would have been
     replacing the photo. */
  const anyReady = compositions.some((c) => c.status === "ready");
  const askColour = anyReady && !fabric.colorsCorrected;

  /* "Yes" and a hand-set list write the same flag, because they are the same
     evidence: a shop that has looked at a garment beside the bolt and stood by
     these words. Confirming leaves the words untouched, so nothing goes stale
     — staleness compares the colours themselves, not who last said them. */
  const confirmColours = () => onFixColor(fabric.id, fabric.colors);
  const saveColours = () => {
    if (JSON.stringify(colors) !== JSON.stringify(fabric.colors)) onFixColor(fabric.id, colors);
    else confirmColours();
    setColourFix(false);
  };

  /* One path for every stitch this modal starts, including the re-stitch on a
     card. That button used to call onCompose directly, which meant it showed
     no overlay, disabled nothing, and threw its errors into the void — press
     it and the only evidence anything had happened was the picture changing a
     minute later. */
  const stitch = async (styleIds: string[]) => {
    if (styleIds.length === 0 || busy) return;
    setError(null);
    try {
      await onCompose(styleIds);
      setPicked([]);
    } catch (e: any) {
      setError(e?.message || "Could not render — please try again.");
    }
  };

  /* Sliced rather than trusted: the limit can drop to one under a selection
     already made — a correction saved on a card while three cuts are ticked
     does exactly that — and the press that follows would otherwise spend three
     renders on a cloth we've just been told we had wrong. */
  const run = () => stitch(picked.slice(0, limit));

  return (
    /* A page under the dashboard's breadcrumbs now, not a dialog — back and
       the trail live in the header above, and leaving mid-stitch abandons
       nothing: the job runs at the page and keeps its own progress on
       screen. */
    <div className="panel" style={{ padding: "26px 26px 30px" }}>
      <>

        {/* ── the cloth ── */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
          {/* Tappable, because this photo is the render. Everything below was
              drawn from these pixels, so a vendor asking "why has it come out
              orange" needs to see the picture full size — at 96px a tube-lit
              bolt and a warm bolt look identical — and to be able to fix it
              from the same place they noticed. */}
          <button type="button" onClick={() => setZoomCloth(true)}
            title="See this photo full size, crop or replace it"
            aria-label="See the cloth photo full size"
            style={{ padding: 0, border: "none", background: "none", lineHeight: 0, cursor: "zoom-in", flexShrink: 0, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
            <img src={fabric.image} alt={fabric.name}
              style={{ width: 96, height: 96, objectFit: "cover", display: "block", background: "var(--paper-deep)" }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {fabric.itemCode && (
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: ".08em", color: "var(--stone)" }}>{fabric.itemCode}</div>
            )}
            <div className="ph-display" style={{ fontSize: 23, color: "var(--ink)", lineHeight: 1.25 }}>{fabric.name}</div>
            <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 3 }}>
              {[familyLabel(fabric.family), fabric.composition, fabric.color].filter(Boolean).join(" · ")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 500, marginTop: 3 }}>
              {fabricPrice(fabric.price, fabric.unit)}
            </div>
          </div>
        </div>

        {/* ── is this the colour? ──
            Directly under the photo it's a question about, and above the
            previews it's answered from. */}
        {anyReady && (
          <div style={{
            background: "var(--paper)", borderRadius: "var(--radius-sm)", marginBottom: 18,
            border: "1px solid " + (askColour || colourFix ? "var(--line-strong)" : "var(--line)"),
            padding: askColour || colourFix ? "13px 15px" : "10px 13px",
          }}>
            {!colourFix && !askColour ? (
              /* Answered. One line, and the way back into it. */
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--stone)", lineHeight: 1.5 }}>
                  {fabric.colors.length === 0
                    ? <>No colours set.</>
                    : <>Colour: <b style={{ color: "var(--ink)" }}>{fabric.color}</b></>}
                </span>
                <button className="ph-btn" onClick={() => { setColors(fabric.colors); setColourFix(true); }}
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 2px", minHeight: 28 }}>
                  change
                </button>
              </div>
            ) : !colourFix ? (
              <>
                <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, fontWeight: 600, marginBottom: 5 }}>
                  {fabric.colors.length === 0
                    ? "What colour is this cloth?"
                    : "Is this the colour?"}
                </div>
                <div style={{ fontSize: 12, color: "var(--stone)", lineHeight: 1.6, marginBottom: 9 }}>
                  {fabric.colors.length === 0
                    ? <>None read off the photo.</>
                    : <>Read off the photo: <b style={{ color: "var(--ink)" }}>{fabric.color}</b>.</>}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {fabric.colors.length > 0 && (
                    <button className="ph-btn" onClick={confirmColours}
                      style={{ padding: "8px 14px", minHeight: 36, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", background: "var(--ink)", color: "var(--card)" }}>
                      Yes, that&apos;s it
                    </button>
                  )}
                  <button className="ph-btn" onClick={() => { setColors(fabric.colors); setColourFix(true); }}
                    style={{ padding: "8px 14px", minHeight: 36, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
                    {fabric.colors.length === 0 ? "Set the colours" : "No — set it right"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {/* The photo first, because when the colour is wrong the photo
                    is usually why. Every preview of this bolt is drawn from
                    those pixels, so a warm-lit or counter-heavy picture is a
                    fault at the source — correcting the words underneath it
                    leaves a picture that is still wrong about the weave, the
                    sheen and the shade of every thread in it. */}
                <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "10px 11px" }}>
                  <div style={{ fontSize: 11.5, color: "var(--stone)", lineHeight: 1.55, marginBottom: 8 }}>
                    Fix the <b style={{ color: "var(--ink)" }}>photo</b>, fix everything.
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    <button className="ph-btn" onClick={() => onRephoto("replace")}
                      style={{ padding: "7px 11px", minHeight: 32, fontSize: 11.5, fontWeight: 600, borderRadius: "var(--radius-btn)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
                      shoot it again
                    </button>
                    <button className="ph-btn" onClick={() => onRephoto("crop")}
                      style={{ padding: "7px 11px", minHeight: 32, fontSize: 11.5, fontWeight: 600, borderRadius: "var(--radius-btn)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
                      re-crop this one
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--stone)", lineHeight: 1.55 }}>
                  Or set the colours yourself.
                </div>
                {/* Sampling works off the fabric's photo, which is exactly what
                    is being called wrong — so it isn't offered here. */}
                <ColorList colors={colors} onChange={setColors} image={null} />
                <div style={{ display: "flex", gap: 7 }}>
                  <button className="ph-btn" onClick={saveColours}
                    style={{ padding: "8px 14px", minHeight: 36, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", background: "var(--ink)", color: "var(--card)" }}>
                    Save the colour
                  </button>
                  <button className="ph-btn" onClick={() => { setColors(fabric.colors); setColourFix(false); }}
                    style={{ padding: "8px 14px", minHeight: 36, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", color: "var(--stone)" }}>
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!fabric.note && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 13px", marginBottom: 18, fontSize: 12, color: "var(--stone)", lineHeight: 1.6 }}>
            No note yet — add one.
          </div>
        )}

        {/* ── pick the cuts ── */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <div className="ph-display" style={{ fontSize: 17, color: "var(--ink)" }}>stitch this into</div>
          <button className="ph-btn" onClick={() => onEditCut({ mode: "new" })}
            style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
            + add your own cut
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12, lineHeight: 1.6 }}>
          {checked ? <>Up to {PICK_LIMIT} at a time.</> : <>Start with one.</>}
        </div>

        {cuts.length === 0 ? (
          <div style={{ color: "var(--stone)", fontSize: 13, padding: "18px 0" }}>
            No cuts for {familyLabel(fabric.family)} yet.
          </div>
        ) : (
          /* A list rather than a wall of chips. A shop with thirty cuts had
             thirty buttons here, all the same size and most of them wrong for
             this bolt, and the two that mattered were somewhere in the middle
             of it. The dropdown holds the whole library and gives back one at a
             time; what's picked is what's on screen as a chip. */
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            {/* Ours rather than a native <select>, because these rows carry more
                than a name: what the cut makes, whose it is, and why some of
                them can't be picked right now. An <option> holds one string, so
                all four used to arrive as one run-on line of grey. */}
            <Dropdown value="" ariaLabel="Add a cut to stitch this cloth into"
              disabled={busy || picked.length >= limit}
              onChange={(id) => toggle(id)}
              placeholder={picked.length >= limit
                ? (limit === 1 ? "One cut first" : `${limit} picked — the limit`)
                : "Choose a cut…"}
              options={cuts.map((c) => {
                const isDone = done(c.id);
                return {
                  value: c.id,
                  label: c.name,
                  /* Which pieces this cut makes. Without it the vendor cannot
                     tell "Kurtha" the top from "Kurtha" the set until a render
                     comes back half an outfit short. */
                  meta: (c.coverage === "set" ? "set" : c.coverage) + (c.shopId ? " · yours" : ""),
                  note: isDone
                    ? "Already stitched"
                    : picked.includes(c.id) ? "Picked" : undefined,
                };
              })} />

            {picked.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {picked.map((id) => {
                  const c = cuts.find((x) => x.id === id);
                  if (!c) return null;
                  const mine = !!c.shopId;
                  /* Three separate acts on one chip — drop it, change it, and
                     read it — so three controls rather than one that guesses.
                     A button cannot legally contain a button either. */
                  return (
                    <span key={id} style={{
                      display: "inline-flex", alignItems: "stretch", borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--card)",
                      overflow: "hidden",
                    }}>
                      <span style={{ padding: "8px 4px 8px 13px", fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {c.name}
                        <span style={{ fontSize: 9.5, letterSpacing: ".06em", opacity: 0.7, textTransform: "uppercase" }}>
                          {c.coverage === "set" ? "set" : c.coverage}
                        </span>
                        {mine && <span style={{ fontSize: 9.5, letterSpacing: ".08em", opacity: 0.75 }}>YOURS</span>}
                      </span>
                      <button type="button" className="ph-btn"
                        onClick={() => onEditCut({ mode: mine ? "edit" : "copy", style: c })}
                        title={mine ? "Change this cut" : "Library cut — take a copy you can change"}
                        aria-label={mine ? "Change " + c.name : "Copy " + c.name}
                        style={{ padding: "0 8px", fontSize: 11, border: "none", background: "none", color: "var(--card)", cursor: "pointer" }}>
                        <Icon name={mine ? "edit" : "copy"} />
                      </button>
                      <button type="button" className="ph-btn" onClick={() => toggle(id)}
                        aria-label={"Remove " + c.name}
                        style={{ padding: "0 9px", fontSize: 11, border: "none", borderLeft: "1px solid rgba(255,255,255,.3)", background: "none", color: "var(--card)", cursor: "pointer" }}>
                        <Icon name="close" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <button className="ph-btn btn-solid" disabled={busy || picked.length === 0} onClick={run}
            style={{ padding: "11px 22px", fontSize: 12, opacity: busy || picked.length === 0 ? 0.5 : 1 }}>
            {busy ? "stitching…"
              : !checked ? (picked.length ? "stitch this one first" : "stitch one first")
              : picked.length ? `stitch ${picked.length} cut${picked.length !== 1 ? "s" : ""}` : "stitch"}
          </button>
          {checked && unrendered.length > 0 && !busy && (
            <button className="ph-btn" onClick={pickSuggested}
              style={{ fontSize: 12, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              pick {Math.min(limit, unrendered.length)} for me
            </button>
          )}
          {/* The bill, before the press rather than after it. `limit` and not
              `picked.length`: run() slices the selection down to it, so a
              vendor with three ticked under a limit of one is spending one and
              the line has to say one. */}
          {checked && picked.length > 0 && !busy && (
            <span style={{ fontSize: 11.5, color: "var(--stone)", lineHeight: 1.5 }}>
              {creditCost(Math.min(picked.length, limit))}
              {picked.length >= PICK_LIMIT && " " + PICK_LIMIT + " at a time is the limit."}
            </span>
          )}
          {!checked && rendered.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--stone)", lineHeight: 1.5 }}>
              {!colourAnswered
                ? "Answer the colour question above and check a preview below — then they go two at a time."
                : "Check a preview below and they go two at a time."}
            </span>
          )}
        </div>
        {error && (
          <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8 }}>{error}</div>
        )}

        {/* ── what's been made ── */}
        {compositions.length > 0 && (
          <>
            <div className="ph-display" style={{ fontSize: 17, color: "var(--ink)", margin: "26px 0 4px" }}>
              stitched previews
            </div>
            <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 13, lineHeight: 1.6 }}>
              Publish only what looks right.
            </div>
            <div className="studio-grid">
              {compositions.map((c) => (
                <RenderCard key={c.id} composition={c}
                  style={styles.find((s) => s.id === c.styleId)}
                  fabric={fabric}
                  busy={busy}
                  onPublish={onPublish} onPrice={onPrice} onNote={onNote} onRemove={onRemove}
                  onCorrect={onCorrect} />
              ))}
            </div>
          </>
        )}

        {compositions.length === 0 && !busy && (
          <div style={{ marginTop: 22, padding: "22px 18px", background: "var(--paper)", border: "1px dashed var(--line)", borderRadius: "var(--radius-sm)", textAlign: "center", color: "var(--stone)", fontSize: 12.5, lineHeight: 1.7 }}>
            Nothing stitched yet.
          </div>
        )}

        {rendered.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 11.5, color: "var(--stone)" }}>
            {rendered.filter((c) => c.published).length} of {rendered.length} published
          </div>
        )}

      {zoomCloth && (
        <ImageZoom src={fabric.image} alt={fabric.name} onClose={() => setZoomCloth(false)}
          actions={
            <>
              <button className="ph-btn" onClick={() => onRephoto("crop")}
                style={{ padding: "9px 14px", minHeight: 38, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", background: "rgba(255,255,255,.16)", color: "#fff" }}>
                crop again
              </button>
              <button className="ph-btn" onClick={() => onRephoto("replace")}
                style={{ padding: "9px 14px", minHeight: 38, fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-btn)", background: "rgba(255,255,255,.16)", color: "#fff" }}>
                retake photo
              </button>
            </>
          } />
      )}

      </>
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
  minimized = false, onMinimize, onExpand,
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
  /* Minimising is a change of size, not a teardown. Both forms are this one
     component precisely so the timers below keep running across the toggle —
     unmounting the overlay and mounting a separate bar would restart the
     clock, and a progress bar that jumps back to 4% reads as a render that
     failed and started over. */
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
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

  /* Out of the way but still running: a bar in the corner with the cloth, the
     percentage and a way back. Nothing about the job changes — only how much
     of the screen it is entitled to while the vendor gets on with pricing the
     last batch. */
  if (minimized) {
    return (
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: "var(--z-dialog)", maxWidth: "min(92vw, 330px)", background: "var(--stage)", color: "#fff", borderRadius: "var(--radius-md)", boxShadow: "0 14px 40px rgba(0,0,0,.4)", overflow: "hidden" }}>
        <button type="button" onClick={onExpand} aria-label="Show the stitch in progress"
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 13px", background: "none", border: "none", color: "inherit", cursor: "pointer", textAlign: "left" }}>
          <img src={image} alt="" style={{ width: 34, height: 34, borderRadius: "var(--radius-xs)", objectFit: "cover", flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {messages[msg % messages.length]}
            </span>
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {progress}% · {caption}
            </span>
          </span>
          {/* A word, not an icon: the set has no expand glyph, and "open"
              there is an external-link arrow that would promise a new tab. */}
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.75)", flexShrink: 0 }}>show</span>
        </button>
        <div style={{ height: 3, background: "rgba(255,255,255,.2)" }}>
          <div style={{ height: "100%", width: progress + "%", background: "#fff", transition: "width .3s linear" }} />
        </div>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: "var(--z-dialog)", background: "var(--stage)", overflow: "hidden" }}>
      {onMinimize && (
        <button type="button" onClick={onMinimize} className="ph-btn"
          style={{ position: "absolute", top: 14, right: 14, zIndex: 1, display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 12, fontWeight: 600, padding: "9px 14px", borderRadius: "var(--radius-pill)" }}>
          keep working
        </button>
      )}

      {/* the cloth itself, dimmed — the thing being worked on, not decoration */}
      <img src={image} alt="" aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(26px) brightness(.42) saturate(1.1)", transform: "scale(1.15)" }} />

      {/* One centred column: the subject (the ee, or the stitched piece once
          it exists) with the words directly under it — not pinned to the
          bottom edge with a screen of empty dark between them. */}
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "26px 14px", textAlign: "center" }}>
        {preview ? (
          /* The blurred copy of the fabric behind this is what the piece is
             meant to sit in, so it feathers into it rather than casting a
             shadow onto it — and the drop shadow went with the frame, since
             the mask covers the border box and would have eaten it anyway. */
          <img src={preview} alt="The stitched piece" className="fade-up img-blend"
            style={{ maxWidth: "min(78%, 320px)", maxHeight: "52vh", minHeight: 0, objectFit: "contain", borderRadius: "var(--radius-md)" }} />
        ) : (
          <EeMark size="clamp(38px, 12vw, 64px)" looking color="#fff" />
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.16)", borderRadius: "var(--radius-pill)", padding: "5px 14px 5px 5px", maxWidth: "88vw" }}>
            <img src={image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {caption}
            </span>
          </div>
          <div key={msg} className="peek ph-display" style={{ fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.35, fontWeight: 600, color: "#fff", maxWidth: 340, padding: "0 6px" }}>
            {messages[msg % messages.length]}
          </div>
          <div style={{ width: "min(72vw, 300px)", height: 5, borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: progress + "%", borderRadius: "var(--radius-sm)", background: "#fff", transition: "width .3s linear" }} />
          </div>
          <div style={{ color: "rgba(255,255,255,.55)", fontSize: 11.5, lineHeight: 1.5, maxWidth: 320, padding: "0 8px" }}>
            {progress}% · {slow ? STITCH_SLOW : footer}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Where the vendor is in the card's question: asking, or writing down the
   answer. The colour half of the check lives up at the cloth, not here. */
/* One step now. There used to be a "rest" step in front of this one that
   opened itself on every finished render — "Anything else wrong with it?", two
   buttons, on all eight cards of a batch. It was asked whether or not the
   vendor had anything to say, which is how a question stops being read: the
   fast answer was always "No — it's right", and a form that trains people to
   dismiss it unread is worse at catching faults than no form. Saying something
   is wrong is now something you go and do, not something you get asked. */
type CheckStep = "fault";

/* ── one render ── */
function RenderCard({
  composition, style, fabric, busy,
  onPublish, onPrice, onNote, onRemove, onCorrect,
}: {
  composition: Composition;
  style?: Style;
  fabric: Fabric;
  busy: boolean;
  onPublish: (id: string, published: boolean) => void;
  onPrice: (id: string, price: number) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
  onCorrect: (id: string, correction: string, scope: "cut" | "cloth") => void;
}) {
  const c = composition;
  const [price, setPrice] = useState(String(c.price || ""));
  const [note, setNote] = useState(c.note);
  const [zoom, setZoom] = useState(false);
  const styleName = style?.name ?? "Cut";
  const why = staleReason(c, style, fabric);
  const stale = why !== null;

  /* ── reporting a fault, when there is one ──
     The colour is asked once, of the cloth, under its photo at the top of the
     studio: it is a fact about the bolt however it's cut, and asked per card it
     would be the same question eight times with eight chances to answer it
     differently. What's left here is everything a picture can get wrong on its
     own — the cut, the length, where the pattern fell — and all of it can only
     be words.

     Opened by the vendor, never by us. `step` has no auto-open behind it any
     more, so a finished render is just a finished render. */
  const [step, setStep] = useState<CheckStep | null>(null);
  const open = step;

  const [faultScope, setFaultScope] = useState<"cut" | "cloth">("cut");
  const [fault, setFault] = useState("");

  /* The scope is chosen before the text, not after, so the box can show what
     that scope already says — otherwise "save" silently replaces an earlier
     complaint and the render goes back to making the fault already reported. */
  const scopeText = (s: "cut" | "cloth") => (s === "cut" ? c.correction : fabric.correction);
  const pickScope = (s: "cut" | "cloth") => {
    setFaultScope(s);
    setFault(scopeText(s));
  };

  const saveFault = () => {
    const text = fault.trim();
    // Unchanged means nothing to re-stitch for — closing is the honest no-op.
    if (text !== scopeText(faultScope).trim()) onCorrect(c.id, text, faultScope);
    setStep(null);
  };

  /** Opens the form with whatever was already said at that scope, so saving
      adds to a complaint rather than quietly replacing it. */
  const reportFault = () => {
    setFaultScope("cut");
    setFault(c.correction);
    setStep("fault");
  };

  return (
    <div style={{ background: "var(--card)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid " + (c.published ? "var(--ink)" : "var(--line)") }}>
      <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {c.status === "ready" && c.image ? (
          <button type="button" onClick={() => setZoom(true)} title="View larger"
            style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
            <img src={c.image} alt={styleName} className="img-blend" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ) : c.status === "failed" ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--warn)", fontSize: 12, lineHeight: 1.6 }}>
            Didn&apos;t come out.<br />
            <span style={{ color: "var(--stone)", fontSize: 11 }}>Delete and try again.</span>
          </div>
        ) : (
          <div style={{ color: "var(--stone)", fontSize: 12 }}>stitching…</div>
        )}
        {c.status === "ready" && (
          <span style={{ position: "absolute", top: 10, left: 10, background: "var(--stage-veil)", color: "var(--on-slab)", fontSize: 9.5, fontWeight: 500, letterSpacing: ".09em", padding: "4px 9px", borderRadius: "var(--radius-xs)" }}>
            STYLE PREVIEW
          </span>
        )}
        {/* What made this picture has moved on. Said on the image itself,
            because that image is now the thing that's wrong. */}
        {stale && (
          <span style={{ position: "absolute", top: 10, right: 10, background: "var(--warn)", color: "var(--on-accent)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".08em", padding: "4px 9px", borderRadius: "var(--radius-xs)" }}>
            {why === "photo" ? "NEW CLOTH PHOTO"
              : why === "cut" ? "CUT CHANGED"
              : why === "fix" ? "FIX ASKED FOR"
              : why === "colour" ? "COLOUR SET"
              : why === "cloth" ? "CLOTH CORRECTED"
              : "NOTE CHANGED"}
          </span>
        )}
        {/* No CHECKED badge any more. It could only be earned by answering the
            verdict question that used to open here, and with that gone the
            badge would have marked nothing — every card unbadged forever. */}
      </div>
      <div style={{ padding: "12px 13px 13px" }}>
        <div style={{ fontWeight: 500, fontSize: 11.5, letterSpacing: ".1em", marginBottom: 8 }}>{styleName}</div>
        {c.status === "ready" && (
          <>
            {open && (
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "9px 10px", marginBottom: 8 }}>
                {open === "fault" && (
                  <>
                    <div style={{ fontSize: 11.5, color: "var(--ink)", lineHeight: 1.5, marginBottom: 7 }}>
                      What&apos;s wrong?
                    </div>
                    {/* The buttons say what they do, so the group's label is
                        for screen readers only — reading "Just this cut" out of
                        nowhere is the one way to meet these without the
                        surrounding page to explain them. */}
                    <div role="group" aria-label="What this applies to"
                      style={{ display: "flex", gap: 6, marginBottom: 7 }}>
                      {([["cut", "Just this cut"], ["cloth", "This cloth, any cut"]] as const).map(([s, label]) => (
                        <button key={s} className="ph-btn" onClick={() => pickScope(s)} aria-pressed={faultScope === s}
                          style={{
                            flex: 1, padding: "7px 8px", minHeight: 32, fontSize: 11, fontWeight: 600, borderRadius: "var(--radius-btn)",
                            background: faultScope === s ? "var(--ink)" : "var(--card)",
                            color: faultScope === s ? "var(--card)" : "var(--ink)",
                            border: "1px solid " + (faultScope === s ? "var(--ink)" : "var(--line)"),
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* Neither placeholder mentions colour any more — that
                        question has its own step and its own control, and an
                        example here would send the one fault we can have shown
                        to us back into a sentence. */}
                    <textarea value={fault} maxLength={300} autoFocus
                      aria-label="What came out wrong"
                      onChange={(e) => setFault(e.target.value)}
                      placeholder={faultScope === "cloth"
                        ? "e.g. border on both edges"
                        : "e.g. lapel too wide"}
                      style={{ width: "100%", padding: "7px 9px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 12, background: "var(--card)", minHeight: 52, resize: "vertical", fontFamily: "inherit" }} />
                    {/* The sentence that used to sit here — "every preview of
                        this cloth will be marked for re-stitching" — was the
                        two buttons above said a second time in longer words.
                        The badge appears on the cards the moment this saves,
                        which teaches it better than a caption nobody reads
                        twice. */}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="ph-btn" onClick={saveFault}
                        style={{ padding: "7px 12px", minHeight: 32, fontSize: 11.5, fontWeight: 600, borderRadius: "var(--radius-btn)", background: "var(--ink)", color: "var(--card)" }}>
                        Save
                      </button>
                      <button className="ph-btn" onClick={() => setStep(null)}
                        style={{ padding: "7px 12px", minHeight: 32, fontSize: 11.5, fontWeight: 600, borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", color: "var(--stone)" }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* The whole way in now, and open on every finished render rather
                than only on one already signed off. A picture can turn out to
                be wrong at any point — they publish it, see it on the
                storefront, look again — and a stale one can be wrong for a
                second reason besides the one that made it stale. */}
            {!open && (
              <button className="ph-btn" onClick={reportFault}
                style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 2px", minHeight: 28 }}>
                something&apos;s off with this →
              </button>
            )}

            <input
              value={price} inputMode="numeric" placeholder="Price (NPR)" aria-label="Price in NPR for this cut"
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              onBlur={() => onPrice(c.id, Number(price || 0))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 13, background: "var(--card)", marginBottom: 8 }}
            />
            {/* Refines the cut for this cloth only. It cannot add or remove a
                piece — that's the cut's own top/bottom/set, and try-on reads
                that to know where the garment goes. */}
            <textarea
              value={note} maxLength={300} placeholder="Note (optional)" aria-label="Note for this cloth in this cut (optional)"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => { if (note.trim() !== c.note.trim()) onNote(c.id, note.trim()); }}
              style={{ width: "100%", padding: "7px 9px", borderRadius: "var(--radius-btn)", border: "1px solid " + (stale ? "var(--warn)" : "var(--line)"), fontSize: 12, background: "var(--card)", marginBottom: 8, minHeight: 46, resize: "vertical", fontFamily: "inherit" }}
            />
            {/* Why this picture is out of date, and where to do something about
                it. The "stitch again" button that used to sit here was a second
                door to the one above: a stale cut stops counting as done, which
                puts it straight back in the cut list at the top of the studio,
                already the way every other stitch is started. Two buttons for
                one act meant two places to read a limit from, and only one of
                them actually enforced it. */}
            {stale && (
              <div style={{ fontSize: 11, color: "var(--stone)", lineHeight: 1.5, marginBottom: 8 }}>
                {why === "photo"
                  ? "Stitched from the old photo."
                  : why === "cut"
                  ? "The cut has changed."
                  : why === "fix"
                  ? "A fix was asked for."
                  : why === "colour"
                  ? "Colours set since this render."
                  : why === "cloth"
                  ? "The cloth was corrected."
                  : "Made before that note."}
                {" Re-pick above to re-stitch."}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--stone)" }}>{c.price > 0 ? npr(c.price) : "no price yet"}</span>
              <span style={{ display: "flex", gap: 2 }}>
                <button className="ph-btn" onClick={() => onPublish(c.id, !c.published)}
                  title={c.price > 0 ? "" : "Set a price first"}
                  aria-pressed={c.published}
                  disabled={!c.published && c.price <= 0}
                  style={{ fontSize: 12.5, padding: "8px 10px", fontWeight: 600, color: c.published ? "var(--ok)" : "var(--stone)", opacity: !c.published && c.price <= 0 ? 0.45 : 1 }}>
                  {c.published ? "Published" : "Publish"}
                </button>
                <button className="ph-btn"
                  onClick={async () => {
                    const ok = await confirmAsync({
                      title: "Delete this preview?",
                      body: "The rendered preview goes; the fabric and the cut stay. Stitching it again costs a render.",
                      confirmLabel: "Delete", destructive: true,
                    });
                    if (ok) onRemove(c.id);
                  }}
                  style={{ fontSize: 12.5, padding: "8px 10px", fontWeight: 600, color: "var(--danger)" }}>
                  Delete
                </button>
              </span>
            </div>
          </>
        )}
        {c.status === "failed" && (
          <button className="ph-btn" onClick={() => onRemove(c.id)}
            style={{ fontSize: 11, padding: "4px 6px", fontWeight: 500, color: "var(--stone)" }}>Delete</button>
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
export function ImageZoom({ src, alt, onClose, actions }: {
  src: string;
  alt: string;
  onClose: () => void;
  /** What can be done to this picture while it's up. The cloth photo has two
      — crop it again, shoot it again — because full size is where a vendor
      finally sees what the render was working from. */
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: "var(--z-popover)", background: "rgba(26,23,20,.7)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
      <button className="ph-btn" onClick={onClose} aria-label="Close"
        style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 15, padding: "9px 11px", borderRadius: "var(--radius-pill)" }}>
        <Icon name="close" />
      </button>
      <img src={src} alt={alt} className="fade-up"
        style={{ maxWidth: "94%", maxHeight: actions ? "80%" : "94%", objectFit: "contain", borderRadius: "var(--radius-md)", boxShadow: "0 22px 64px rgba(0,0,0,.5)" }} />
      {/* Stops the scrim's click-to-close: a tap on "crop again" is not a tap
          on the backdrop, and closing underneath the action would fire both. */}
      {actions && (
        <div onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", bottom: 22, display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", cursor: "default" }}>
          {actions}
        </div>
      )}
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
export function CutPage({ family, pickFamily, mode, initial, onClose, onSave, setLeaveGuard }: {
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
  /** Registers the dirty check every way off this page runs through. */
  setLeaveGuard: (fn: (() => Promise<boolean>) | null) => void;
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

  const [cropping, setCropping] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setCropping(await fileToDataURL(file)); }
    catch { setError("Could not read that image. Try a JPG or PNG."); }
    setBusy(false);
  };

  const describable = Boolean(image || hint.trim());
  const canSave = Boolean(name.trim() && describable && !busy);

  /* As a dialog this discarded typed work on a backdrop-tap without asking;
     as a page, back and every crumb run through this first. Compared against
     what the form opened with, so a copy's pre-filled wording only counts
     once the vendor has actually changed something. */
  const dirty =
    name !== (mode === "copy" && initial ? initial.name + " (ours)" : initial?.name ?? "")
    || hint !== (initial?.hint ?? "")
    || coverage !== (initial?.coverage ?? "set")
    || image !== (initial?.refImage ?? null)
    || fam !== (initial?.family ?? family);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    setLeaveGuard(async () => !dirtyRef.current || confirmAsync({
      title: "Discard changes?",
      body: "This cut isn't saved yet. Discard what you've filled in?",
      confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true,
    }));
    return () => setLeaveGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    /* The page header above already says which of the three jobs this is —
       the trail ends in "change this cut" / "make it your own" / "add your
       own cut" — so the panel starts straight at the explanation. */
    <div className="panel" style={{ padding: "28px 26px" }}>
      <div className="page-split">
      <div>
        {/* A button, not a clickable div — this opens a file picker, so it has
            to be reachable and operable from the keyboard. */}
        <button type="button" onClick={() => fileRef.current?.click()}
          aria-label={image ? "Replace the photo of this cut" : "Add a photo of this cut"}
          style={{ width: "100%", border: "1.5px dashed " + (image ? "var(--ink)" : "var(--line)"), borderRadius: "var(--radius-sm)", height: "clamp(260px, 38vw, 400px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 6, overflow: "hidden", background: "var(--paper)", color: "var(--stone)", fontSize: 13.5, textAlign: "center", lineHeight: 1.6, padding: 0 }}>
          {image ? <img src={image} alt="Cut reference" style={{ height: "100%", maxWidth: "100%", objectFit: "contain" }} />
            : <span style={{ padding: 12 }}>Photo of this cut<br /><span style={{ fontSize: 11.5 }}>Any cloth, any colour</span></span>}
        </button>
        <div style={{ fontSize: 11, color: "var(--stone)", lineHeight: 1.55 }}>
          Only the shape is copied.
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>

      <div>
        <div style={{ fontSize: 12.5, color: "var(--stone)", marginBottom: mode === "new" ? 18 : 12, lineHeight: 1.6 }}>
          {mode === "copy"
            ? "Saves your own editable copy."
            : "A photo, words, or both."}
        </div>
        {/* Editing the wording or the pieces changes what this cut means, and
            anything already stitched from it was made under the old meaning. */}
        {mode === "edit" && (
          <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "10px 13px", marginBottom: 16, fontSize: 12, color: "var(--stone)", lineHeight: 1.6 }}>
            Edits mark renders for re-stitching.
          </div>
        )}

        {/* Opened from the fabric studio the family is the cloth's and fixed;
            opened from the designs tab there is no cloth, so it's asked here. */}
        {pickFamily && mode === "new" && (
          <label className="field" style={{ marginBottom: 14 }}>Which family?
            <select value={fam} onChange={(e) => setFam(e.target.value as StyleFamily)}
              style={{ width: "100%", padding: "11px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", backgroundColor: "var(--card)", fontSize: 13.5 }}>
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
                background: coverage === c.id ? "var(--ink)" : "var(--paper)",
                color: coverage === c.id ? "var(--card)" : "var(--ink)",
                border: "1px solid " + (coverage === c.id ? "var(--ink)" : "var(--line)"),
              }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--stone)", marginBottom: 16, lineHeight: 1.55 }}>
          {COVERAGES.find((c) => c.id === coverage)?.note}
        </div>

        <label className="field">Describe the cut
          <textarea value={hint} maxLength={400} onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. one-button peak lapel" />
        </label>

        {!describable && (
          <div style={{ fontSize: 11.5, color: "var(--stone)", marginTop: 8, lineHeight: 1.55 }}>
            Add a photo or description.
          </div>
        )}
        {error && <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ph-btn" onClick={onClose} disabled={busy}
            style={{ flex: 1, color: "var(--ink)", padding: 13, fontSize: 12, letterSpacing: ".12em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
          <button className="ph-btn" disabled={!canSave} onClick={save}
            style={{ flex: 2, background: canSave ? "var(--ink)" : "var(--line)", color: canSave ? "var(--card)" : "var(--stone)", padding: 13, fontSize: 12, letterSpacing: ".12em", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
            {busy ? "saving…" : mode === "edit" ? "save changes" : mode === "copy" ? "save my version" : "save cut"}
          </button>
        </div>
      </div>
      </div>

      {cropping && (
        <ImageCropper src={cropping} title="Crop to the cut"
          hint="Keep the stitched piece and leave the rest of the shop out. Only its shape is copied — never its colour or cloth."
          onCancel={() => setCropping(null)}
          onDone={(dataUrl) => { setCropping(null); setImage(dataUrl); }} />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { npr, fabricPrice, familyLabel, creditCost } from "@/lib/constants";
import Icon from "@/components/Icon";
import { PICK_LIMIT } from "@/components/FabricStudio";
import { COVERAGES, staleReason } from "@/lib/types";
import type { Composition, Fabric, Style } from "@/lib/types";

/* ── the cut studio: the fabric studio, run the other way round ──

   The studio has always started from the cloth: open a bolt, pick the cuts it
   gets stitched into. That is the right door when a shop has just taken
   delivery of a bolt and wants to know what it makes.

   It is the wrong door for the other half of the job, which vendors were
   doing anyway by opening bolts one at a time: "this kurta shape sells —
   which of my cloths would it look good in?" A cut is a thing a shop owns and
   sells too, and until now the only button on a cut card was Edit. So a cut
   opens here, the bolts are what you pick, and the compose call underneath is
   the same one the fabric studio makes — one style, one fabric, once per
   press.

   Deliberately NOT a second place to price, publish, note or correct a
   render. Those all belong to a fabric-and-cut pairing and already live in
   the fabric studio; giving them a second home would mean two screens that
   have to agree about the same row. What's been stitched is shown here, and
   tapping it goes to the one place that edits it. */

interface Props {
  cut: Style;
  /** Every bolt the shop has. Filtered to the cut's family here — a lehenga
      silhouette has nothing to say about a suit length, same rule as the
      fabric studio's cut list. */
  fabrics: Fabric[];
  /** Every composition; the ones made from this cut are picked out here. */
  compositions: Composition[];
  /** The dashboard's composeFabric, unchanged: one bolt, one cut. */
  onCompose: (fabricId: string, styleIds: string[]) => Promise<void>;
  /** True while a stitch is running anywhere — it's one at a time. */
  composing: boolean;
  onEditCut: (form: { mode: "new" | "edit" | "copy"; style?: Style }) => void;
  /** One fit, on its own page — where it is priced, published and complained
      about. The composition, not the bolt: a vendor pointing at one picture
      is asking about that picture. */
  onOpenFit: (compositionId: string) => void;
  onAddFabric: () => void;
}

export default function CutStudio({
  cut, fabrics, compositions, onCompose, composing, onEditCut, onOpenFit, onAddFabric,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /* The parent's `composing` drops to false between two bolts in one press —
     it is set per compose call — so the press keeps its own flag or the
     button would flicker back to life mid-batch. */
  const [running, setRunning] = useState(false);
  const busy = composing || running;

  const mine = !!cut.shopId;
  const coverage = COVERAGES.find((c) => c.id === cut.coverage);

  const bolts = useMemo(
    () => fabrics.filter((f) => f.family === cut.family),
    [fabrics, cut.family]
  );

  /* This cut's own renders, by bolt. Only one per bolt can be current, so a
     map is enough — a re-stitch replaces the row rather than adding one. */
  const byFabric = useMemo(() => {
    const m = new Map<string, Composition>();
    for (const c of compositions) {
      if (c.styleId === cut.id && c.fabricId) m.set(c.fabricId, c);
    }
    return m;
  }, [compositions, cut.id]);

  /* Same definition of "done" the fabric studio uses: a ready render that
     still matches everything it was made from. Edit the cut, correct the
     cloth or change its photo and the bolt becomes stitchable again — which
     is how a re-stitch is asked for here too, no separate mode. */
  const done = (fabricId: string): boolean => {
    const c = byFabric.get(fabricId);
    return !!c && c.status === "ready"
      && !staleReason(c, cut, bolts.find((f) => f.id === fabricId));
  };

  /* Picking past the limit swaps the oldest out rather than refusing: a
     disabled tile would read as "this cloth can't be used", which is not what
     is being said — any two of them can go, just not five. */
  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= PICK_LIMIT ? [...cur.slice(1), id]
        : [...cur, id]
    );

  /* One press, one bolt at a time, in order. Sequential rather than parallel
     because the dashboard runs one stitch at a time on purpose — two at once
     is two bills, a slower queue for both, and a progress bar that can only
     honestly describe one of them.

     It stops at the first failure instead of pressing on. The things that
     fail a stitch — the month's allowance, an unapproved shop — fail the
     next one the same way, and a vendor who has just been told they are out
     of allowance should not watch it happen again. Whatever hadn't run stays
     ticked, so pressing again picks up where it stopped. */
  const run = async () => {
    const targets = picked.slice(0, PICK_LIMIT);
    if (targets.length === 0 || busy) return;
    setError(null);
    setRunning(true);
    const left: string[] = [];
    let stopped: string | null = null;
    try {
      for (const fabricId of targets) {
        if (stopped) { left.push(fabricId); continue; }
        try {
          await onCompose(fabricId, [cut.id]);
        } catch (e: any) {
          stopped = e?.message || "Could not stitch that one — please try again.";
          left.push(fabricId);
        }
      }
    } finally {
      setRunning(false);
      setPicked(left);
      setError(stopped);
    }
  };

  /* Everything made from this cut, newest bolts first by name so the grid
     doesn't reshuffle under a vendor between two renders. */
  const stitched = useMemo(() => {
    const boltById = new Map(fabrics.map((f) => [f.id, f]));
    return compositions
      .filter((c) => c.styleId === cut.id && c.status === "ready" && c.image
        && c.fabricId && boltById.has(c.fabricId))
      .map((c) => ({ c, fabric: boltById.get(c.fabricId!)! }))
      .sort((a, b) => a.fabric.name.localeCompare(b.fabric.name));
  }, [compositions, fabrics, cut.id]);

  const unstitched = bolts.filter((f) => !done(f.id));

  return (
    <div className="panel" style={{ padding: "26px 26px 30px" }}>
      {/* ── the cut ──
          A cut is words first and a picture second (see style-library.ts), so
          the reference photo is optional here and the words never are. */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{
          width: 96, height: 96, flexShrink: 0, borderRadius: "var(--radius-sm)",
          background: "var(--paper-deep)", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--stone)",
        }}>
          {cut.refImage
            ? <img src={cut.refImage} alt={cut.name}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }} />
            : <Icon name="scissors" size={30} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: ".09em", padding: "3px 8px",
              borderRadius: "var(--radius-xs)", textTransform: "uppercase",
              background: "var(--paper)", color: "var(--ink)",
            }}>
              {coverage?.label ?? cut.coverage}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: ".09em", padding: "3px 8px",
              borderRadius: "var(--radius-xs)",
              background: mine ? "var(--ink)" : "var(--paper-deep)",
              color: mine ? "var(--card)" : "var(--stone)",
            }}>
              {mine ? "YOURS" : "peeq library"}
            </span>
          </div>
          <div className="ph-display" style={{ fontSize: 23, color: "var(--ink)", lineHeight: 1.25 }}>{cut.name}</div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 3 }}>{familyLabel(cut.family)}</div>
          {cut.hint && (
            <div style={{ fontSize: 12.5, color: "var(--stone)", fontStyle: "italic", marginTop: 5, lineHeight: 1.6 }}>
              “{cut.hint}”
            </div>
          )}
          <button className="ph-btn" onClick={() => onEditCut({ mode: mine ? "edit" : "copy", style: cut })}
            title={mine ? "Change this cut" : "Library cut — take a copy you can change"}
            style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 1px" }}>
            <Icon name={mine ? "edit" : "copy"} /> {mine ? "change this cut" : "make it your own"}
          </button>
        </div>
      </div>

      {/* ── pick the cloth ── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div className="ph-display" style={{ fontSize: 17, color: "var(--ink)" }}>stitch it in</div>
        <button className="ph-btn" onClick={onAddFabric}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
          <Icon name="plus" /> add fabric
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 12, lineHeight: 1.6 }}>
        Your {familyLabel(cut.family).toLowerCase()} cloth. Up to {PICK_LIMIT} at a time.
      </div>

      {bolts.length === 0 ? (
        <div style={{ color: "var(--stone)", fontSize: 13, padding: "18px 0", lineHeight: 1.7 }}>
          No {familyLabel(cut.family).toLowerCase()} cloth yet.{" "}
          <button className="ph-btn" onClick={onAddFabric}
            style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
            Add a bolt
          </button>{" "}
          and it can be stitched into this.
        </div>
      ) : (
        /* Photographs, not a dropdown. The fabric studio picks cuts from a
           list because a cut is a name and a sentence; a bolt is a colour and
           a weave, and no vendor recognises theirs by name faster than by
           looking at it. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10, marginBottom: 16 }}>
          {bolts.map((f) => {
            const on = picked.includes(f.id);
            const already = done(f.id);
            return (
              <button key={f.id} type="button" onClick={() => toggle(f.id)} disabled={busy}
                aria-pressed={on}
                title={already ? f.name + " — already stitched in this cut. Pick it to stitch it again." : f.name}
                style={{
                  position: "relative", padding: 0, textAlign: "left", cursor: busy ? "default" : "pointer",
                  background: "var(--card)", borderRadius: "var(--radius-lg)", overflow: "hidden",
                  border: "2px solid " + (on ? "var(--ink)" : "var(--line)"),
                  opacity: busy && !on ? 0.55 : 1,
                }}>
                <div style={{ aspectRatio: "1/1", background: "var(--paper-deep)" }}>
                  <img src={f.image} alt="" className="img-blend"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                {/* the tick, and — when it isn't ticked — whether this bolt
                    has already been through this cut */}
                {on ? (
                  <span style={{
                    position: "absolute", top: 7, right: 7, width: 22, height: 22, borderRadius: "var(--radius-pill)",
                    background: "var(--ink)", color: "var(--card)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="check" size={13} strokeWidth={2.4} />
                  </span>
                ) : already ? (
                  <span style={{
                    position: "absolute", top: 7, right: 7, width: 22, height: 22, borderRadius: "var(--radius-pill)",
                    background: "var(--stage-veil)", color: "var(--on-slab)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }} title="Already stitched">
                    <Icon name="check" size={13} strokeWidth={2.4} label="Already stitched" />
                  </span>
                ) : null}
                {/* Top-left, on the photo — the only part of the tile whose
                    height is fixed. Anchoring it to the bottom of the image
                    means guessing how tall two lines of name-and-price come
                    out, and a chip that lands a pixel low sits on the name. */}
                {!f.inStock && (
                  <span style={{
                    position: "absolute", top: 7, left: 7, background: "var(--ink)", color: "var(--card)",
                    fontSize: 9.5, fontWeight: 600, letterSpacing: ".07em", padding: "2px 6px", borderRadius: "var(--radius-xs)",
                  }}>
                    Sold out
                  </span>
                )}
                <div style={{ padding: "7px 9px 8px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fabricPrice(f.price, f.unit)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {bolts.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <button className="ph-btn btn-solid" disabled={busy || picked.length === 0} onClick={run}
            style={{ opacity: busy || picked.length === 0 ? 0.5 : 1 }}>
            <Icon name="sparkle" />
            {busy ? "stitching…"
              : picked.length ? `stitch ${picked.length} cloth${picked.length !== 1 ? "s" : ""}` : "stitch"}
          </button>
          {unstitched.length > 0 && !busy && picked.length === 0 && (
            <button className="ph-btn" onClick={() => setPicked(unstitched.slice(0, PICK_LIMIT).map((f) => f.id))}
              style={{ fontSize: 12, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              pick {Math.min(PICK_LIMIT, unstitched.length)} for me
            </button>
          )}
          {/* The bill, before the press rather than after it. */}
          {picked.length > 0 && !busy && (
            <span style={{ fontSize: 11.5, color: "var(--stone)", lineHeight: 1.5 }}>
              {creditCost(Math.min(picked.length, PICK_LIMIT))}
            </span>
          )}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8, lineHeight: 1.6 }}>{error}</div>
      )}

      {/* ── what's been made in it ── */}
      {stitched.length > 0 && (
        <>
          <div className="ph-display" style={{ fontSize: 17, color: "var(--ink)", margin: "26px 0 4px" }}>
            already stitched
          </div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 13, lineHeight: 1.6 }}>
            Tap one to price or publish it.
          </div>
          <div className="card-grid">
            {stitched.map(({ c, fabric }) => (
              <button key={c.id} type="button" onClick={() => onOpenFit(c.id)}
                title={"Open " + cut.name + " in " + fabric.name}
                className="fade-up"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left",
                  padding: 0, background: "var(--card)", borderRadius: "var(--radius-card)",
                  overflow: "hidden", cursor: "pointer",
                  border: "1px solid " + (c.published ? "var(--ink)" : "var(--line)"),
                }}>
                <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)" }}>
                  <img src={c.image!} alt={cut.name + " in " + fabric.name} className="img-blend"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span style={{
                    position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 600,
                    letterSpacing: ".1em", padding: "4px 10px", borderRadius: "var(--radius-xs)",
                    background: c.published ? "var(--ink)" : "var(--card)",
                    color: c.published ? "var(--card)" : "var(--stone)",
                  }}>
                    {c.published ? "PUBLISHED" : "DRAFT"}
                  </span>
                  <img src={fabric.image} alt=""
                    style={{ position: "absolute", bottom: 10, left: 10, width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--card)" }} />
                </div>
                <div className="tile-pad">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{fabric.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginTop: 5 }}>
                    {c.price > 0 ? npr(c.price) : <span style={{ color: "var(--stone)", fontWeight: 400 }}>no price yet</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {stitched.length === 0 && bolts.length > 0 && !busy && (
        <div style={{ marginTop: 22, padding: "22px 18px", background: "var(--paper)", border: "1px dashed var(--line)", borderRadius: "var(--radius-sm)", textAlign: "center", color: "var(--stone)", fontSize: 12.5, lineHeight: 1.7 }}>
          Nothing stitched in this cut yet.
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { FABRIC_COLORS, colorHex, colorLabel, normalizeShares } from "@/lib/constants";
import { colorDisagrees, hexToPaletteId } from "@/lib/color-detect";
import ColorWheel from "@/components/ColorWheel";
import Icon from "@/components/Icon";
import type { FabricColor } from "@/lib/types";

/* ── every colour in a cloth, and how much of each ──

   A list, because cloth doesn't come in twos. Plain suiting has one colour, a
   banarasi has five, and a fixed primary/secondary pair either wastes a slot
   or makes the vendor drop a colour that's really there.

   The shares are what the render actually needs. Handed two bare words an
   image model decides for itself which one leads, and it decides differently
   on different runs — that is how a gold border becomes a gold garment.
   "78% maroon, 22% gold" cannot be read two ways. They arrive measured off the
   photo and stay editable, because the vendor is holding the bolt and the
   camera is not.

   Every write goes through normalizeShares, so the list is always proportions
   that sum to one — a deleted colour redistributes rather than leaving the
   render's percentages adding to seventy. */

/** A colour added by hand starts here, and the rest make room proportionally. */
const NEW_SHARE = 0.15;

const isPalette = (id: string) => FABRIC_COLORS.some((c) => c.id === id);

export default function ColorList({ colors, onChange, image }: {
  colors: FabricColor[];
  onChange: (colors: FabricColor[]) => void;
  /** Passed through to the picker, which samples from it. Null where there's
      no photo, or where the photo is the thing being called wrong. */
  image: string | null;
}) {
  /* Which row has its picker open, and which is being named by hand. Keyed by
     index rather than held per-row so only one can be open at a time — the
     picker is tall, and two of them expanded is a form nobody can see the end
     of. */
  const [picking, setPicking] = useState<number | null>(null);
  const [custom, setCustom] = useState<number | null>(null);

  const write = (next: FabricColor[]) => onChange(normalizeShares(next));

  const setAt = (i: number, patch: Partial<FabricColor>) =>
    // Not normalised: editing a word or a shade doesn't change any proportion,
    // and re-basing here would nudge every other row's rounding for nothing.
    onChange(colors.map((c, n) => (n === i ? { ...c, ...patch } : c)));

  const remove = (i: number) => {
    setPicking(null);
    setCustom(null);
    write(colors.filter((_, n) => n !== i));
  };

  const add = () => {
    /* The existing colours keep their proportions relative to each other and
       give up NEW_SHARE between them — the vendor said something is missing,
       not that everything else was measured wrong. */
    const scaled = colors.map((c) => ({ ...c, share: c.share * (1 - NEW_SHARE) }));
    write([...scaled, { id: "", hex: "#cccccc", share: NEW_SHARE }]);
    setCustom(null);
    setPicking(colors.length);
  };

  const applyHex = (i: number, hex: string) =>
    // A shade the vendor moved re-snaps the word — unless they named this
    // colour themselves, in which case their word is the point.
    setAt(i, { hex, id: custom === i ? colors[i].id : hexToPaletteId(hex) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {colors.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--stone)", lineHeight: 1.55 }}>
          No colours set — add them.
        </div>
      )}

      {colors.map((c, i) => {
        const swatch = c.hex || colorHex(c.id) || "#cccccc";
        const typing = custom === i;
        const open = picking === i;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              {/* The swatch is the way into the picker, which is the only thing
                  it can usefully be. It was `<input type="color">` and that
                  handed the one question this form exists to answer to whatever
                  dialog the operating system felt like opening. */}
              <button type="button" onClick={() => setPicking(open ? null : i)}
                aria-expanded={open}
                aria-label={(open ? "Close" : "Open") + " the colour picker for colour " + (i + 1)}
                style={{ width: 50, flexShrink: 0, padding: 3, borderRadius: "var(--radius-field)", border: "1px solid " + (open ? "var(--ink)" : "var(--line)"), background: "var(--card)", cursor: "pointer" }}>
                <span aria-hidden style={{ display: "block", width: "100%", height: "100%", minHeight: 34, borderRadius: "calc(var(--radius-field) - 4px)", background: swatch, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }} />
              </button>

              <select value={typing ? "__other" : c.id} aria-label={"Colour " + (i + 1)}
                className="ph-select"
                onChange={(e) => {
                  if (e.target.value === "__other") { setCustom(i); return; }
                  setCustom(null);
                  setAt(i, { id: e.target.value, hex: colorHex(e.target.value) ?? "" });
                }}
                style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", backgroundColor: "var(--card)", color: "var(--ink)", fontSize: 14 }}>
                <option value="">Choose a colour</option>
                {FABRIC_COLORS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="__other">Other…</option>
              </select>

              {/* The share, as a percentage the vendor can overrule. Read-only
                  it would be a measurement they can see is wrong and can't
                  fix; the list re-bases around whatever they type. */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                <input value={Math.round(c.share * 100)} inputMode="numeric"
                  aria-label={"Share of colour " + (i + 1) + ", percent"}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                    write(colors.map((x, k) => (k === i ? { ...x, share: n / 100 } : x)));
                  }}
                  style={{ width: 46, padding: "10px 6px", textAlign: "right", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", backgroundColor: "var(--card)", color: "var(--ink)", fontSize: 14 }} />
                <span style={{ fontSize: 12, color: "var(--stone)" }}>%</span>
              </span>

              <button type="button" className="ph-btn" onClick={() => remove(i)}
                aria-label={"Remove colour " + (i + 1)}
                style={{ padding: "0 9px", flexShrink: 0, borderRadius: "var(--radius-field)", border: "1px solid var(--line)", color: "var(--stone)" }}>
                <Icon name="close" />
              </button>
            </div>

            {typing && (
              <input value={isPalette(c.id) ? "" : c.id} maxLength={24} autoFocus
                aria-label="Name this colour yourself" placeholder="e.g. peacock"
                onChange={(e) => setAt(i, { id: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", backgroundColor: "var(--card)", color: "var(--ink)", fontSize: 14 }} />
            )}

            {open && (
              <ColorWheel hex={swatch} image={image}
                onChange={(hex) => applyHex(i, hex)}
                onDone={() => setPicking(null)} />
            )}

            {/* The word is what gets stored and the shade is only shown, so a
                row where the two have come apart is a row that will be filed
                under something the vendor can see is wrong. Raised through
                colorDisagrees rather than on a bare id mismatch: navy against
                blue is the same cloth described two ways and worth nothing to
                say, maroon against orange is the thing worth catching. */}
            {!open && !typing && c.hex && colorDisagrees(c.id, hexToPaletteId(c.hex)) && (
              <span style={{ fontSize: 11, color: "var(--stone)" }}>
                Reads as {colorLabel(hexToPaletteId(c.hex))}, filed as {colorLabel(c.id)}.
              </span>
            )}
          </div>
        );
      })}

      <button type="button" className="ph-btn" onClick={add}
        style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "9px 14px", minHeight: 36 }}>
        + add a colour
      </button>
    </div>
  );
}

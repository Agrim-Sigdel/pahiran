"use client";

import { useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/Icon";

/* ── our own dropdown ──

   A native <select> renders its list by the operating system: a wheel on iOS, a
   full-screen sheet on Android, a plain menu on desktop. Nothing in globals.css
   reaches inside it, and an <option> can hold exactly one string — so every
   distinction we wanted to draw between two cuts had to be crammed into that
   string with punctuation:

     "Kurtha · set · yours — already stitched"

   which is four separate facts, all in the same 14px grey, and the one that
   matters (this one can't be picked, and why) arrives last. Here they can be
   what they are: the name reads as the name, what the cut makes reads as a
   quiet tag beside it, and the reason a row is unavailable sits under it in the
   place a reason belongs.

   Kept honest as a listbox rather than a pile of buttons — trigger with
   aria-haspopup, options with role="option" and aria-selected, arrow keys,
   Enter, Escape, and focus that goes back where it came from. The native
   control gets all of that for free and it is the thing most often dropped by
   a component like this one.

   Now the only picker in the app: every native <select> was replaced by one of
   these, so a dropdown looks and behaves the same in the catalog toolbar, on a
   form, and on the public storefront. That is also why the trigger's own look
   lives in globals.css (`.ph-dd-trigger`) rather than inline here — the rules
   that size the controls in each of those places (`.field`, `.cat-tools`, the
   phone breakpoints) have to be able to reach it, and an inline style beats
   every one of them. */

export interface DropdownOption {
  value: string;
  label: string;
  /** A word or two on what this option is — "set", "yours". */
  meta?: string;
  /** Why this one can't be chosen. Shown under the label; implies disabled. */
  note?: string;
  /** The picture of the thing, when it has one — a cut's reference photo, a
      bolt's swatch. Shown beside the label the way the counter's picker shows
      it, because a shop recognises its own tailoring by looking faster than by
      reading. Optional per row: a cut described in words only has none. */
  thumb?: string | null;
  disabled?: boolean;
}

export default function Dropdown({
  value, options, onChange, placeholder = "Choose…", disabled = false, ariaLabel,
  thumbFallback, className = "",
}: {
  /** "" for none picked. The parent owns it — a menu that fires and resets
      simply holds it at "". */
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown on the trigger when nothing is picked, or when the whole control is
      closed to further picks — the studio uses it to say why. */
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  /** What stands in the picture's place for a row that has none. Once any row
      in the list carries a thumbnail every row gets the slot, or the labels
      step in and out by 34px down the list and nothing lines up. */
  thumbFallback?: React.ReactNode;
  /** Goes on the wrapper, which is the flex item — a toolbar sizes the control
      from out here, the same way it sizes the search box beside it. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /* Which way the list opens. A picker low on the page — the last field of a
     form, a filter above a full grid — would otherwise drop its list off the
     bottom of the viewport, or under the edge of a scrolling dialog panel. */
  const [up, setUp] = useState(false);
  /* Which row the keyboard is on. Separate from `value`: arrowing through the
     list must not commit anything until Enter, or a keyboard user "picks" every
     option they pass over on the way to the one they want. */
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const usable = (o: DropdownOption) => !o.disabled && !o.note;
  const selected = options.find((o) => o.value === value && o.value !== "");
  /* All rows or none. A list where only the photographed cuts are indented
     reads as two lists. */
  const showThumbs = options.some((o) => o.thumb);

  const close = (refocus: boolean) => {
    setOpen(false);
    setActive(-1);
    if (refocus) trigger.current?.focus();
  };

  const pick = (o: DropdownOption) => {
    if (!usable(o)) return;
    onChange(o.value);
    close(true);
  };

  /* Outside a pointer-down, not a click: a click listener fires after the press
     has already moved focus, and on a phone the dropdown would still be open
     under the thumb for the length of a tap. Capture phase so a control behind
     the list still gets its own press. */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  // Focus follows the list so the keys below reach it without the caller
  // having to think about tab order.
  useEffect(() => { if (open) list.current?.focus(); }, [open]);

  /* The row the arrow keys are on has to be a row you can see. The list caps
     at 264px and scrolls, so on a long one — the 25 fabric colours, the ten
     shop categories — arrowing past the sixth row moved a highlight that was
     already off the bottom of the box. `nearest` so it only scrolls when it
     has to, instead of jumping the list on every press. */
  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /** The next pickable row in a direction, skipping the ones that can't be
      chosen — stopping the cursor on "already stitched" is a dead key press. */
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (usable(options[i])) return i;
    }
    return from >= 0 && from < options.length && usable(options[from]) ? from : -1;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active >= 0) pick(options[active]);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(step(e.key === "Home" ? -1 : options.length, e.key === "Home" ? 1 : -1));
      return;
    }
    const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    setActive((a) => step(a < 0 ? (dir === 1 ? -1 : options.length) : a, dir));
  };

  const openList = () => {
    if (disabled) return;
    /* Measured off the trigger at the moment of opening, not from a resize
       listener: the only thing that can move between now and the next open is
       the page, and the next open measures again. 300 rather than the 264 the
       list caps at, so the decision includes the gap and a little slack. */
    const box = trigger.current?.getBoundingClientRect();
    setUp(!!box && box.bottom + 300 > window.innerHeight && box.top > 300);
    setOpen(true);
    // Land on what's already picked, else the first row anyone can actually use.
    const at = options.findIndex((o) => o.value === value && usable(o));
    setActive(at >= 0 ? at : step(-1, 1));
  };

  return (
    <div ref={wrap} className={"ph-dd" + (className ? " " + className : "")}
      style={{ position: "relative" }}>
      {/* Every visual of this trigger is in globals.css under .ph-dd-trigger,
          including the states below — the open border, the greyed placeholder,
          disabled. Inline they could not be overridden by the rules that size
          this control in a toolbar, on a form, or on a phone. */}
      <button ref={trigger} type="button" disabled={disabled} className="ph-dd-trigger"
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        data-empty={selected ? undefined : "true"}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openList();
          }
        }}>
        {/* Only once something is picked. An empty slot in front of "Choose a
            cut…" would be a picture of nothing. */}
        {selected && showThumbs && <Thumb src={selected.thumb} size={26} fallback={thumbFallback} />}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.meta && (
          <span style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--stone)", flexShrink: 0 }}>
            {selected.meta}
          </span>
        )}
        {/* Rotates rather than swapping glyphs, so the chevron is one thing
            that turned instead of two icons that traded places. */}
        <span aria-hidden style={{ flexShrink: 0, display: "inline-flex", color: "var(--stone)", transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }}>
          <Icon name="point-down" />
        </span>
      </button>

      {open && (
        <ul ref={list} role="listbox" tabIndex={-1} id={id} onKeyDown={onKey}
          aria-label={ariaLabel}
          aria-activedescendant={active >= 0 ? id + "-" + active : undefined}
          style={{
            position: "absolute", left: 0, right: 0, zIndex: 40,
            top: up ? undefined : "calc(100% + 4px)",
            bottom: up ? "calc(100% + 4px)" : undefined,
            margin: 0, padding: 4, listStyle: "none",
            maxHeight: 264, overflowY: "auto",
            background: "var(--card)", border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-field)",
            boxShadow: "0 10px 28px rgba(0,0,0,.16)", outline: "none",
          }}>
          {options.length === 0 && (
            <li style={{ padding: "10px 11px", fontSize: 12.5, color: "var(--stone)" }}>Nothing to choose from.</li>
          )}
          {options.map((o, i) => {
            const off = !usable(o);
            const on = i === active;
            return (
              <li key={o.value} id={id + "-" + i} role="option"
                aria-selected={o.value === value} aria-disabled={off}
                /* A row that can't be taken puts focus back rather than
                   swallowing the press: clicking it drops focus to <body>, and
                   the arrow keys would be dead from then on with the list still
                   open in front of you. Done here rather than by preventing the
                   pointerdown, which on touch suppresses the click it needs. */
                onClick={() => (usable(o) ? pick(o) : list.current?.focus())}
                onPointerEnter={() => { if (!off) setActive(i); }}
                style={{
                  display: "flex", alignItems: showThumbs ? "center" : "baseline", gap: 8,
                  padding: "9px 10px", borderRadius: "var(--radius-sm)",
                  cursor: off ? "default" : "pointer",
                  background: on && !off ? "var(--paper-deep)" : "transparent",
                  color: off ? "var(--stone)" : "var(--ink)",
                  opacity: off ? 0.6 : 1,
                }}>
                {showThumbs && <Thumb src={o.thumb} size={34} fallback={thumbFallback} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                  {o.label}
                  {o.note && (
                    <span style={{ display: "block", fontSize: 11, color: "var(--stone)", marginTop: 2 }}>
                      {o.note}
                    </span>
                  )}
                </span>
                {o.meta && (
                  <span style={{ fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--stone)", flexShrink: 0 }}>
                    {o.meta}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── the picture beside a row ──
   `contain`, not `cover`: these are reference photos of a stitched piece, and
   a crop that fills the square is a crop through the shoulder line — the one
   thing the photo is there to show. Decorative on purpose: the label right
   beside it already names the thing, so alt="" keeps a screen reader from
   hearing it twice. */
function Thumb({ src, size, fallback }: {
  src?: string | null;
  size: number;
  fallback?: React.ReactNode;
}) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0, borderRadius: "var(--radius-xs)",
      background: "var(--paper-deep)", overflow: "hidden",
      display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--stone)",
    }}>
      {src
        ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 2, boxSizing: "border-box" }} />
        : fallback}
    </span>
  );
}

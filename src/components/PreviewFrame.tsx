"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ── a live page rendered at a width of its own ──
   React children, portalled into an <iframe> that carries this document's
   stylesheets, sized to `width`, then scaled down to fit whatever column it
   was given.

   The iframe is the whole point, and it replaces a plain `transform: scale()`
   on a 390px-wide div. A transform changes how big something LOOKS; it does
   not change what the CSS inside it is being asked about. Media queries and
   viewport units answer to the viewport, so a "phone preview" built that way
   renders with the *laptop's* CSS:

     .hero-grid           stayed two columns inside a 390px box
     clamp(32px,5.4vw,56px)  computed off 1440px → 56px, where a phone gets 32
     min(32px, 5vw)       computed to 32px, where a phone gets 16
     .shop-grid           used the desktop auto-fill rule, so Roomy previewed
                          one column across and shipped two
     74svh / 46svh        measured the laptop's screen

   An iframe has a viewport of its own, so every one of those resolves at the
   width on the label. Scaling the frame *element* afterwards is safe for
   exactly the same reason the old approach was not: the frame's internal
   layout viewport stays at its CSS width whatever transform is on it.

   The frame auto-heights to its content rather than scrolling internally — a
   preview you have to scroll twice (once for the pane, once inside it) is a
   preview nobody scrolls to the bottom of.

   Contents are `inert`: the storefront's links point at the real shop, and a
   click inside a portal is handled by React out here, so an unguarded preview
   would navigate the dashboard away mid-edit. inert blocks the click and keeps
   the whole subtree out of the tab order and the accessibility tree. */

export default function PreviewFrame({ width, title, children }: {
  /** The viewport width to render at, in CSS pixels. */
  width: number;
  title: string;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [contentH, setContentH] = useState(560);
  const [scale, setScale] = useState(1);

  /* Stylesheets in, mount point out. Next emits <style> tags in dev and
     <link>s in production, and HMR mutates the dev ones in place — so this
     clones both kinds, keeps <style> text in sync, and watches for late
     arrivals rather than snapshotting the head once. */
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;

    /* the font variables (--font-display, --font-body) are next/font classes
       on <html>, so the frame's root has to wear them too or every heading
       falls back mid-preview */
    doc.documentElement.className = document.documentElement.className;
    doc.documentElement.lang = document.documentElement.lang || "en";
    /* scrollHeight still reports full content with overflow hidden, and this
       way a stray scrollbar can't eat 15px out of a 390px viewport and change
       the very layout we are previewing */
    doc.documentElement.style.overflowY = "hidden";
    doc.body.setAttribute("inert", "");

    /* StrictMode runs effects twice in development, and the second pass would
       otherwise clone every stylesheet into a head that already has them.
       Only our own clones live in here, so starting empty is safe. */
    doc.head.replaceChildren();
    const copies = new WeakMap<Node, HTMLElement>();
    const sync = () => {
      document.head
        .querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
        .forEach((node) => {
          const seen = copies.get(node);
          if (seen) {
            if (node.tagName === "STYLE" && seen.textContent !== node.textContent) {
              seen.textContent = node.textContent;
            }
            return;
          }
          const copy = node.cloneNode(true) as HTMLElement;
          doc.head.appendChild(copy);
          copies.set(node, copy);
        });
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });

    setMount(doc.body);
    return () => mo.disconnect();
  }, []);

  /* Content height. The load listener is in the capture phase on purpose:
     <img> load events do not bubble, and a hero photo landing late is the
     single most common reason the frame's height is wrong. */
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !mount) return;

    const measure = () => setContentH(Math.max(1, doc.documentElement.scrollHeight));
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(doc.body);
    const mo = new MutationObserver(measure);
    mo.observe(doc.body, { childList: true, subtree: true, attributes: true });
    doc.addEventListener("load", measure, true);

    return () => {
      ro.disconnect();
      mo.disconnect();
      doc.removeEventListener("load", measure, true);
    };
    /* `mount` only. The MutationObserver already catches every portal update,
       so listing `children` here would tear down and rebuild three observers
       on each keystroke in a text field. */
  }, [mount]);

  /* Fit to the column we were handed. Never scales up — a 390px page blown up
     to 900 is not what any shopper sees either. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setScale(Math.min(1, host.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={hostRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      {/* the outer box takes the *scaled* size, so the stage around it wraps
          the picture rather than the pre-scale layout box */}
      <div style={{
        width: Math.round(width * scale), height: Math.round(contentH * scale),
        overflow: "hidden", borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-soft)", background: "var(--paper)",
      }}>
        <iframe ref={frameRef} title={title} tabIndex={-1}
          style={{
            width, height: contentH, border: 0, display: "block",
            transform: `scale(${scale})`, transformOrigin: "top left",
          }} />
      </div>
      {mount && createPortal(children, mount)}
    </div>
  );
}

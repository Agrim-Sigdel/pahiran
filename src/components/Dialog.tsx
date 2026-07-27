"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/Icon";

/* ── the one dialog ───────────────────────────────────────────────────
   Every overlay in the app used to be a hand-rolled `position: fixed` div:
   23 of them, and between them zero `role="dialog"`, zero `aria-modal`,
   three Escape handlers, no focus management of any kind, and a z-index
   picked by eye at each call site. A screen reader announced them as
   "group"; a keyboard user tabbed straight out of the open dialog into the
   page behind it and never found their way back; the page behind kept
   scrolling under the shopper's thumb.

   Everything that is true of *all* dialogs lives here:

     · role="dialog" + aria-modal, labelled by its own title
     · focus moves in on open and back to the opener on close
     · Tab and Shift+Tab cycle inside the panel
     · Escape closes
     · the page behind is scroll-locked, without the layout jumping
     · a dirty guard, so backdrop-click can't silently bin a typed form

   The last one is why this is a component and not a CSS class. Backdrop-
   click-to-close was universal, including on the cart drawer with a name and
   a phone number typed into it, and on the garment form with a whole product
   filled in. One stray tap discarded the lot with no confirmation.

   Three shapes, one behaviour: a centred modal, a bottom sheet (phones,
   kiosk), and a right-hand drawer (the cart). */

type Variant = "center" | "sheet" | "drawer" | "full";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/* One counter for the whole app rather than a boolean per dialog: a sheet
   opened from inside a modal must not un-lock the page when only IT closes. */
let lockCount = 0;
function lockScroll(): () => void {
  if (lockCount++ === 0) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.dataset.pqOverflow = document.body.style.overflow;
    document.body.dataset.pqPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    // the scrollbar disappearing is a 15px layout jump on desktop — pad it back
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  return () => {
    if (--lockCount === 0) {
      document.body.style.overflow = document.body.dataset.pqOverflow || "";
      document.body.style.paddingRight = document.body.dataset.pqPad || "";
      delete document.body.dataset.pqOverflow;
      delete document.body.dataset.pqPad;
    }
  };
}

export default function Dialog({
  onClose,
  title,
  desc,
  variant = "center",
  dirty = false,
  dirtyMessage = "You have unsaved changes. Discard them?",
  closeOnBackdrop = true,
  hideClose = false,
  hideHeader = false,
  labelledBy,
  ariaLabel,
  width,
  panelStyle,
  panelClassName = "",
  scrimClassName = "",
  scrimStyle,
  children,
}: {
  onClose: () => void;
  title?: string;
  desc?: string;
  variant?: Variant;
  /** true while the dialog holds work that closing would throw away */
  dirty?: boolean;
  dirtyMessage?: string;
  closeOnBackdrop?: boolean;
  hideClose?: boolean;
  /** the panel renders its own header — still pass `title` for the label */
  hideHeader?: boolean;
  labelledBy?: string;
  ariaLabel?: string;
  width?: number | string;
  panelStyle?: React.CSSProperties;
  panelClassName?: string;
  scrimClassName?: string;
  scrimStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  /* Closing has to go through here, not straight to onClose: it's the only
     place that knows whether there is unsaved work to warn about. */
  const attemptClose = useCallback(() => {
    if (dirty) { setConfirmingDiscard(true); return; }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const release = lockScroll();

    /* Focus the first real control, or the panel itself. Deliberately not the
       close button — landing on "×" reads as "the only thing here is a way
       out". requestAnimationFrame so the node exists and the entry animation
       has started. */
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>("[data-autofocus]")
        ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      release();
      /* Back where they came from. Without this, closing a dialog dumps focus
         on <body> and the next Tab starts again from the top of the page. */
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (confirmingDiscard) { setConfirmingDiscard(false); return; }
        attemptClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };
    /* capture, so a dialog opened from inside another dialog handles the key
       before its parent does */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [attemptClose, confirmingDiscard]);

  const shapeClass =
    variant === "sheet" ? "sheet-bottom"
    : variant === "drawer" ? "drawer-right"
    : variant === "full" ? "dlg-full"
    : "";

  return (
    <div
      className={`dlg-scrim ${shapeClass} ${scrimClassName}`}
      style={scrimStyle}
      /* mousedown, not click: a click that STARTS inside the panel (selecting
         text, dragging a slider) and ends on the backdrop would otherwise
         close the dialog and lose the work. */
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) attemptClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title && !ariaLabel ? titleId : undefined)}
        aria-label={ariaLabel}
        aria-describedby={desc ? descId : undefined}
        tabIndex={-1}
        className={`dlg-panel ${panelClassName}`}
        style={{ ...(width ? { maxWidth: width } : null), ...panelStyle }}
      >
        {!hideHeader && (title || !hideClose) && (
          <div className="dlg-head">
            <div style={{ minWidth: 0 }}>
              {title && <h2 id={titleId} className="dlg-title">{title}</h2>}
              {desc && <p id={descId} className="dlg-desc">{desc}</p>}
            </div>
            {!hideClose && (
              <button type="button" className="dlg-x" onClick={attemptClose} aria-label="Close">
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          body={dirtyMessage}
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={() => { setConfirmingDiscard(false); onClose(); }}
        />
      )}
    </div>
  );
}

/* ── confirm ──────────────────────────────────────────────────────────
   The replacement for window.confirm(). The native one blocks the whole tab,
   takes no styling, names the origin in its title bar (on a shop's kiosk
   tablet that reads as a browser warning, not as the shop asking), and gives
   both choices identical weight however destructive one of them is.

   Rendered inline by whoever asks — no portal, no provider. It sits inside
   the parent dialog's scrim, so the stacking order takes care of itself. */
export function ConfirmDialog({
  title, body, confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = false, busy = false, onConfirm, onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog onClose={onCancel} title={title} desc={body} width={420} hideClose
      panelStyle={{ padding: "20px 22px 18px" }}>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
        <button type="button" className="ph-btn" onClick={onCancel} data-autofocus
          style={{ padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)" }}>
          {cancelLabel}
        </button>
        <button type="button" className="ph-btn" onClick={onConfirm} disabled={busy}
          style={{
            padding: "10px 22px", fontSize: 14, fontWeight: 700,
            fontFamily: "var(--font-display), sans-serif",
            background: destructive ? "var(--danger)" : "var(--violet)",
            color: "var(--on-accent)", borderRadius: "var(--radius-btn)",
            opacity: busy ? 0.6 : 1,
          }}>
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/* Imperative confirm for the many call sites that were a bare
   `if (!confirm("…")) return;` inside a handler. Keeps that shape — one
   awaited line — without dragging state into every component.

      if (!(await confirmAsync({ title: "Delete this look?", destructive: true }))) return;

   Backed by the same <ConfirmDialog>, mounted once by <Toaster/> in the root
   layout. */
type ConfirmRequest = {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string;
  destructive?: boolean; resolve: (ok: boolean) => void;
};
let confirmListener: ((r: ConfirmRequest | null) => void) | null = null;

export function confirmAsync(opts: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  if (!confirmListener) return Promise.resolve(false); // no host mounted — never silently proceed
  return new Promise<boolean>((resolve) => confirmListener!({ ...opts, resolve }));
}

/** Mounted once, by <Toaster/>. Not for direct use. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    confirmListener = setReq;
    return () => { confirmListener = null; };
  }, []);
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok); setReq(null); };
  return (
    <ConfirmDialog
      title={req.title} body={req.body}
      confirmLabel={req.confirmLabel} cancelLabel={req.cancelLabel}
      destructive={req.destructive}
      onConfirm={() => done(true)} onCancel={() => done(false)}
    />
  );
}

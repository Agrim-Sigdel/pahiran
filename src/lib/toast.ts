"use client";

/* ── toasts ───────────────────────────────────────────────────────────
   The replacement for alert(). There were 16 of them carrying real business
   messages — plan limits, approval status, a shop-settings save that failed,
   a kiosk that couldn't read the shopper's photo. A native alert blocks the
   tab until dismissed, can't be styled, can't carry an action ("retry",
   "see plans"), and on a shop's kiosk tablet renders as a system dialog
   titled with the site's origin.

   A module-level store rather than a React context: the calls happen inside
   plain async handlers deep in the tree, and threading a provider through
   every one of them is how you end up keeping alert(). */

export type ToastTone = "info" | "ok" | "warn" | "err";

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  /** optional single action — "retry", "see plans", "undo" */
  action?: { label: string; onClick: () => void };
  /** ms until auto-dismiss; 0 keeps it until dismissed by hand */
  duration: number;
  /* Where it sits. Bottom-centre is the default and stays that way — it's
     within thumb reach on the phones this runs on, and it keeps clear of the
     kiosk's header. "top" exists for the long-running ones: a sticky notice
     that a render is in flight would otherwise sit beside the minimised
     progress bar in the same bottom corner, saying the same thing twice. */
  placement: "top" | "bottom";
};

type Listener = (toasts: Toast[]) => void;

let items: Toast[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  const snapshot = items;
  for (const l of listeners) l(snapshot);
}

export function subscribeToasts(l: Listener): () => void {
  listeners.push(l);
  l(items);
  return () => { listeners = listeners.filter((x) => x !== l); };
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  opts: {
    tone?: ToastTone;
    action?: Toast["action"];
    duration?: number;
    placement?: Toast["placement"];
  } = {},
): number {
  const tone = opts.tone ?? "info";
  /* Errors stay put. An error that fades after four seconds is an error the
     shopper watched disappear while reading it, and "out of stock didn't
     save" is not a message to show for four seconds. */
  const duration = opts.duration ?? (tone === "err" ? 0 : 4200);
  const id = nextId++;
  /* Newest first, and never more than three on screen — a failing loop
     shouldn't bury the page under its own retries. */
  items = [
    { id, message, tone, action: opts.action, duration, placement: opts.placement ?? "bottom" },
    ...items,
  ].slice(0, 3);
  emit();
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
  return id;
}

export const toastOk = (m: string, o?: Parameters<typeof toast>[1]) => toast(m, { ...o, tone: "ok" });
export const toastWarn = (m: string, o?: Parameters<typeof toast>[1]) => toast(m, { ...o, tone: "warn" });
export const toastErr = (m: string, o?: Parameters<typeof toast>[1]) => toast(m, { ...o, tone: "err" });

/* Every failure the user should hear about comes through here, so the shape
   of the sentence is decided once: what failed, and that it did not happen.
   `err` is only used for a developer-readable tail when it is a plain Error —
   raw Supabase/postgrest strings are not shown to shoppers. */
export function toastFailure(what: string, err?: unknown): number {
  const detail = err instanceof Error && err.message && err.message.length < 90 ? ` (${err.message})` : "";
  return toastErr(`${what} — please try again.${detail}`);
}

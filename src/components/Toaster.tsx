"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { ConfirmHost } from "@/components/Dialog";
import { subscribeToasts, dismissToast, type Toast } from "@/lib/toast";

/* Mounted once, in the root layout. Hosts both replacements for the native
   dialogs: the toast stack (was alert()) and the confirm host (was confirm()).

   aria-live="polite" on the stack rather than role="alert" on each toast:
   polite lets the screen reader finish the word it is on, and the region
   existing before the first toast does is what makes it announce at all — a
   live region inserted at the same moment as its content is usually missed. */
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <>
      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "info" ? "" : t.tone}`}>
            <div className="toast-body">{t.message}</div>
            {t.action && (
              <button type="button" className="toast-act"
                onClick={() => { t.action!.onClick(); dismissToast(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
      <ConfirmHost />
    </>
  );
}

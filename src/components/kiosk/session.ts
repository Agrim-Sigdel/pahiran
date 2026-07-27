"use client";

import { useCallback, useEffect, useState } from "react";
import { clearDeviceSession } from "@/lib/looks";
import { forgetProfile } from "@/lib/profile";
import { signOut } from "@/lib/account";

/* Shared-device session rules for the kiosk.

   Lives here rather than inside one kiosk screen because both the v1 and v2
   shells have to obey it identically: whatever the try-on flow looks like, a
   shopper who walks away from a shop tablet must leave nothing behind for the
   next person. Two implementations of this would eventually disagree, and the
   half that was forgotten would be the one showing a stranger's face. */

/* how long a shared tablet may sit untouched before it wipes the session,
   and how much warning the shopper gets before that happens */
export const IDLE_MS = 90_000;
export const IDLE_GRACE_MS = 15_000;

/* Erase every trace of the person who just walked away: their body
   measurements, their account session, their face and saved looks on this
   device. Sign out first, then wipe device storage — and only device storage.
   A shopper who signed in on the shop tablet must be logged out before they
   leave, but their cloud looks are theirs and stay put. */
export async function wipeDeviceSession(loggedIn: boolean): Promise<void> {
  forgetProfile();
  if (loggedIn) await signOut().catch(() => {});
  await clearDeviceSession().catch(() => {});
}

/* Idle auto-reset (shared tablets only).

   A shopper who walks away mid-session leaves their photo on screen for
   whoever picks the tablet up next. After IDLE_MS without a touch we warn,
   then wipe. Callers pass active=false on screens with nothing personal on
   them (the attract screen), otherwise the tablet loops a countdown all day.

   Returns [warning, dismiss]. Dismissing is mostly a formality: the tap that
   dismisses is itself a pointerdown, which re-arms both timers. */
export function useIdleReset(active: boolean, onIdle: () => void): [boolean, () => void] {
  const [warning, setWarning] = useState(false);
  const dismiss = useCallback(() => setWarning(false), []);

  useEffect(() => {
    if (!active) { setWarning(false); return; }
    let warn: ReturnType<typeof setTimeout>;
    let wipe: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(warn);
      clearTimeout(wipe);
      setWarning(false);
      warn = setTimeout(() => setWarning(true), IDLE_MS - IDLE_GRACE_MS);
      wipe = setTimeout(() => { setWarning(false); onIdle(); }, IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(warn);
      clearTimeout(wipe);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
    // onIdle must be a stable useCallback — an unstable one re-arms the timers
    // every render, so they would never actually fire.
  }, [active, onIdle]);

  return [warning, dismiss];
}

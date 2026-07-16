/* Shopper measurements for the "find my size" hint — ON THIS DEVICE ONLY.
   Kept in localStorage (small, synchronous) and never sent to a server: only
   the resulting size string ever leaves the device, via the existing lead
   form. Mirrors the remembered-photo consent promise in looks.ts. */

import type { Gender } from "@/lib/sizing";

export interface Profile {
  heightCm: number;
  weightKg?: number;
  gender?: Gender;
  savedAt: number;
}

const KEY = "pahiran:profile";

export function getProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.heightCm === "number" ? (p as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(input: { heightCm: number; weightKg?: number; gender?: Gender }): Profile {
  const p: Profile = { ...input, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  return p;
}

export function forgetProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

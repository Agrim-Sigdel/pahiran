/* Size recommendation — a rough, honest "which size" hint from a shopper's
   height/weight. Deliberately garment-agnostic: our try-on models take body
   shape from the photo, not from numbers, so this never touches the image —
   it only helps the shopper pick a size and pre-fills the lead form.

   The chart is a single, weight-driven band with a small height nudge, then
   mapped onto whatever sizes the garment actually stocks. It's a "rough"
   guess (sharper once weight is given), never a promise — the UI says so. */

import type { Garment } from "@/lib/types";

export type Gender = "f" | "m" | "u";

export interface Measurements {
  heightCm: number;
  weightKg?: number;
  gender?: Gender;
}

export interface SizeRec {
  size: string;              // stocked size label, or "" when free/one-size
  free?: boolean;            // garment is one-size / free size — no letter
  nearest?: boolean;         // ideal size isn't stocked; this is the closest
  confidence: "rough" | "good"; // "good" once weight is provided
}

// Plausible human bounds — the sheet validates against these too.
export const HEIGHT_MIN = 120;
export const HEIGHT_MAX = 220;
export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 200;

const ORDER = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** Fold common label variants onto our canonical ladder ("2XL" → "XXL"). */
function normalize(size: string): string {
  const s = size.trim().toUpperCase();
  if (s === "2XL") return "XXL";
  if (s === "XXXL" || s === "3XL") return "XXL"; // clamp beyond our ladder
  return s;
}

/** Weight → base ladder index, assuming an average frame. */
function baseIndex(weightKg: number): number {
  if (weightKg < 48) return 0; // XS
  if (weightKg < 57) return 1; // S
  if (weightKg < 68) return 2; // M
  if (weightKg < 80) return 3; // L
  if (weightKg < 93) return 4; // XL
  return 5; // XXL
}

/** Recommend a stocked size, or null when there's nothing useful to say. */
export function recommendSize(m: Measurements, garment: Garment): SizeRec | null {
  const h = m.heightCm;
  if (!Number.isFinite(h) || h < HEIGHT_MIN || h > HEIGHT_MAX) return null;

  const hasWeight = Number.isFinite(m.weightKg) && (m.weightKg as number) >= WEIGHT_MIN && (m.weightKg as number) <= WEIGHT_MAX;
  const confidence: SizeRec["confidence"] = hasWeight ? "good" : "rough";

  // Saris drape to fit — a letter size is meaningless, so say "free size".
  if (garment.category === "Sari") return { size: "", free: true, confidence };

  // Which sizes does this garment actually stock, on our ladder?
  const stocked = garment.sizes
    .map((s) => ({ label: s, i: ORDER.indexOf(normalize(s) as (typeof ORDER)[number]) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);

  const hasFree = garment.sizes.length === 0 || garment.sizes.some((s) => /free/i.test(s));
  if (stocked.length === 0) {
    // Nothing on our ladder — only meaningful answer is "free size", else give up.
    return hasFree ? { size: "", free: true, confidence } : null;
  }

  // Weight drives it; estimate from height (mid BMI ≈ 22) when weight is absent.
  const weightKg = hasWeight ? (m.weightKg as number) : 22 * (h / 100) ** 2;
  let idx = baseIndex(weightKg);

  // Height nudge — a long or short frame shifts the label by one. Thresholds
  // lean on gender when we have it (women average shorter), unisex otherwise.
  const g = m.gender;
  const tall = g === "f" ? 176 : g === "m" ? 185 : 182;
  const short = g === "f" ? 150 : g === "m" ? 160 : 156;
  if (h >= tall) idx += 1;
  else if (h <= short) idx -= 1;
  idx = Math.max(0, Math.min(ORDER.length - 1, idx));

  // Closest stocked size to the ideal index.
  let best = stocked[0];
  for (const x of stocked) {
    if (Math.abs(x.i - idx) < Math.abs(best.i - idx)) best = x;
  }
  return { size: best.label, nearest: best.i !== idx, confidence };
}

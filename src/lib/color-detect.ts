/* Read a fabric photo and guess what colour the shop would call it.

   Runs entirely in the browser on a canvas — no model, no key, no rupee. It is
   a suggestion engine and nothing more: the vendor always approves or corrects
   what it says, because a photo is not a colour reading. Shop lighting is
   tungsten, phone white-balance guesses, and a maroon bolt under a warm tube
   photographs orange. That failure is common enough that this file's second
   job is detecting *its own* unreliability and saying so, rather than
   confidently naming the wrong colour.

   Why nearest-palette bucketing instead of k-means: the answer has to be one
   of FABRIC_COLORS anyway, so clustering into arbitrary centroids just adds a
   lossy step before the same snap. Bucketing every pixel straight into the
   palette is deterministic, needs no seeding, and its bucket shares are
   directly the thing we want to report. */

import { FABRIC_COLORS } from "@/lib/constants";

export interface ColorGuess {
  /** A FABRIC_COLORS id. */
  id: string;
  /** The cloth's actual mean colour in this bucket, not the palette's
      approximation of it — what the colour picker gets seeded with. */
  hex: string;
  /** Share of sampled pixels that landed in this bucket, 0..1. */
  share: number;
  /** Mean perceptual distance from the palette entry — how well the word fits. */
  fit: number;
}

export interface ColorReading {
  primary: ColorGuess | null;
  /** Only present when a second colour holds real area and is clearly a
      different word from the first. A navy cloth with navy shadows has one. */
  secondary: ColorGuess | null;
  /** The photo is actively misreporting colour — blown out, or lit warm or
      cool enough to shift the whole frame. The guess is still returned (the
      vendor may recognise it) but the UI must lead with the doubt. */
  unreliable: boolean;
  /** Plain-language caveat, shown to the vendor whenever there is one. Present
      without `unreliable` for the softer cases — a deep colour, or a busy
      print — where the read is probably right but worth a second look. */
  reason: string | null;
}

/* Sampling grid. 120×120 is ~14k pixels: far more than enough for area shares,
   small enough that the whole read is a few milliseconds on a cheap phone. */
const GRID = 120;
/* Centre crop. A bolt photographed on a counter has counter in the corners;
   the middle is nearly always cloth. */
const CROP = 0.72;
/* A second colour needs this much of the frame before it's a colour rather
   than a shadow, a fold, or JPEG noise around a motif. */
const SECOND_MIN_SHARE = 0.1;
/* ...and it has to be this far from the first in Lab, or "navy and blue" gets
   reported as two colours when the cloth is plainly one. */
const SECOND_MIN_DISTANCE = 26;

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/* sRGB → CIELAB (D65). Lab because the whole question here is perceptual:
   "how close is this pixel to what a person would call maroon" is a distance
   RGB gets badly wrong, especially in the darks where half our palette sits. */
function srgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dist = (a: Lab, b: Lab): number =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/** The palette in Lab, computed once — the inner loop runs this against every
    sampled pixel. */
const PALETTE_LAB: { id: string; lab: Lab }[] = FABRIC_COLORS.map((c) => ({
  id: c.id,
  lab: srgbToLab(...hexToRgb(c.hex)),
}));

/** Snap one Lab colour to the nearest palette word. Exported for the UI's
    "you said navy, the photo reads teal" check. */
export function nearestPaletteColor(lab: Lab): { id: string; fit: number } {
  let best = PALETTE_LAB[0];
  let bestD = Infinity;
  for (const p of PALETTE_LAB) {
    const d = dist(lab, p.lab);
    if (d < bestD) { bestD = d; best = p; }
  }
  return { id: best.id, fit: bestD };
}

function labOf(id: string): Lab | null {
  return PALETTE_LAB.find((p) => p.id === id)?.lab ?? null;
}

/**
 * The palette word for an arbitrary colour — what the colour picker snaps to.
 *
 * This is the bridge that lets the vendor drag a continuous picker while the
 * catalog still stores a word. A hex is unfilterable, unsearchable and means
 * nothing to the render prompt; "maroon" is all three.
 */
export function hexToPaletteId(hex: string): string {
  return nearestPaletteColor(srgbToLab(...hexToRgb(hex))).id;
}

/**
 * The colour of a small patch of an already-loaded image, at a point given in
 * 0..1 coordinates. This is the eyedropper: a vendor cannot pick "the navy of
 * this bolt" off a colour wheel from memory, but they can tap it in the photo
 * of the bolt in their hand.
 *
 * Averaged over a patch rather than read from the single pixel under the
 * finger, because one pixel of a woven cloth is a thread, a gap between
 * threads, or a JPEG artefact — none of which is the colour of the cloth.
 */
export function sampleImageHex(
  img: HTMLImageElement,
  nx: number,
  ny: number,
  radius = 0.025
): string | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const side = Math.max(3, Math.round(Math.min(w, h) * radius * 2));
  const sx = Math.max(0, Math.min(w - side, Math.round(nx * w - side / 2)));
  const sy = Math.max(0, Math.min(h - side, Math.round(ny * h - side / 2)));

  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, side, side);
  } catch {
    return null; // tainted canvas — the caller falls back to the picker
  }
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] < 128) continue;
    r += data.data[i]; g += data.data[i + 1]; b += data.data[i + 2];
    n++;
  }
  return n === 0 ? null : rgbToHex(r / n, g / n, b / n);
}

/** Draw the middle of the photo into a small canvas and hand back its pixels. */
function sample(img: HTMLImageElement): ImageData | null {
  const c = document.createElement("canvas");
  c.width = GRID;
  c.height = GRID;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const sw = img.naturalWidth * CROP;
  const sh = img.naturalHeight * CROP;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, GRID, GRID);
  try {
    return ctx.getImageData(0, 0, GRID, GRID);
  } catch {
    // Tainted canvas — only possible if a caller passes a cross-origin URL
    // instead of the data URL the upload path produces.
    return null;
  }
}

/**
 * Guess a fabric's colours from its photo.
 *
 * Never throws and never blocks a save: an unreadable image comes back as an
 * empty reading, and the vendor simply picks the colours themselves.
 */
export function readFabricColors(dataUrl: string): Promise<ColorReading> {
  const empty: ColorReading = { primary: null, secondary: null, unreliable: false, reason: null };
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !dataUrl) return resolve(empty);
    const img = new Image();
    /* Stored bolt photos come from the public Storage bucket, a different
       origin, and reading pixels off a cross-origin image taints the canvas.
       Storage serves CORS headers, so asking for an anonymous fetch keeps
       getImageData legal; where it isn't served, the load fails and the caller
       gets an empty reading rather than a broken form. */
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(empty);
    img.onload = () => {
      const data = sample(img);
      if (!data) return resolve(empty);

      const buckets = new Map<string, { n: number; fitSum: number; r: number; g: number; b: number }>();
      let sumL = 0, sumChroma = 0, n = 0;

      for (let i = 0; i < data.data.length; i += 4) {
        if (data.data[i + 3] < 128) continue; // transparent
        const lab = srgbToLab(data.data[i], data.data[i + 1], data.data[i + 2]);
        const { id, fit } = nearestPaletteColor(lab);
        const bucket = buckets.get(id) ?? { n: 0, fitSum: 0, r: 0, g: 0, b: 0 };
        bucket.n++;
        bucket.fitSum += fit;
        // Kept so the picker can be seeded with the cloth's own colour rather
        // than the palette's stand-in for it.
        bucket.r += data.data[i];
        bucket.g += data.data[i + 1];
        bucket.b += data.data[i + 2];
        buckets.set(id, bucket);
        sumL += lab[0];
        sumChroma += Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
        n++;
      }
      if (n === 0) return resolve(empty);

      const meanL = sumL / n;
      const meanChroma = sumChroma / n;

      const ranked = [...buckets.entries()]
        .map(([id, b]) => ({
          id,
          hex: rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n),
          share: b.n / n,
          fit: b.fitSum / b.n,
        }))
        .sort((x, y) => y.share - x.share);

      const primary = ranked[0] ?? null;
      const primaryLab = primary ? labOf(primary.id) : null;
      const secondary =
        ranked
          .slice(1)
          .find(
            (r) =>
              r.share >= SECOND_MIN_SHARE &&
              primaryLab !== null &&
              (labOf(r.id) ? dist(primaryLab, labOf(r.id)!) : 0) >= SECOND_MIN_DISTANCE
          ) ?? null;

      /* How sure the read is — and every rule here is about what a photo
         genuinely cannot settle, never a diagnosis of how it was taken.

         That distinction is the whole design of this block. A bolt that fills
         the frame gives no neutral reference, so "warm light" and "warm cloth"
         are the same pixels; so are "under-exposed navy" and "black". Rules
         that claimed to tell those apart would fire on perfectly good photos
         of dark and warm cloth — which is most of a Nepali fabric shop — and a
         warning that cries wolf on the common case is worse than no warning,
         because the vendor stops reading the one that matters.

         So what's left is what is actually decidable from the pixels: nothing
         in our palette fits, the frame is so near-white that any colour in it
         is gone, the cloth is so close to neutral that the light decides its
         name, deep colours look alike, or there's no dominant colour at all. */
      let reason: string | null = null;
      let severe = false;
      const primaryL = primary ? labOf(primary.id)?.[0] ?? 100 : 100;

      if (primary && primary.fit > 32) {
        reason = "We couldn't match this cloth closely to any of our colours — please pick the nearest one yourself.";
        severe = true;
      } else if (meanL > 90 && meanChroma < 8) {
        reason = "This photo is almost pure white. If the cloth has any colour in it, the light has taken it out.";
        severe = true;
      } else if (meanChroma < 10 && meanL >= 25) {
        reason = "This cloth reads as near-neutral, and which of grey, beige, ivory or silver we land on depends on the light it was shot in.";
      } else if (primaryL < 35) {
        reason = "Deep colours photograph almost alike — navy, black, charcoal and maroon are easy to mix up on a screen.";
      } else if (primary && primary.share < 0.3) {
        reason = "There's a lot going on in this cloth — no single colour covers much of it.";
      }

      resolve({ primary, secondary, unreliable: severe, reason });
    };
    img.src = dataUrl;
  });
}

/**
 * Does what the vendor picked square with what the photo shows?
 *
 * Used only to raise a question, never to overrule: a vendor who knows the
 * bolt is maroon under bad light is right and the photo is wrong.
 */
export function colorDisagrees(picked: string, guessed: string): boolean {
  if (!picked || !guessed || picked === guessed) return false;
  const a = labOf(picked);
  const b = labOf(guessed);
  if (!a || !b) return false; // one of them is free text — nothing to compare
  return dist(a, b) >= SECOND_MIN_DISTANCE;
}

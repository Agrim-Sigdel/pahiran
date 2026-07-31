/* The measurement half of the pro shot camera.

   The problem it exists for is the one color-detect.ts keeps apologising for:
   a phone's auto white balance guesses, and a maroon bolt under a warm tube
   photographs orange. Auto WB has nothing neutral to hold on to when cloth
   fills the frame — so the pro shot puts a neutral back in the frame. The
   vendor holds a sheet of plain white paper beside the bolt and taps it; that
   patch is, by their own word, white; and whatever the light and the sensor
   did to it, they did to everything else in the frame too.

   The design principle, after the first cut of this file gated too much on
   the light being good: the correction runs at full strength under EVERY
   light. A known white is a two-for-one reference — its tint is the light's
   tint, so dividing it out (von Kries, one gain per channel) fixes the
   colour cast whether the cast is a whisper or a sodium lamp; and its
   brightness is the light's brightness, so scaling it up to paper-white
   fixes the exposure of a dim shop at the same time. Both happen in linear
   light, because gains applied to gamma-encoded pixels under-correct exactly
   when the cast is worst. What the vendor gets under bad light is not a
   refusal — it's the closest colour arithmetic can get, which is usually
   close enough to sell from.

   What stays honest: CRI is a spectral property, and an RGB sensor cannot
   measure it — three numbers per pixel is what remains *after* the spectrum
   is gone. A low-CRI tube doesn't only tint the frame; it never emits the
   wavelengths some dyes reflect, and no gain puts back light that never
   arrived. So the verdict below no longer decides whether to correct — it
   decides what we promise ("exact" under clean light, "close" under a hard
   cast) and whether the manual camera controls are worth unlocking. Sliders
   under a bad light are a tool for making the preview look right while the
   pixels stay wrong; the correction already did the arithmetic part. */

export interface PatchRead {
  r: number;
  g: number;
  b: number;
}

/** Per-channel multipliers in LINEAR light — white balance and exposure
    folded into one number per channel. */
export interface WbGains {
  r: number;
  g: number;
  b: number;
}

export interface LightVerdict {
  /** Clean enough that "what you see is what the cloth is" can be promised —
      and that manual control is worth offering. */
  ok: boolean;
  /** What the light is doing, in the vendor's language — null when ok. */
  reason: string | null;
}

/* ── sRGB ↔ linear ──
   The whole pipeline works in linear light. A ×2 correction on the encoded
   value is roughly a ×4.4 correction on the light itself in the shadows and
   much less in the highlights — which is why the gamma-space version of this
   file drifted under strong casts. */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/* Encoding runs per pixel over a full frame, so it's a lookup too — 4096
   steps is well under the visible banding threshold at 8 bits out. */
const ENC = new Uint8ClampedArray(4096);
for (let i = 0; i < 4096; i++) {
  const l = i / 4095;
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  ENC[i] = Math.round(c * 255);
}
const encode = (l: number): number => ENC[Math.min(4095, Math.max(0, Math.round(l * 4095)))];

/* How hard the white balance may pull one channel, in linear light. 6 covers
   deep tungsten and most sodium; a patch needing more than this is either
   not the paper or a light with a channel essentially missing, and pulling
   harder just amplifies noise into colour. */
const MAX_GAIN = 6;
const MIN_GAIN = 1 / MAX_GAIN;

/* Where the paper lands after correction: linear 0.8 is encoded ~232, which
   is what paper looks like in a properly exposed photo — bright, but with
   the weave of the paper still in it. */
const PAPER_TARGET = 0.8;
/* Exposure rescue has a ceiling. ×8 in linear pulls a genuinely dark shop up
   to readable, but past that the sensor noise being amplified is louder than
   the cloth. */
const MAX_EXPOSURE = 8;
/* Above this, corrected highlights roll off softly instead of slamming into
   255 — a linear clamp would flatten the sheen of a silk into a paper-white
   patch with an edge. */
const KNEE = 0.85;

const srgbPatchToLinear = (p: PatchRead) => ({
  r: LIN[Math.min(255, Math.round(p.r))],
  g: LIN[Math.min(255, Math.round(p.g))],
  b: LIN[Math.min(255, Math.round(p.b))],
});

/**
 * Average colour of a small patch of the live camera frame, at a point in
 * 0..1 coordinates — the same shape as color-detect's sampleImageHex, but off
 * a <video>. Averaged over a patch because one pixel of paper is grain,
 * shadow or sensor noise, none of which is the paper.
 */
export function readVideoPatch(
  video: HTMLVideoElement,
  nx: number,
  ny: number,
  radius = 0.03
): PatchRead | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const side = Math.max(4, Math.round(Math.min(w, h) * radius * 2));
  const sx = Math.max(0, Math.min(w - side, Math.round(nx * w - side / 2)));
  const sy = Math.max(0, Math.min(h - side, Math.round(ny * h - side / 2)));

  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, side, side);
  } catch {
    return null; // a camera stream can't taint a canvas, but belt and braces
  }
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    r += data.data[i];
    g += data.data[i + 1];
    b += data.data[i + 2];
    n++;
  }
  return n === 0 ? null : { r: r / n, g: g / n, b: b / n };
}

/**
 * The full correction the tapped paper implies: white balance (make the
 * patch neutral) and exposure (put it where paper sits in a well-lit photo),
 * as one linear-light multiplier per channel.
 *
 * Works under any light by construction — the worse the light, the more work
 * these numbers do. The clamps are where arithmetic hands over to physics:
 * a channel the lamp barely emits can be multiplied by six and still be
 * mostly noise, which is the verdict's job to say, not this function's job
 * to refuse.
 */
export function correctionGains(patch: PatchRead): WbGains {
  const lin = srgbPatchToLinear(patch);
  const mean = (lin.r + lin.g + lin.b) / 3 || 1e-4;

  /* Exposure off the balanced patch: after the per-channel gains land the
     paper on (mean, mean, mean), one more scalar takes it to PAPER_TARGET.
     A blown reference is a ceiling, not a reading — its true brightness is
     unknowable, so exposure is left alone rather than "corrected" to it. */
  const blown = Math.max(patch.r, patch.g, patch.b) >= 252;
  const exposure = blown ? 1 : Math.min(MAX_EXPOSURE, Math.max(0.25, PAPER_TARGET / mean));

  const clamp = (v: number) => Math.min(MAX_GAIN, Math.max(MIN_GAIN, v));
  return {
    r: clamp(mean / (lin.r || 1e-4)) * exposure,
    g: clamp(mean / (lin.g || 1e-4)) * exposure,
    b: clamp(mean / (lin.b || 1e-4)) * exposure,
  };
}

/**
 * What this light lets us promise.
 *
 * Judged off the white reference only — the one part of the frame whose true
 * colour we know. The correction has already done everything arithmetic can;
 * this is the line between "what you see is the cloth" and "this is close,
 * and closer than the phone's guess, but this lamp is hiding colours no
 * setting recovers". Never a claim to have measured CRI — only that nothing
 * measurable disqualifies this light from being the good kind. Manual
 * controls unlock on ok alone.
 */
export function checkLight(patch: PatchRead): LightVerdict {
  const channels = [patch.r, patch.g, patch.b];
  const lin = srgbPatchToLinear(patch);
  const luma = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;

  /* Clipped white is not a reading, it's a ceiling: whatever cast the light
     has was sawn off at 255, so the balance set from it under-corrects. The
     one case where re-tapping genuinely beats correcting. */
  if (Math.max(...channels) >= 252) {
    return {
      ok: false,
      reason:
        "The paper is blown out — pure 255 white tells us nothing about the light. Angle it away from the source, or step back, and tap it again.",
    };
  }
  /* Linear 0.02 is encoded ~40: a genuinely dark shop. We pull the exposure
     up anyway, but what gets amplified with it is sensor noise, and noise
     lands hardest on the deep colours the catalog most needs told apart. */
  if (luma < 0.02) {
    return {
      ok: false,
      reason:
        "This light is very dim. We've pulled the photo up to a proper exposure, but a dark frame is a noisy frame, and noise blurs navy, maroon and black into each other.",
    };
  }
  /* A hard tint on a known white — corrected in full above, so the frame the
     vendor sees is already neutral. Said anyway, because a source this far
     from white is tube or bare-bulb territory, where the missing wavelengths
     come with the tint and arithmetic can only fix the tint half. */
  if (Math.max(lin.r, lin.g, lin.b) / (Math.min(lin.r, lin.g, lin.b) || 1e-4) > 1.9) {
    return {
      ok: false,
      reason:
        "This light is heavily tinted. We've balanced it off your paper, so the photo is close — but a lamp this far from white usually doesn't emit some colours at all, and those come back only under daylight or a 95+ CRI lamp.",
    };
  }
  return { ok: true, reason: null };
}

/**
 * The feColorMatrix values for a live preview of the correction — twenty
 * numbers, gains on the diagonal. The gains are linear-light multipliers, so
 * the filter that uses this must run with color-interpolation-filters set to
 * linearRGB; applied to the <video> so the vendor watches the cast leave the
 * frame the moment they tap the paper, instead of taking our word that the
 * capture will differ from the preview.
 */
export function wbMatrix(g: WbGains): string {
  return [
    g.r, 0, 0, 0, 0,
    0, g.g, 0, 0, 0,
    0, 0, g.b, 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
}

/**
 * One full-resolution frame off the live stream, with the correction applied
 * to the pixels themselves — decode to linear, multiply, roll the highlights
 * off softly, re-encode. The gains go into the file rather than riding along
 * as an idea because everything downstream — the cropper, the colour reader,
 * the render prompt — reads pixels, and a correction that lives anywhere
 * else is a correction none of them get.
 */
export function captureFrame(
  video: HTMLVideoElement,
  gains: WbGains | null
): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  if (gains) {
    /* Soft shoulder above the knee: corrected values head toward 1 but never
       slam into it, so a silk's sheen stays a gradient instead of a flat
       white hole. Monotonic, and identity below the knee. */
    const soft = (l: number) =>
      l <= KNEE ? l : KNEE + (1 - KNEE) * (1 - Math.exp(-(l - KNEE) / (1 - KNEE)));
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = encode(soft(LIN[px[i]] * gains.r));
      px[i + 1] = encode(soft(LIN[px[i + 1]] * gains.g));
      px[i + 2] = encode(soft(LIN[px[i + 2]] * gains.b));
    }
    ctx.putImageData(data, 0, 0);
  }
  /* 0.92, not the 0.75 the catalog stores at: this is the source the vendor
     is about to crop, and the crop is what gets compressed. Squeezing twice
     puts JPEG blocks into the weave. */
  return c.toDataURL("image/jpeg", 0.92);
}

/* ── the manual controls, as data ──

   Every control the pro shot will ever offer, keyed by the constraint name
   the Image Capture spec gives it. A list rather than hand-built sliders
   because what actually exists varies wildly by device: Android Chrome
   exposes most of these, iOS Safari exposes none, and the UI's job is to
   show exactly what the hardware answered for and nothing else.

   `mode` is the constraint that has to ride along for the value to take —
   colorTemperature means nothing while whiteBalanceMode is "continuous", and
   iso/exposureTime mean nothing under auto exposure.

   The torch is deliberately not on this list. A phone LED is exactly the
   kind of narrow-spectrum source the light check exists to catch, and a
   button that switches it on inside the colour-true camera would be the tool
   defeating itself. */
export interface ProControl {
  key: string;
  label: string;
  /** Shown after the value — "K", "EV", "ms". */
  unit: string;
  /** The mode constraint that must accompany this value, if any. */
  mode?: { key: string; value: string };
  /** Display transform — exposureTime arrives in units of 100µs. */
  format: (v: number) => string;
}

export const PRO_CONTROLS: ProControl[] = [
  {
    key: "colorTemperature",
    label: "white balance",
    unit: "K",
    mode: { key: "whiteBalanceMode", value: "manual" },
    format: (v) => String(Math.round(v)),
  },
  {
    key: "exposureCompensation",
    label: "exposure",
    unit: "EV",
    format: (v) => (v > 0 ? "+" : "") + v.toFixed(1),
  },
  {
    key: "iso",
    label: "ISO",
    unit: "",
    mode: { key: "exposureMode", value: "manual" },
    format: (v) => String(Math.round(v)),
  },
  {
    key: "exposureTime",
    label: "shutter",
    unit: "ms",
    mode: { key: "exposureMode", value: "manual" },
    format: (v) => (v / 10).toFixed(1),
  },
];

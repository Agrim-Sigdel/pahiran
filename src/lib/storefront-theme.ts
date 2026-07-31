/* ── a shop's look, as CSS ──
   Turns a StorefrontConfig's five look axes into one className plus a handful
   of custom properties, for the public page and for the editor's preview.

   The presets (layout, tone, accent, corners, font) are plain classes — the
   values live in globals.css where they can be hand-checked. This file exists
   for the other half: the free colours a vendor picks off the wheel.

   Why a vendor's hex is never used as given
   -----------------------------------------
   The accent is a button fill under --on-accent text, and link text on
   --paper and --card, in BOTH themes. That is four contrast obligations, and
   the comment above .sf-accent-* in globals.css spells out the shape of the
   answer: on paper the accent is a deep tone carrying white; in the dark
   theme it lifts to a bright tone carrying dark text. A hex typed into a
   picker clears all four by luck or not at all — "our brand orange" is a
   3.1:1 button on paper and a muddy invisible link in the dark.

   So the vendor's colour is treated as a *hue and a saturation*, and the
   lightness is moved until it passes. That keeps the shop's colour
   recognisably theirs while making the page readable — and because the editor
   paints its swatch with the derived value, the vendor sees the colour they
   will actually get rather than the one they typed.

   Everything here is pure sRGB maths on strings: no canvas, no DOM, so the
   server render and the client agree and the storefront's first HTML already
   carries the shop's colours. */

import {
  accentClass, toneClass, cornersClass, fontClass, layoutClass,
  cardsClass, densityClass, buttonsClass, headerClass, typeScaleClass,
  tilesClass, announceToneClass,
} from "@/lib/constants";
import type { StorefrontConfig } from "@/lib/types";

/* ---------- colour space ---------- */

type Rgb = { r: number; g: number; b: number }; // 0–255
type Hsl = { h: number; s: number; l: number }; // deg, 0–1, 0–1

/** "#1e2a47" → rgb. Anything else → null; callers treat that as "no custom
    colour" rather than guessing, which is the same stance normalizeStorefront
    takes on the way in. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const hex = ({ r, g, b }: Rgb): string =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === R ? 60 * (((G - B) / d) % 6)
    : max === G ? 60 * ((B - R) / d + 2)
    : 60 * ((R - G) / d + 4);
  return { h: h < 0 ? h + 360 : h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [R, G, B] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (R + m) * 255, g: (G + m) * 255, b: (B + m) * 255 };
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Walk lightness in one direction until `ok` is satisfied, keeping hue and
    saturation. Steps of 1% — fine enough that the result still looks like the
    colour that was asked for, coarse enough to settle in well under 100 tries.
    Returns the endpoint if nothing satisfies it, which for our uses is black
    or white and is the honest answer: no shade of that hue would have read. */
function walkLightness(base: Hsl, dir: -1 | 1, ok: (c: Rgb) => boolean): Rgb {
  let l = base.l;
  for (let i = 0; i <= 100; i++) {
    const c = hslToRgb({ ...base, l: clamp(l, 0, 1) });
    if (ok(c)) return c;
    l += dir * 0.01;
    if (l < 0 || l > 1) break;
  }
  return hslToRgb({ ...base, l: dir < 0 ? 0 : 1 });
}

/* ---------- the accent ---------- */

/* The two ends of the same colour. `light` is what the paper theme paints —
   deep enough to carry white at 7:1, the bar the presets hold. `dark` is the
   lift the dark theme needs, bright enough to be legible link text on --card
   (#2B1B14) with dark text of its own on top.

   Saturation is capped on the way up because lifting a fully saturated hue in
   HSL keeps it fully saturated, and a 100%-saturation mint at 70% lightness
   vibrates on a brown page in a way none of the hand-picked dark presets do. */
export interface AccentPair {
  light: string; onLight: string;
  dark: string; onDark: string;
}

const DARK_CARD: Rgb = { r: 0x2b, g: 0x1b, b: 0x14 };

export function deriveAccent(input: string): AccentPair | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  const base = rgbToHsl(rgb);

  /* Light: darken until white text clears 7:1. A colour already that deep is
     left exactly where the vendor put it. */
  const light = walkLightness(base, -1, (c) => contrast(c, WHITE) >= 7);

  /* Dark: lighten until it clears 7:1 on the dark card — not the 4.5:1 that
     link text alone would need. The extra stop is what makes the fill usable:
     at 4.5:1 the colour is a mid-tone, and NO text of the same hue clears 7:1
     on a mid-tone, so the button below would have had to fall back to black.
     7:1 here puts the lift where the hand-picked dark presets already sit
     (#D9BCE3, #96D2CE, #EDB48C are all around this lightness) and leaves room
     for a dark tint of the hue to sit on top. */
  const darkBase: Hsl = { ...base, s: Math.min(base.s, 0.55) };
  const dark = walkLightness(darkBase, 1, (c) => contrast(c, DARK_CARD) >= 7);

  /* What sits ON the lifted fill: the same hue taken down until it clears 7:1
     against it, so a button in the dark theme is dark-on-bright the way every
     dark preset is — not black, which reads as a hole punched in the colour. */
  const onDark = walkLightness(
    { ...base, s: Math.min(base.s, 0.7), l: 0.2 },
    -1,
    (c) => contrast(c, dark) >= 7
  );

  return { light: hex(light), onLight: "#ffffff", dark: hex(dark), onDark: hex(onDark) };
}

/* ---------- the tone ---------- */

/* A tone is a whole surface ramp, not one colour: wells, page, cards. The
   vendor picks the page and the other rungs are derived from it at the same
   spacing peeq's own palette uses (--paper-deep ~5% below --paper, --card ~4%
   above), so the depth cues the app relies on survive a recolour.

   Both clamps below are load-bearing. Lightness floors at the point where
   --stone (#6E675C, the price and caption colour) still clears 4.5:1, because
   a "tone" dark enough to break that isn't a tone — it's a dark theme, and the
   page already has one of those. And the colour is capped, because this
   surface sits behind photographs of clothes: past a point the paper starts
   casting on every garment on the page.

   That cap is on CHROMA, not on HSL saturation, and the difference is the
   whole thing. Saturation is a ratio against the room a given lightness has:
   at 93% lightness a perfectly ordinary cream reads as S=0.51, so capping S
   at some flat "sensible" number greys out exactly the pale, tinted papers
   this feature exists to offer — peeq's own Sand (#F6EFE3) came back as
   #F0EDE9, a colour with the tint filed off. Chroma is the absolute spread
   between the channels, which is what the eye actually reads as "how coloured
   is this", and it means the same limit is fair to a pale cream and to a
   fluorescent pink. */
export interface TonePair {
  paperLight: string; deepLight: string; cardLight: string;
  paperDark: string; deepDark: string; cardDark: string; lineDark: string;
}

const STONE: Rgb = { r: 0x6e, g: 0x67, b: 0x5c };

/** The widest channel spread a page background may have, 0–1. Peeq's own Sand
    sits at .075 and Blush at .047, so the presets pass unchanged and a
    fluorescent pick lands just past them. */
const PAPER_CHROMA_MAX = 0.1;

export function deriveTone(input: string): TonePair | null {
  const rgb = parseHex(input);
  if (!rgb) return null;
  const base = rgbToHsl(rgb);
  const h = base.h;

  /* The colour at a given lightness, with its chroma capped. The cap has to be
     applied *per lightness* rather than once up front, because the saturation
     that produces a given chroma changes as the lightness moves — which is
     exactly what the walk below does. */
  const atL = (l: number): Rgb => {
    const span = 1 - Math.abs(2 * clamp(l, 0, 1) - 1);
    const sMax = span > 0.001 ? PAPER_CHROMA_MAX / span : 0;
    return hslToRgb({ h, s: Math.min(base.s, sMax), l: clamp(l, 0, 1) });
  };

  /* Light: lighten until secondary text still reads on it. */
  let paperL = Math.max(base.l, 0.9);
  for (let i = 0; i <= 100 && paperL < 1; i++) {
    if (contrast(atL(paperL), STONE) >= 4.5) break;
    paperL += 0.01;
  }
  paperL = Math.min(paperL, 1);
  const light = (l: number) => hex(atL(l));

  /* Dark: the same hue at the rungs the dark theme already uses (--paper
     #1E1310 sits at 9% lightness, --card at 12.4%, --paper-deep at 5.9%), so a
     recoloured dark page keeps peeq's own depth rather than inventing a new
     one. A touch more saturation than the light end, because at 9% lightness a
     hue is barely there at all. */
  const sd = Math.min(Math.max(base.s, 0.12), 0.34);
  const dark = (l: number) => hex(hslToRgb({ h, s: sd, l }));

  return {
    paperLight: light(paperL),
    deepLight: light(paperL - 0.05),
    cardLight: light(Math.min(paperL + 0.04, 1)),
    paperDark: dark(0.09),
    deepDark: dark(0.059),
    cardDark: dark(0.124),
    lineDark: hex(hslToRgb({ h, s: sd * 0.6, l: 0.21 })),
  };
}

/* ---------- config → className + custom properties ---------- */

/* Why the custom colours ship as *pairs* of variables rather than one value:
   an inline style cannot answer a media query, so a single `--violet: #...`
   would paint the light-theme colour into the dark theme too. Instead both
   ends are handed over as data, and the two rules in globals.css — one in each
   theme — choose which end --violet actually takes. Same trick the theme
   itself uses, minus the hand-written values. */
export interface StorefrontLook {
  className: string;
  style: React.CSSProperties;
}

export function storefrontLook(cfg: StorefrontConfig): StorefrontLook {
  /* Layout first, on purpose. A layout sets some of the same tokens the finer
     axes below do (lookbook's 2:3 frames, bazaar's tight padding), and the
     cascade settles that by source order in globals.css rather than by the
     order of this array — but keeping the array in the same order as the
     stylesheet is what makes the stylesheet's ordering legible from here. */
  const classes = [
    layoutClass(cfg.layout),
    toneClass(cfg.tone),
    accentClass(cfg.accent),
    cornersClass(cfg.corners),
    fontClass(cfg.font),
    cardsClass(cfg.cards),
    densityClass(cfg.density),
    buttonsClass(cfg.buttons),
    headerClass(cfg.header),
    typeScaleClass(cfg.typeScale),
    tilesClass(cfg.tiles),
    announceToneClass(cfg.announceTone),
  ];
  const vars: Record<string, string> = {};

  const accent = deriveAccent(cfg.accentHex ?? "");
  if (accent) {
    classes.push("sf-custom-accent");
    vars["--sf-accent-l"] = accent.light;
    vars["--sf-on-accent-l"] = accent.onLight;
    vars["--sf-accent-d"] = accent.dark;
    vars["--sf-on-accent-d"] = accent.onDark;
  }

  const tone = deriveTone(cfg.toneHex ?? "");
  if (tone) {
    classes.push("sf-custom-tone");
    vars["--sf-paper-l"] = tone.paperLight;
    vars["--sf-deep-l"] = tone.deepLight;
    vars["--sf-card-l"] = tone.cardLight;
    vars["--sf-paper-d"] = tone.paperDark;
    vars["--sf-deep-d"] = tone.deepDark;
    vars["--sf-card-d"] = tone.cardDark;
    vars["--sf-line-d"] = tone.lineDark;
  }

  return {
    className: classes.filter(Boolean).join(" "),
    style: vars as React.CSSProperties,
  };
}

/** What a colour will actually look like once it has been made readable — the
    swatch the editor paints, so the vendor is choosing from the real thing.
    Falls back to the input for a preset swatch that needs no derivation. */
export function accentPreviewHex(input: string): string {
  return deriveAccent(input)?.light ?? input;
}

export function tonePreviewHex(input: string): string {
  return deriveTone(input)?.paperLight ?? input;
}

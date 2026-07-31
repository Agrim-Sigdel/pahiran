export const CATEGORIES = [
  "Sari",
  "Lehenga",
  "Kurtha",
  "Daura Suruwal",
  "Suit",
  "Hoodie",
  "Jacket",
  "Dress",
  "Other",
] as const;

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free size"] as const;

/* Made-to-order families: what a bolt of cloth can be stitched into. This is
   the axis that pairs a fabric with the cuts offered for it, and it's a
   different question from CATEGORIES above (which describes a finished piece
   already hanging on a rack). Keep in sync with the family check constraints
   in 20260726000100_fabrics_styles.sql. */
export const FAMILIES = [
  { id: "suit",          label: "Suit" },
  { id: "lehenga",       label: "Lehenga" },
  { id: "kurtha",        label: "Kurtha" },
  { id: "daura-suruwal", label: "Daura Suruwal" },
  { id: "sari-blouse",   label: "Sari blouse" },
  { id: "sherwani",      label: "Sherwani" },
] as const;

export const FABRIC_UNITS = [
  { id: "meter", label: "per meter" },
  { id: "piece", label: "per piece" },
  { id: "set",   label: "per set" },
] as const;

export const familyLabel = (id: string): string =>
  FAMILIES.find((f) => f.id === id)?.label ?? id;

/**
 * What one press of a generate button is about to spend, worded the one way.
 *
 * Every button in this app that makes a picture costs the shop real money, and
 * the number varies by press — two ticked cuts is two stitches, the counter is
 * a stitch *and* a try-on because it renders the garment and then fits it to a
 * person. A vendor who learns the price only from the meter dropping has been
 * charged for a lesson.
 *
 * Two meters and two nouns, deliberately: "credits" as a single currency would
 * be shorter and wrong — running out of try-ons and running out of stitches
 * stop different things, and the Plan tab meters them apart.
 *
 * Returns "" when nothing would be spent, so a call site can render it blind.
 */
export function creditCost(stitches: number, tryons = 0): string {
  const parts = [
    stitches > 0 && stitches + " stitch" + (stitches === 1 ? "" : "es"),
    tryons > 0 && tryons + " try-on" + (tryons === 1 ? "" : "s"),
  ].filter(Boolean);
  return parts.length ? "Uses " + parts.join(" and ") + " from your plan." : "";
}

/* ── the colour a bolt gets called ──────────────────────────────────────────
   The vocabulary a shop names cloth in. A vendor picks the shade with a real
   colour picker; this is what that shade snaps to, because the stored value
   has to survive as a *word*: it goes into the render prompt, it reads on the
   storefront, and a vendor searching "maroon" at the counter has to find it. A
   hex does none of that, so both are kept — the word to be used, the shade to
   be shown.

   These hexes are the snap targets, and also what the photo reader matches
   against (see src/lib/color-detect.ts), so they're spread deliberately across
   the space rather than clustered on the pretty ones. Anything the palette has
   no word for is stored as the vendor's own typed text, which is why every
   lookup here falls back to the id itself. */
export const FABRIC_COLORS = [
  // neutrals
  { id: "black",     label: "Black",      hex: "#171412" },
  { id: "charcoal",  label: "Charcoal",   hex: "#3D3A36" },
  { id: "grey",      label: "Grey",       hex: "#98938C" },
  { id: "silver",    label: "Silver",     hex: "#C6C8CC" },
  { id: "white",     label: "White",      hex: "#FBFAF7" },
  { id: "ivory",     label: "Ivory",      hex: "#F0E7D3" },
  { id: "beige",     label: "Beige",      hex: "#D6C3A2" },
  // warm
  { id: "gold",      label: "Gold",       hex: "#C79A2B" },
  { id: "yellow",    label: "Yellow",     hex: "#E9C93F" },
  { id: "orange",    label: "Orange",     hex: "#D97428" },
  { id: "brown",     label: "Brown",      hex: "#6B4A32" },
  { id: "red",       label: "Red",        hex: "#C22B2B" },
  { id: "maroon",    label: "Maroon",     hex: "#6E1B24" },
  { id: "rani-pink", label: "Rani pink",  hex: "#C43B78" },
  { id: "pink",      label: "Pink",       hex: "#E5A2B4" },
  // cool
  { id: "purple",    label: "Purple",     hex: "#5F3576" },
  { id: "navy",      label: "Navy",       hex: "#1E2A47" },
  { id: "blue",      label: "Blue",       hex: "#2F63AA" },
  { id: "teal",      label: "Teal",       hex: "#1E7A73" },
  { id: "green",     label: "Green",      hex: "#2F6B45" },
  { id: "olive",     label: "Olive",      hex: "#6E7042" },
] as const;

/** A palette id as its word — or the vendor's own text, unchanged. */
export const colorLabel = (id: string): string =>
  FABRIC_COLORS.find((c) => c.id === id)?.label ?? id;

/** The swatch for a palette id; null for a colour the vendor typed themselves. */
export const colorHex = (id: string): string | null =>
  FABRIC_COLORS.find((c) => c.id === id)?.hex ?? null;

/** "Navy · Gold" — how a cloth's colours read on a card and in counter search. */
export const colorText = (colors: { id: string }[]): string =>
  colors.filter((c) => c.id).map((c) => colorLabel(c.id)).join(" · ");

/** "62% maroon, 28% gold, 10% ivory" — how they read inside a render prompt.
    The percentages are the point: two bare words let the model pick which one
    dominates, and it picks differently every run. */
export const colorPhrase = (colors: { id: string; share: number }[]): string =>
  colors
    .filter((c) => c.id)
    .map((c) => Math.round(c.share * 100) + "% " + colorLabel(c.id).toLowerCase())
    .join(", ");

/* Shares are read off a photo and then edited by hand, so they drift — a
   deleted colour leaves the rest summing to 0.7, an added one pushes past 1.
   Every write goes through here so the list is always a set of proportions,
   which is the only form the prompt's percentages can be trusted in. */
export function normalizeShares<T extends { share: number }>(colors: T[]): T[] {
  const total = colors.reduce((n, c) => n + (c.share > 0 ? c.share : 0), 0);
  if (colors.length === 0) return colors;
  // All-zero (or negative) input still has to come out as a valid split.
  if (total <= 0) return colors.map((c) => ({ ...c, share: 1 / colors.length }));
  return colors.map((c) => ({ ...c, share: Math.max(0, c.share) / total }));
}

/* What a shop sells. Descriptive, and it decides the shop's try-on
   entitlement: the try-on model renders worn garments (tops / bottoms /
   one-pieces — see mapCategory above), so clothing is the only category that
   can actually produce a result. Footwear and jewellery are deliberately
   'general' rather than optimistic — offering try-on that can't work is worse
   than not offering it.

   `type` here is the default at signup; an admin can override shops.type
   afterwards without changing what the shop says it sells. */
export const SHOP_CATEGORIES = [
  { id: "clothing",    label: "Clothing & apparel",     type: "apparel" },
  { id: "footwear",    label: "Footwear",               type: "general" },
  { id: "jewellery",   label: "Jewellery & accessories", type: "general" },
  { id: "beauty",      label: "Beauty & cosmetics",     type: "general" },
  { id: "electronics", label: "Electronics",            type: "general" },
  { id: "home",        label: "Home & furniture",       type: "general" },
  { id: "grocery",     label: "Grocery & daily needs",  type: "general" },
  { id: "sports",      label: "Sports & outdoor",       type: "general" },
  { id: "books",       label: "Books & stationery",     type: "general" },
  { id: "other",       label: "Something else",         type: "general" },
] as const;

/** The try-on entitlement a category implies at signup. */
export function typeForCategory(id: string): "apparel" | "general" {
  return SHOP_CATEGORIES.find((c) => c.id === id)?.type ?? "general";
}

// FASHN expects: "tops" | "bottoms" | "one-pieces" | "auto"
export function mapCategory(cat: string): string {
  if (["Sari", "Lehenga", "Dress"].includes(cat)) return "one-pieces";
  if (["Hoodie", "Jacket"].includes(cat)) return "tops";
  return "auto";
}

export const npr = (n: number | string | null | undefined): string =>
  "रू " + Number(n || 0).toLocaleString("en-IN");

/** "रू 2,400 per meter" — a fabric's price is meaningless without its unit. */
export const fabricPrice = (n: number, unit: string): string =>
  npr(n) + " " + (FABRIC_UNITS.find((u) => u.id === unit)?.label ?? "per meter");

/** wa.me deep link, or null if the number is too short to be real. */
export function waLink(number: string, message: string): string | null {
  const digits = (number || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(message);
}

/* Storefront checkout channels. Both default ON; set the env var to "0" to
   disable that channel for a deployment. If leads are on, a checkout also
   drops into the vendor's inbox; if WhatsApp is on (and the shop has a
   number), the order opens as one itemised WhatsApp message. */
export const CHECKOUT = {
  whatsapp: process.env.NEXT_PUBLIC_CHECKOUT_WHATSAPP !== "0",
  leads: process.env.NEXT_PUBLIC_CHECKOUT_LEADS !== "0",
};

/* ── storefront customisation ──
   The words the /s/{slug} page falls back to when the shop hasn't written its
   own. One place, because two readers depend on them agreeing: the renderer
   (a null override means "say the default") and the editor (the default is
   the placeholder, so a vendor sees what silence will say). */
export const STOREFRONT_DEFAULTS = {
  announceText: "try it on before you buy · one photo, account optional · order in a tap",
  heroKicker: "a little look before you buy",
  heroHeadline: "look first,\nthen buy",
  /* Two bodies because the default pitch depends on what the shop offers —
     a general shop must not promise try-on. A vendor's own text replaces
     either. */
  heroBodyTryOn: "Browse the collection, add your pieces to the bag, and order in one message — or take a photo and see anything on you first.",
  heroBody: "Browse the collection, add what you want to the bag, and order in one message.",
  featuredHeading: "featured pieces",
  promoKicker: "the trial room, reinvented",
  promoHeading: "not sure? see it on you first",
  promoBody: "No queue, no changing room. Take one photo, see the piece on you, then add it to your bag with a tap.",
} as const;

/* The sections a shop can reorder, in their default order. `collection` is
   orderable but never hideable — it IS the shop. Nav and footer are not
   sections: they carry the bag, the account and the legal links, which a
   config must not be able to remove. */
export const STOREFRONT_SECTION_IDS = ["announce", "hero", "featured", "promo", "collection"] as const;

export const STOREFRONT_SECTIONS: Record<
  (typeof STOREFRONT_SECTION_IDS)[number],
  { label: string; hideable: boolean }
> = {
  announce: { label: "Announcement bar", hideable: true },
  hero: { label: "Hero", hideable: true },
  featured: { label: "Featured pieces", hideable: true },
  promo: { label: "Try-on promo", hideable: true },
  collection: { label: "The collection", hideable: false },
};

/* Accent presets, not free hex: an accent is used as button fill under
   --on-accent text and as link text on --paper/--card, in both themes — four
   contrast obligations a colour picker would hand straight to the vendor.
   Each id maps to a .sf-accent-{id} class in globals.css that overrides
   --violet (and, in dark, --on-accent) inside the theme's own selectors, the
   way the brand accent itself flips from deep-on-pale to bright-on-dark.
   Swatches in the editor take the class and paint var(--violet), so they show
   the theme-appropriate value for free. */
export const STOREFRONT_ACCENTS = [
  { id: "plum", label: "Plum" },
  { id: "wine", label: "Wine" },
  { id: "rust", label: "Rust" },
  { id: "ocean", label: "Ocean" },
  { id: "teal", label: "Teal" },
  { id: "moss", label: "Moss" },
  { id: "indigo", label: "Indigo" },
  { id: "ink", label: "Ink" },
] as const;

/** The CSS class carrying a shop's accent, or "" for the peeq default. */
export const accentClass = (id: string | null | undefined): string =>
  id && STOREFRONT_ACCENTS.some((a) => a.id === id) ? "sf-accent-" + id : "";

/* ── layouts ──
   Three arrangements of the same five sections. A layout is not a different
   page: the config, the section order, the text overrides and the image slots
   all mean exactly what they meant before — the sections just wear a different
   shell (see the .sf-layout-* rules in globals.css and the `variant` prop the
   sections in storefront.tsx take).

   `drops` is the honest part. A layout that can't show something a vendor has
   configured has to say so in the picker rather than silently ignoring it —
   bazaar has no hero photo frame, so a shop that curated five hero slides is
   owed the sentence "this layout doesn't show them" before it picks it. */
export const STOREFRONT_LAYOUTS = [
  {
    id: "boutique",
    label: "Boutique",
    blurb: "Your words beside a big photo, then featured pieces, then the rack.",
    best: "a curated shop — a dozen pieces that each deserve a look",
    drops: null,
  },
  {
    id: "lookbook",
    label: "Lookbook",
    blurb: "One photo fills the top of the screen; featured pieces swipe sideways.",
    best: "a shop with strong photography or stitched try-on shots",
    drops: null,
  },
  {
    id: "bazaar",
    label: "Bazaar",
    blurb: "Search and your whole rack right at the top, nothing to scroll past.",
    best: "a big rack — fifty pieces and shoppers who come to dig",
    drops: "Your hero pictures aren't shown in this layout.",
  },
] as const;

export type StorefrontLayoutId = (typeof STOREFRONT_LAYOUTS)[number]["id"];

/** The class carrying a shop's layout. Boutique is the default page, so it
    carries no class — an un-migrated config renders today's markup exactly. */
export const layoutClass = (id: string | null | undefined): string =>
  id && id !== "boutique" && STOREFRONT_LAYOUTS.some((l) => l.id === id) ? "sf-layout-" + id : "";

/** Does this layout render the hero image slots at all? The editor asks so it
    can warn beside the hero pictures, not only in the layout picker. */
export const layoutShowsHeroImages = (id: string | null | undefined): boolean => id !== "bazaar";

/* ── tones ──
   Accents recolour the buttons; a tone recolours the *stage* — the paper the
   shop's photos sit on. Presets for the same reason accents are presets: each
   pair below is hand-checked so --ink, --stone and every accent still carry
   their contrast on it, in both themes. A vendor who wants a shade we don't
   list picks one with the colour wheel instead, and storefront-theme.ts
   derives a safe ramp from it. */
export const STOREFRONT_TONES = [
  { id: "warm", label: "Warm", note: "flatters skin in photos", light: "#FAF6F0", dark: "#1E1310" },
  { id: "porcelain", label: "Porcelain", note: "cool gallery light", light: "#F8F7F5", dark: "#171614" },
  { id: "sand", label: "Sand", note: "earthy, for wool and leather", light: "#F6EFE3", dark: "#201709" },
  { id: "blush", label: "Blush", note: "for bridal and festive", light: "#FAF1EE", dark: "#20130F" },
] as const;

/** The class carrying a shop's tone. Warm is peeq's own paper, so it carries
    no class. */
export const toneClass = (id: string | null | undefined): string =>
  id && id !== "warm" && STOREFRONT_TONES.some((t) => t.id === id) ? "sf-tone-" + id : "";

/* ── corners ──
   How round everything on the page is: cards, buttons, inputs, tiles. One
   class re-points the radius tokens, so a shop that wants hard edges gets them
   everywhere at once instead of in the six places someone remembered. */
export const STOREFRONT_CORNERS = [
  { id: "soft", label: "Soft", note: "peeq's own" },
  { id: "round", label: "Round", note: "friendly, fully rounded" },
  { id: "square", label: "Square", note: "sharp, editorial" },
] as const;

export const cornersClass = (id: string | null | undefined): string =>
  id && id !== "soft" && STOREFRONT_CORNERS.some((c) => c.id === id) ? "sf-corners-" + id : "";

/* ── heading faces ──
   Only the DISPLAY face changes. Body text stays Mukta in every choice
   because it carries Devanagari, and a shop name or a piece written in
   Nepali has to render in the paragraph face as well as the heading one.
   The families are loaded by src/lib/storefront-fonts.ts, which only the
   storefront route and the editor import — so no other page in the app pays
   for a face it never sets. */
export const STOREFRONT_FONTS = [
  { id: "peeq", label: "Rounded", note: "peeq's own — warm and friendly" },
  { id: "serif", label: "Serif", note: "classic, for heritage and bridal" },
  { id: "modern", label: "Modern", note: "clean geometric sans" },
] as const;

export const fontClass = (id: string | null | undefined): string =>
  id && id !== "peeq" && STOREFRONT_FONTS.some((f) => f.id === id) ? "sf-font-" + id : "";

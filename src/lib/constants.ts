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

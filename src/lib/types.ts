/* Shared domain types. The storage adapter maps DB rows (snake_case)
   to these app-facing shapes, so components never see raw rows. */

import {
  colorPhrase, colorText, STOREFRONT_SECTION_IDS, STOREFRONT_SECTIONS, STOREFRONT_ACCENTS,
  STOREFRONT_LAYOUTS, STOREFRONT_TONES, STOREFRONT_CORNERS, STOREFRONT_FONTS,
} from "@/lib/constants";

/* Admin approval state. Only 'approved' shops can add catalog items, run
   try-ons, or be read by the public — see 20260721000100_admin_console.sql.
   Local (no-Supabase) mode has no admin, so it treats every shop as approved. */
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";

/* What the shop sells, which decides whether try-on applies at all. 'general'
   shops (electronics, grocery, hardware…) use peeq as a catalog + kiosk + QR
   tags and never see try-on UI. Separate from the credit balance: a general
   shop has no try-on entitlement to spend in the first place. */
export type ShopType = "apparel" | "general";

/* What the shop sells — descriptive, and the source of the default ShopType at
   signup (see SHOP_CATEGORIES in constants.ts). Kept separate from `type` so an
   admin can grant or revoke try-on without rewriting what the shop is. */
export type ShopCategory =
  | "clothing" | "footwear" | "jewellery" | "beauty" | "electronics"
  | "home" | "grocery" | "sports" | "books" | "other";

export interface Shop {
  id: string | null; // null until persisted (localStorage mode has no id)
  slug: string | null; // pahiran.app/k/{slug}; null in localStorage mode
  vendorCode: string | null; // immutable 4-char tag prefix; null in localStorage mode
  name: string;
  area: string;
  whatsapp: string; // digits for wa.me links; "" = no order button
  listed: boolean; // opt-in: show on the landing page directory
  status: ShopStatus; // admin approval gate; 'approved' in local mode
  statusNote: string | null; // admin's reason, shown to the vendor on reject/suspend
  type: ShopType; // 'general' shops get the catalog without try-on
  category: ShopCategory; // what they sell; sets `type` at signup
  lat: number | null; // OSM map pin; null = not placed yet
  lng: number | null;
  storefront: StorefrontConfig; // /s/{slug} overrides; always complete — see normalizeStorefront
}

/* ── storefront customisation ──
   What a vendor can change about their /s/{slug} page: the words each section
   says, which picture fills which slot, the order and visibility of the
   sections, and an accent. Null on any text field means "say the default"
   (STOREFRONT_DEFAULTS), an empty picks/images list means "the automatic
   slice of the catalog" — so the zero config renders today's page exactly. */

export type StorefrontSectionId = (typeof STOREFRONT_SECTION_IDS)[number];

/* An image slot is filled by pointing at a catalog piece (stays live: its
   photo, name, price and product link follow the garment) or by a plain
   image URL — an uploaded banner, or a stitched fit's render picked in the
   editor. The optional label is what the hero's caption bar says for it
   ("Suit · Navy Herringbone"); absent means the slide says nothing. Stored
   as a URL rather than a composition id so the public page never has to
   read the compositions table. */
export type SlotImage =
  | { kind: "garment"; garmentId: string }
  | { kind: "upload"; url: string; label?: string };

export interface StorefrontConfig {
  /* ── look ──
     Four independent axes, each null-means-default so an untouched shop is
     byte-identical to the page peeq has always rendered:

       layout   which shell the sections wear      (STOREFRONT_LAYOUTS)
       tone     the paper the photos sit on        (STOREFRONT_TONES)
       accent   buttons, links, active states      (STOREFRONT_ACCENTS)
       corners  how round every card and button is (STOREFRONT_CORNERS)
       font     the heading face                   (STOREFRONT_FONTS)

     accentHex/toneHex are the escape hatch from the preset lists: a free
     colour, run through storefront-theme.ts, which derives a light value, a
     dark value and the text colour that sits on them rather than trusting a
     vendor's hex to clear four contrast obligations by luck. A hex WINS over
     the preset id on the same axis — the preset stays stored so "back to a
     preset" doesn't have to guess which one they were on. */
  layout: string | null; // STOREFRONT_LAYOUTS id; null = boutique
  tone: string | null;   // STOREFRONT_TONES id; null = warm (peeq's paper)
  toneHex: string | null;   // free paper colour; overrides `tone`
  accent: string | null; // STOREFRONT_ACCENTS id; null = the peeq accent
  accentHex: string | null; // free accent colour; overrides `accent`
  corners: string | null; // STOREFRONT_CORNERS id; null = soft
  font: string | null;    // STOREFRONT_FONTS id; null = peeq's rounded face
  announceText: string | null;
  hero: {
    kicker: string | null;
    headline: string | null; // "\n" is a line break, rendered pre-line
    body: string | null;
    images: SlotImage[]; // [] = auto: first five in-stock pieces
  };
  featured: {
    heading: string | null;
    picks: string[]; // garment ids, max 4; [] = auto slice
  };
  promo: {
    kicker: string | null;
    heading: string | null;
    body: string | null;
    image: SlotImage | null; // null = auto: a piece the bands above haven't shown
  };
  sections: { id: StorefrontSectionId; hidden: boolean }[]; // order + visibility
}

export function defaultStorefront(): StorefrontConfig {
  return {
    layout: null,
    tone: null,
    toneHex: null,
    accent: null,
    accentHex: null,
    corners: null,
    font: null,
    announceText: null,
    hero: { kicker: null, headline: null, body: null, images: [] },
    featured: { heading: null, picks: [] },
    promo: { kicker: null, heading: null, body: null, image: null },
    sections: STOREFRONT_SECTION_IDS.map((id) => ({ id, hidden: false })),
  };
}

/* jsonb → a complete config, whatever is actually stored. Same defensive
   stance as the colors guard in rowToFabric: this column is hand-editable and
   written by every client version there has ever been, so nothing in it is
   trusted — unknown section ids drop, a section a newer app added appears at
   its default position, `collection` can never arrive hidden, and a slot that
   isn't one of the two known shapes becomes no slot. */
const cfgText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/* A stored colour. Six-digit hex only — the shorthand and the named colours a
   hand-edited row might carry would each need their own parser downstream, and
   the picker only ever writes this form. Anything else is "no custom colour",
   which falls back to the preset on that axis rather than to nothing. */
const cfgHex = (v: unknown): string | null =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : null;

/** One of a preset list, or null. Same guard as the accent has always had:
    an id this build doesn't know (an older column, a hand edit, a preset we
    since removed) means the default, never a broken class name on the page. */
const cfgPreset = (v: unknown, ids: readonly { id: string }[]): string | null => {
  const s = cfgText(v);
  return s && ids.some((p) => p.id === s) ? s : null;
};

const cfgSlot = (v: unknown): SlotImage | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "garment" && typeof o.garmentId === "string") return { kind: "garment", garmentId: o.garmentId };
  if (o.kind === "upload" && typeof o.url === "string") {
    return typeof o.label === "string" && o.label.trim() !== ""
      ? { kind: "upload", url: o.url, label: o.label }
      : { kind: "upload", url: o.url };
  }
  return null;
};

export function normalizeStorefront(raw: unknown): StorefrontConfig {
  const cfg = defaultStorefront();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return cfg;
  const o = raw as Record<string, unknown>;

  cfg.layout = cfgPreset(o.layout, STOREFRONT_LAYOUTS);
  cfg.tone = cfgPreset(o.tone, STOREFRONT_TONES);
  cfg.toneHex = cfgHex(o.toneHex);
  cfg.accent = cfgPreset(o.accent, STOREFRONT_ACCENTS);
  cfg.accentHex = cfgHex(o.accentHex);
  cfg.corners = cfgPreset(o.corners, STOREFRONT_CORNERS);
  cfg.font = cfgPreset(o.font, STOREFRONT_FONTS);
  cfg.announceText = cfgText(o.announceText);

  const hero = (o.hero ?? {}) as Record<string, unknown>;
  cfg.hero.kicker = cfgText(hero.kicker);
  cfg.hero.headline = cfgText(hero.headline);
  cfg.hero.body = cfgText(hero.body);
  cfg.hero.images = (Array.isArray(hero.images) ? hero.images : [])
    .map(cfgSlot).filter((s): s is SlotImage => !!s).slice(0, 8);

  const featured = (o.featured ?? {}) as Record<string, unknown>;
  cfg.featured.heading = cfgText(featured.heading);
  cfg.featured.picks = (Array.isArray(featured.picks) ? featured.picks : [])
    .filter((p): p is string => typeof p === "string").slice(0, 4);

  const promo = (o.promo ?? {}) as Record<string, unknown>;
  cfg.promo.kicker = cfgText(promo.kicker);
  cfg.promo.heading = cfgText(promo.heading);
  cfg.promo.body = cfgText(promo.body);
  cfg.promo.image = cfgSlot(promo.image);

  /* Stored order wins for the sections it names; anything it doesn't name is
     slotted in after the last present section that canonically precedes it,
     so a section this build knows and the stored config doesn't lands where
     the default order would put it rather than at the end. */
  const canon = STOREFRONT_SECTION_IDS as readonly string[];
  const seen = new Map<StorefrontSectionId, boolean>();
  for (const s of Array.isArray(o.sections) ? o.sections : []) {
    if (!s || typeof s !== "object") continue;
    const id = (s as Record<string, unknown>).id;
    if (typeof id !== "string" || !canon.includes(id) || seen.has(id as StorefrontSectionId)) continue;
    const sid = id as StorefrontSectionId;
    seen.set(sid, STOREFRONT_SECTIONS[sid].hideable && !!(s as Record<string, unknown>).hidden);
  }
  const order = [...seen.keys()];
  for (const sid of STOREFRONT_SECTION_IDS) {
    if (seen.has(sid)) continue;
    let at = 0;
    for (let i = 0; i < order.length; i++) {
      if (canon.indexOf(order[i]) < canon.indexOf(sid)) at = i + 1;
    }
    order.splice(at, 0, sid);
    seen.set(sid, false);
  }
  cfg.sections = order.map((id) => ({ id, hidden: seen.get(id)! }));

  return cfg;
}

export interface Garment {
  id: string;
  itemCode: string | null; // "{vendorCode}-0001", printed on tags; null in localStorage mode
  name: string;
  category: string;
  price: number; // NPR
  image: string; // data URL (local mode) or public storage URL (Supabase mode)
  sizes: string[]; // e.g. ["S", "M", "L"]; empty = free size / unspecified
  inStock: boolean;
  tryonEnabled: boolean;
  stitchedToOrder: boolean;
}

/* Made-to-order. A fabric is a listing the shopper browses; a style is a cut it
   can be stitched into. The rendered fabric x style variant arrives with the
   compose pipeline — see 20260726000100_fabrics_styles.sql. */

/* The taxonomy that pairs a fabric with the cuts it can become. Kept separate
   from the garment CATEGORIES list: categories describe a finished piece on a
   rack, families describe what a bolt of cloth can be turned into. */
export type StyleFamily =
  | "suit" | "lehenga" | "kurtha" | "daura-suruwal" | "sari-blouse" | "sherwani";

/** How a fabric is priced — per running meter, per single piece, or per set. */
export type FabricUnit = "meter" | "piece" | "set";

/* One colour in a cloth, and how much of it there is.

   The share is what stops the render guessing. Two words alone ("maroon,
   gold") leave an image model free to decide which one dominates, and it
   decides differently on different runs — a gold border becomes a gold
   garment. "78% maroon, 22% gold" cannot be read two ways.

   Read off the photo to begin with, then corrected by the vendor, who can see
   the bolt and the light it was shot under. */
export interface FabricColor {
  /** A FABRIC_COLORS id, or the vendor's own word when the palette had none. */
  id: string;
  /** The exact shade, for the swatch. "" falls back to the palette's. */
  hex: string;
  /** Fraction of the cloth, 0..1. The list always sums to 1. */
  share: number;
}

export interface Fabric {
  id: string;
  itemCode: string | null; // printed on the bolt tag; null in localStorage mode
  name: string;
  family: StyleFamily;
  image: string; // data URL (local mode) or public storage URL (Supabase mode)
  price: number; // NPR, per `unit`
  unit: FabricUnit;
  composition: string; // "wool 120s", "banarasi silk"; "" = unspecified
  /* Every colour in this cloth, most of it first, with how much of it each
     one covers. A list rather than two slots because cloth doesn't come in
     twos: a plain suiting has one colour, a banarasi has five, and forcing
     either into "primary + secondary" throws away the difference between a
     gold border and a gold-dominant weave. */
  colors: FabricColor[];
  /* The shop set these themselves, against a render that got them wrong —
     rather than them being what the upload photo measured. It is the only
     thing that lets the render prompt put the words above the sample photo,
     and it can only become true after a preview exists: before that, a
     "correction" would be a measurement taken off the very photo it claims to
     overrule. See the colour paragraph in compose.ts. */
  colorsCorrected: boolean;
  /** Derived: "Navy · Gold". What cards and counter search read. */
  color: string;
  /* What the shop knows about this cloth that a photo doesn't show — the
     pattern, where a border falls, how heavily it drapes. Feeds the compose
     prompt. */
  note: string;
  /* What previous renders of this cloth got wrong — "it came out too orange,
     it's maroon". True of the cloth, so it applies to every cut stitched from
     it, and changing it marks every preview of this bolt as needing a
     re-stitch. Distinct from `note`, which describes the cloth rather than
     correcting a render of it. */
  correction: string;
  inStock: boolean;
}

/* A fabric stitched into one cut: a product nobody photographed. Authored by
   the vendor, so every combination a shopper sees is one the tailor agreed to
   make. `published` is the vendor's review gate. */
export type CompositionStatus = "pending" | "ready" | "failed";

export interface Composition {
  id: string;
  fabricId: string | null;
  styleId: string | null;
  image: string | null; // null until status is "ready"
  status: CompositionStatus;
  errorNote: string | null;
  price: number; // NPR
  published: boolean;
  /* A note true of this pairing only — the cloth's own note and the cut's
     wording cover everything else. renderedNote is what the current image was
     actually made from, so the two differing is exactly what "stale" means. */
  note: string;
  renderedNote: string;
  /* Which revision of the cut produced this image. Null on renders made before
     revisions existed — unknowable, not stale. */
  renderedStyleRevision: number | null;
  /** The vendor has looked at this image and said it is the cloth. */
  approved: boolean;
  /* What the vendor said was wrong with the last attempt at this pairing, and
     what the current image was actually made under. Same two-values-compared
     trick as the note: a correction the render hasn't seen yet is what makes
     stitching again worth paying for. */
  correction: string;
  renderedCorrection: string;
  /** The cloth-wide correction this image was made under — see Fabric.correction. */
  renderedFabricCorrection: string;
  /* The cloth's colours as they stood when this image was made. Null on
     renders that predate the mirror — unknowable, not stale, same as
     renderedStyleRevision. Correcting a bolt's colours moves fabrics.colors
     and leaves this behind, which is what marks every preview of that bolt as
     needing a re-stitch. */
  renderedColors: FabricColor[] | null;
  /* The fabric's own photo — `Fabric.image`, the picture the vendor uploaded —
     as it stood when this render was made. Empty on renders that predate the
     mirror.

     Replacing that photo is the strongest change a vendor can make to a cloth,
     because the render was drawn from those pixels and nothing else describes
     the weave, so every preview of the fabric is marked for re-stitching. */
  renderedFabricImage: string;
}

/** Why a render no longer matches what the shop is offering, or null if it
    still does. Everything a vendor can change after the fact without ordering
    a new render lives here; anything else means a new render outright. */
export function staleReason(
  c: Composition,
  style?: Style | null,
  fabric?: Fabric | null
): "note" | "cut" | "fix" | "cloth" | "colour" | "photo" | null {
  if (c.status !== "ready") return null;
  /* Ahead of everything else: a new photo of the bolt is a new cloth as far as
     this picture is concerned, and whatever else has changed is beside the
     point next to that. Empty means the render predates the mirror. */
  if (fabric && c.renderedFabricImage && c.renderedFabricImage !== fabric.image) {
    return "photo";
  }
  /* Corrections rank above notes: a vendor who has just said "this came out
     the wrong colour" should be told that's what needs re-stitching, not shown
     a stale-note badge that says nothing about what they reported. */
  if (c.correction.trim() !== c.renderedCorrection.trim()) return "fix";
  /* Compared as the phrase the prompt reads, not as the stored objects: a
     nudged hex is display-only and never reaches a render, so it must not cost
     one. Null renderedColors predates the mirror and is left alone. */
  if (
    fabric &&
    c.renderedColors !== null &&
    colorPhrase(fabric.colors) !== colorPhrase(c.renderedColors)
  ) {
    return "colour";
  }
  if (fabric && fabric.correction.trim() !== c.renderedFabricCorrection.trim()) return "cloth";
  if (c.note.trim() !== c.renderedNote.trim()) return "note";
  if (style && c.renderedStyleRevision !== null && style.revision !== c.renderedStyleRevision) {
    return "cut";
  }
  return null;
}

/* What the kiosk can put on a shopper. To the try-on step a photographed
   garment and a rendered fabric x cut are the same thing — an image of a piece
   of clothing — so the rail, the stage and the cart all take this one shape
   and stay unaware of the difference.

   Only the writes care. garment_id and composition_id are separate foreign
   keys (see 20260726000400), and exactly one of them is set: compositionId is
   present precisely when this wearable came from a composition. */
export interface Wearable extends Garment {
  compositionId?: string | null;
}

/* Which pieces the cut actually makes. Read twice: the compose prompt turns it
   into an instruction, and try-on turns it into a placement category. A note
   cannot do the second job, which is why this is an enum and not wording. */
export type StyleCoverage = "top" | "bottom" | "set";

export interface Style {
  id: string;
  shopId: string | null; // null = platform-global, available to every shop
  family: StyleFamily;
  name: string;
  hint: string; // the cut in words — what the compose step reads
  coverage: StyleCoverage;
  refImage: string | null; // optional reference photo; sharpens the hint
  active: boolean;
  sort: number;
  /* Bumped by the database whenever a compose-relevant field changes, so a
     render can tell whether the cut has moved on since it was made. */
  revision: number;
}

/* Coverage → what try-on is being asked to place. Families can't answer this:
   a suit and a blazer share one, and mean different halves of a body. */
export const coverageCategory = (c: StyleCoverage): string =>
  c === "top" ? "tops" : c === "bottom" ? "bottoms" : "one-pieces";

export const COVERAGES: { id: StyleCoverage; label: string; note: string }[] = [
  { id: "top", label: "Top only", note: "kurtha, blouse, blazer" },
  { id: "bottom", label: "Bottom only", note: "suruwal, churidar, skirt" },
  { id: "set", label: "Full set", note: "both pieces, same cloth" },
];

/* ── the counter ──
   A cloth, a cut and a customer that are not catalog rows yet. The made-to-
   order flow above is authoring: list the bolt, define the cut, render ahead
   of demand. This is the tailor's other case — someone is holding a bolt off
   the shelf and wants to see it on themselves now — so every field here is an
   image or a sentence the vendor just produced, and none of it is persisted
   unless they choose to keep the run. */
export interface CounterInput {
  family: StyleFamily;
  coverage: StyleCoverage;
  fabricImage: string; // data URL — the bolt, photographed just now
  fabricNote: string;
  styleImage: string | null; // data URL, or null when the words carry the cut
  stylePrompt: string;
  personImage: string; // data URL — the customer standing there
}

export interface CounterRun {
  garmentUrl: string; // the stitched piece, with nobody in it
  tryonUrl: string; // the customer wearing it — private, signed, ~1h
}

export interface TryOnEvent {
  garmentId: string | null;
  cached: boolean;
  sessionId: string | null;
  createdAt: string; // ISO timestamp
}

export interface Lead {
  id: string;
  garmentId: string | null;
  name: string;
  phone: string;
  size: string;
  /** Lines of one bag checkout share this; null for a lone kiosk lead. */
  orderRef: string | null;
  qty: number;
  /** Price per piece when it was ordered. Null on rows written before order
      snapshots existed — read it through leadUnitPrice(), never raw. */
  unitPrice: number | null;
  /** "enquiry" also opened WhatsApp, so the shopper may message first. */
  kind: "order" | "enquiry";
  handled: boolean;
  createdAt: string;
}

/** One line of a shopper's own order history, denormalised at read time so it
    survives the shop editing or deleting the piece afterwards. */
export interface OrderHistoryLine {
  id: string;
  orderRef: string | null;
  shopName: string;
  shopSlug: string | null;
  garmentName: string;
  image: string | null;
  size: string;
  qty: number;
  unitPrice: number;
  kind: "order" | "enquiry";
  handled: boolean;
  createdAt: string;
}

export interface ErrorLog {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

export interface PlanInfo {
  id: string;
  name: string;
  priceNpr: number;
  tryonLimit: number;
  studioLimit: number;
  maxGarments: number | null;
  listedAllowed: boolean;
  sort: number;
}

export interface Subscription {
  planId: string;
  status: string; // active | past_due | canceled
  periodEnd: string; // ISO
  tryonsUsed: number;
  studioUsed: number;
  plan: PlanInfo;
}

/* Raw Supabase rows */
export interface ShopRow {
  id: string;
  owner: string;
  slug: string;
  vendor_code: string | null;
  name: string;
  area: string | null;
  whatsapp: string | null;
  listed: boolean | null;
  status: string | null; // absent until 20260721000100_admin_console.sql is applied
  status_note: string | null;
  type: string | null; // absent until 20260721000300_shop_type.sql is applied
  category: string | null; // absent until 20260721000500_shop_category.sql is applied
  lat: number | null;
  lng: number | null;
  storefront?: unknown; // jsonb; absent until 20260730000100_storefront_config.sql is applied
}

export interface GarmentRow {
  id: string;
  shop_id: string;
  item_code: string | null;
  name: string;
  category: string;
  price_npr: number;
  image_url: string;
  sizes: string[] | null;
  in_stock: boolean;
  tryon_enabled: boolean;
  stitched_to_order: boolean;
}

export interface FabricRow {
  id: string;
  shop_id: string;
  item_code: string | null;
  name: string;
  family: string;
  image_url: string;
  price_npr: number;
  unit: string | null;
  composition: string | null;
  color: string | null;
  colors: FabricColor[] | null;
  colors_corrected: boolean | null;
  note: string | null;
  correction: string | null;
  in_stock: boolean;
}

export interface CompositionRow {
  id: string;
  fabric_id: string | null;
  style_id: string | null;
  image_url: string | null;
  status: string;
  error_note: string | null;
  price_npr: number;
  published: boolean;
  note: string | null;
  rendered_note: string | null;
  rendered_style_revision: number | null;
  approved: boolean | null;
  correction: string | null;
  rendered_correction: string | null;
  rendered_fabric_correction: string | null;
  rendered_colors: FabricColor[] | null;
  rendered_fabric_image: string | null;
}

export function rowToComposition(r: CompositionRow): Composition {
  return {
    id: r.id,
    fabricId: r.fabric_id ?? null,
    styleId: r.style_id ?? null,
    image: r.image_url ?? null,
    status: (r.status as CompositionStatus) ?? "pending",
    errorNote: r.error_note ?? null,
    price: r.price_npr ?? 0,
    published: r.published ?? false,
    note: r.note ?? "",
    renderedNote: r.rendered_note ?? "",
    renderedStyleRevision: r.rendered_style_revision ?? null,
    approved: r.approved ?? false,
    correction: r.correction ?? "",
    renderedCorrection: r.rendered_correction ?? "",
    renderedFabricCorrection: r.rendered_fabric_correction ?? "",
    /* Null and [] are different answers here: null is a render made before the
       mirror existed and never stale for colour, [] is a render made from a
       cloth that genuinely had no colours set. */
    renderedColors: Array.isArray(r.rendered_colors) ? r.rendered_colors : null,
    renderedFabricImage: r.rendered_fabric_image ?? "",
  };
}

export interface StyleRow {
  id: string;
  shop_id: string | null;
  family: string;
  name: string;
  prompt_hint: string;
  coverage: string | null;
  ref_image_url: string | null;
  active: boolean | null;
  sort: number | null;
  revision: number | null;
}

export function rowToFabric(r: FabricRow): Fabric {
  /* Rows written before 20260729000100 carry the old free-text colour and no
     list. That one word becomes the whole cloth — which is what it always
     claimed to be — and the vendor refines it the next time they open the
     bolt. Guarded as an array: `colors` is jsonb, and a row hand-edited to an
     object would otherwise crash every card that maps over it. */
  const stored = Array.isArray(r.colors) ? r.colors : [];
  const colors: FabricColor[] =
    stored.length > 0
      ? stored
      : r.color
      ? [{ id: r.color, hex: "", share: 1 }]
      : [];
  return {
    id: r.id,
    itemCode: r.item_code ?? null,
    name: r.name,
    family: r.family as StyleFamily,
    image: r.image_url,
    price: r.price_npr,
    unit: (r.unit as FabricUnit) ?? "meter",
    composition: r.composition ?? "",
    colors,
    colorsCorrected: r.colors_corrected ?? false,
    color: colorText(colors) || (r.color ?? ""),
    note: r.note ?? "",
    correction: r.correction ?? "",
    inStock: r.in_stock,
  };
}

export function rowToStyle(r: StyleRow): Style {
  return {
    id: r.id,
    shopId: r.shop_id ?? null,
    family: r.family as StyleFamily,
    name: r.name,
    hint: r.prompt_hint,
    coverage: (r.coverage as StyleCoverage) ?? "set",
    refImage: r.ref_image_url ?? null,
    active: r.active ?? true,
    sort: r.sort ?? 0,
    revision: r.revision ?? 1,
  };
}

export function rowToGarment(r: GarmentRow): Garment {
  return {
    id: r.id,
    itemCode: r.item_code ?? null,
    name: r.name,
    category: r.category,
    price: r.price_npr,
    image: r.image_url,
    sizes: r.sizes ?? [],
    inStock: r.in_stock,
    tryonEnabled: r.tryon_enabled,
    stitchedToOrder: r.stitched_to_order,
  };
}

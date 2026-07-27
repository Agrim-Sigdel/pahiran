/* The platform-curated cuts every shop starts with.

   KEEP IN SYNC with the seed at the bottom of
   supabase/migrations/20260726000100_fabrics_styles.sql. Postgres is the source
   of truth in Supabase mode; this list serves local (no-Supabase) mode, where
   there is no database to seed. Both are keyed by the same slugs, so a style
   picked in local mode means the same cut it does in cloud mode.

   `hint` is the load-bearing field: it's what the compose step will read to
   render the cut. `refImage` is deliberately absent here — a cut is a
   description first, and a reference photo only sharpens it. That's what lets
   this library ship without a single image asset. */

import type { Style, StyleCoverage, StyleFamily } from "@/lib/types";

/* `revision` is excluded too: it exists to tell a render that its cut has been
   edited underneath it, and these never are. */
type SeedStyle = Omit<Style, "id" | "shopId" | "refImage" | "active" | "revision"> & {
  slug: string;
};

/* coverage defaults to 'set' because most of this library is complete outfits;
   the tops are named explicitly below. Mirrors the backfill in
   20260726000500 — if you change one, change the other. */
const seed = (
  slug: string,
  family: StyleFamily,
  name: string,
  hint: string,
  sort: number,
  coverage: StyleCoverage = "set"
): SeedStyle => ({ slug, family, name, hint, sort, coverage });

const SEEDS: SeedStyle[] = [
  seed("suit-2pc-notch", "suit", "Two-piece · notch lapel",
    "Two-piece single-breasted suit. Two-button notch lapel, straight flap pockets, single rear vent, flat-front tapered trousers.", 10),
  seed("suit-2pc-peak", "suit", "Two-piece · peak lapel",
    "Two-piece single-breasted suit. One-button peak lapel, jetted pockets, double side vents, flat-front tapered trousers.", 20),
  seed("suit-3pc-notch", "suit", "Three-piece · notch lapel",
    "Three-piece suit. Two-button notch-lapel jacket, five-button V-neck waistcoat, flat-front trousers, all in the same cloth.", 30),
  seed("suit-3pc-peak", "suit", "Three-piece · peak lapel",
    "Three-piece suit. Peak-lapel jacket, matching lapelled waistcoat, tapered trousers, all in the same cloth.", 40),
  seed("suit-double-breasted", "suit", "Double-breasted",
    "Double-breasted six-button peak-lapel jacket, structured shoulder, double side vents, wide straight-leg trousers.", 50),
  seed("suit-tuxedo-shawl", "suit", "Tuxedo · shawl collar",
    "Single-button tuxedo with a satin shawl collar, jetted pockets, and trousers with a satin side stripe.", 60),
  seed("suit-blazer", "suit", "Blazer only",
    "Single blazer, no trousers. Two-button notch lapel, patch pockets, unstructured soft shoulder.", 70, "top"),

  seed("lehenga-a-line", "lehenga", "A-line",
    "A-line lehenga. Gently flared floor-length skirt, fitted cropped blouse, matching dupatta draped over one shoulder.", 10),
  seed("lehenga-mermaid", "lehenga", "Mermaid",
    "Mermaid lehenga. Body-hugging from waist to knee, then flaring into a fishtail hem. Fitted blouse, long dupatta.", 20),
  seed("lehenga-circular", "lehenga", "Circular flare",
    "Circular flared lehenga with a full 360-degree ghera and heavy pleating at the waist. Cropped blouse, wide dupatta.", 30),
  seed("lehenga-panelled", "lehenga", "Panelled (kali)",
    "Panelled kali lehenga. Vertical gored panels with contrast border seams, moderate flare, fitted blouse.", 40),
  seed("lehenga-sharara", "lehenga", "Sharara",
    "Sharara set. Wide trousers flaring sharply from the knee, short flared kurti to mid-thigh, dupatta.", 50),
  seed("lehenga-straight", "lehenga", "Straight cut",
    "Straight-cut lehenga. Narrow column skirt with minimal flare and a side slit, fitted blouse.", 60),

  seed("kurtha-straight", "kurtha", "Straight cut",
    "Straight-cut kurtha to the knee, side slits, mandarin collar, full sleeves, worn over matching churidar.", 10),
  seed("kurtha-anarkali", "kurtha", "Anarkali",
    "Anarkali. Fitted bodice flaring from a high empire waist into a floor-length frock, full sleeves, churidar beneath.", 20),
  seed("kurtha-a-line", "kurtha", "A-line",
    "A-line kurtha widening gently from shoulder to a calf-length hem, round neck, three-quarter sleeves.", 30, "top"),
  seed("kurtha-short-kurti", "kurtha", "Short kurti",
    "Short kurti to the hip, boat neck, cap sleeves, straight cut.", 40, "top"),

  seed("daura-classic", "daura-suruwal", "Classic",
    "Classic daura suruwal. Closed-neck cross-over daura with eight ties and a mandarin collar, churidar suruwal gathered at the ankle.", 10),
  seed("daura-modern", "daura-suruwal", "Modern slim",
    "Modern slim daura suruwal. Trimmed close-fitting daura, tapered suruwal, worn with a fitted waistcoat in the same cloth.", 20),

  seed("blouse-round-short", "sari-blouse", "Round neck · short sleeve",
    "Sari blouse. Round neck, short sleeves, standard closed back, cropped at the ribcage.", 10, "top"),
  seed("blouse-deep-back", "sari-blouse", "Deep back",
    "Sari blouse with a deep U-shaped open back and tie fastening, elbow-length sleeves.", 20, "top"),
  seed("blouse-sleeveless", "sari-blouse", "Sleeveless",
    "Sleeveless cropped sari blouse, square neckline, fitted.", 30, "top"),
  seed("blouse-elbow", "sari-blouse", "Elbow sleeve",
    "Sari blouse with elbow-length sleeves and a sweetheart neckline.", 40, "top"),

  seed("sherwani-classic", "sherwani", "Classic",
    "Classic sherwani. Knee-length closed-neck coat with a mandarin collar and full button placket, over churidar.", 10),
  seed("sherwani-indo-western", "sherwani", "Indo-western",
    "Indo-western sherwani. Asymmetric hem, open front worn over a contrasting inner kurta, tapered trousers.", 20),
];

/* Local mode has no database to hand out uuids, so the slug is the id. It's
   already unique and stable, which is all an id has to be here. */
export const GLOBAL_STYLES: Style[] = SEEDS.map((s) => ({
  id: s.slug,
  shopId: null,
  family: s.family,
  name: s.name,
  hint: s.hint,
  coverage: s.coverage,
  refImage: null,
  active: true,
  sort: s.sort,
  /* Local mode has no database to bump this, and the library is fixed — these
     cuts never change under a render's feet. */
  revision: 1,
}));

/** Global cuts for one family, in display order. */
export function globalStylesFor(family: StyleFamily): Style[] {
  return GLOBAL_STYLES.filter((s) => s.family === family).sort((a, b) => a.sort - b.sort);
}

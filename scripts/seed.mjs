/* Seed a demo store with a varied catalog (saris, suits, daura suruwal, …).
   Images come from the repo's images/ folder — drop files there named after
   each item's `image` slug (any of .jpg/.jpeg/.png/.webp), then run:

     npm run seed

   Requires Supabase mode (.env.local with NEXT_PUBLIC_SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY). Re-running wipes and re-seeds the same shop,
   so it's safe to run repeatedly. Optional env overrides:
     SEED_EMAIL      owner account (created if missing, default demo@easyfitcheck.app)
     SEED_PASSWORD   password for that account   (default easyfit-demo)
     SEED_SHOP_SLUG  public /k/{slug} + /s/{slug} (default demo-store)
*/

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES_DIR = path.join(ROOT, "images");
const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/* ---------- catalog ---------- */
// `image` is the base filename expected in images/ (e.g. sari-1 → images/sari-1.jpg)
// sizes: [] = free size
const GARMENTS = [
  // Saris
  { name: "Banarasi Silk Sari", category: "Sari", price: 8500, image: "sari-1" },
  { name: "Chiffon Party Sari", category: "Sari", price: 4200, image: "sari-2" },
  { name: "Cotton Everyday Sari", category: "Sari", price: 2500, image: "sari-3" },

  // Suits
  { name: "Classic Black Two-Piece Suit", category: "Suit", price: 12500, sizes: ["S", "M", "L", "XL"], image: "suit-1" },
  { name: "Navy Slim-Fit Suit", category: "Suit", price: 14000, sizes: ["M", "L", "XL"], image: "suit-2" },
  { name: "Grey Three-Piece Wedding Suit", category: "Suit", price: 18500, sizes: ["S", "M", "L", "XL", "XXL"], image: "suit-3", stitchedToOrder: true },

  // Daura Suruwal
  { name: "Classic Daura Suruwal", category: "Daura Suruwal", price: 6500, sizes: ["S", "M", "L", "XL"], image: "daura-suruwal-1" },
  { name: "Wedding Daura Suruwal with Coat", category: "Daura Suruwal", price: 11000, sizes: ["M", "L", "XL"], image: "daura-suruwal-2", stitchedToOrder: true },

  // Lehengas
  { name: "Bridal Red Lehenga", category: "Lehenga", price: 25000, image: "lehenga-1" },
  { name: "Party Lehenga", category: "Lehenga", price: 9500, image: "lehenga-2" },

  // Kurthas
  { name: "Embroidered Kurtha Suruwal", category: "Kurtha", price: 3800, sizes: ["S", "M", "L", "XL"], image: "kurtha-1" },
  { name: "Cotton Kurtha Set", category: "Kurtha", price: 2200, sizes: ["S", "M", "L"], image: "kurtha-2" },

  // Dresses
  { name: "Floral Summer Dress", category: "Dress", price: 1800, sizes: ["XS", "S", "M", "L"], image: "dress-1" },
  { name: "Evening Gown", category: "Dress", price: 5500, sizes: ["S", "M", "L"], image: "dress-2" },

  // Jackets & hoodies
  { name: "Denim Jacket", category: "Jacket", price: 2800, sizes: ["S", "M", "L", "XL"], image: "jacket-1" },
  { name: "Winter Puffer Jacket", category: "Jacket", price: 4500, sizes: ["M", "L", "XL", "XXL"], image: "jacket-2" },
  { name: "Fleece Hoodie", category: "Hoodie", price: 1600, sizes: ["S", "M", "L", "XL", "XXL"], image: "hoodie-1" },

  // Other
  { name: "Gunyu Cholo Set", category: "Other", price: 7500, image: "gunyu-cholo-1" },
  { name: "Pashmina Shawl", category: "Other", price: 3200, image: "shawl-1", tryonEnabled: false },
];

/* ---------- env (.env.local then .env, without adding a dotenv dep) ---------- */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Seeding needs Supabase mode: set NEXT_PUBLIC_SUPABASE_URL and " +
      "SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example)."
  );
  process.exit(1);
}

const SEED_EMAIL = process.env.SEED_EMAIL || "demo@easyfitcheck.app";
const SEED_PASSWORD = process.env.SEED_PASSWORD || "easyfit-demo";
const SEED_SHOP_SLUG = process.env.SEED_SHOP_SLUG || "demo-store";

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

/* ---------- images ---------- */
function findImage(base) {
  for (const ext of EXTENSIONS) {
    const p = path.join(IMAGES_DIR, `${base}.${ext}`);
    if (existsSync(p)) return { path: p, ext };
  }
  return null;
}

const missing = GARMENTS.filter((g) => !findImage(g.image));
if (missing.length) {
  console.error(`Missing ${missing.length} image(s) in images/ — add these files, then re-run:\n`);
  for (const g of missing) console.error(`  images/${g.image}.jpg   (${g.name})`);
  console.error("\n(.jpeg/.png/.webp also work — the seeder matches by base name.)");
  process.exit(1);
}

/* ---------- owner account ---------- */
async function getOrCreateUser() {
  const { data, error } = await sb.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (!error) {
    console.log(`Created owner account ${SEED_EMAIL} (password: ${SEED_PASSWORD})`);
    return data.user;
  }
  // already registered → look it up
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email === SEED_EMAIL);
  if (!user) throw new Error(`Could not create or find user ${SEED_EMAIL}: ${error.message}`);
  console.log(`Using existing owner account ${SEED_EMAIL}`);
  return user;
}

/* ---------- shop ---------- */
async function getOrCreateShop(ownerId) {
  const { data: existing } = await sb.from("shops").select("*").eq("slug", SEED_SHOP_SLUG).maybeSingle();
  if (existing) {
    console.log(`Using existing shop "${existing.name}" (/${SEED_SHOP_SLUG})`);
    return existing;
  }
  const { data, error } = await sb
    .from("shops")
    .insert({
      owner: ownerId,
      slug: SEED_SHOP_SLUG,
      name: "EasyFitCheck Demo Store",
      area: "Kathmandu",
      whatsapp: null,
      listed: true,
    })
    .select()
    .single();
  if (error) throw error;
  console.log(`Created shop "${data.name}" (/${SEED_SHOP_SLUG})`);
  return data;
}

/* ---------- wipe previous seed (garments + their storage files) ---------- */
async function wipeShop(shopId) {
  const { data: old } = await sb.from("garments").select("id").eq("shop_id", shopId);
  if (old?.length) {
    await sb.from("garments").delete().eq("shop_id", shopId);
    console.log(`Removed ${old.length} existing garment(s)`);
  }
  const { data: files } = await sb.storage.from("garments").list(`${shopId}/seed`);
  if (files?.length) {
    await sb.storage.from("garments").remove(files.map((f) => `${shopId}/seed/${f.name}`));
  }
}

/* ---------- seed ---------- */
async function seed() {
  const user = await getOrCreateUser();
  const shop = await getOrCreateShop(user.id);
  await wipeShop(shop.id);

  for (const g of GARMENTS) {
    const img = findImage(g.image);
    const storagePath = `${shop.id}/seed/${g.image}.${img.ext}`;
    const { error: upErr } = await sb.storage
      .from("garments")
      .upload(storagePath, readFileSync(img.path), {
        contentType: CONTENT_TYPES[img.ext],
        upsert: true,
      });
    if (upErr) throw new Error(`Upload failed for ${g.image}: ${upErr.message}`);
    const { data: pub } = sb.storage.from("garments").getPublicUrl(storagePath);

    const { error } = await sb.from("garments").insert({
      shop_id: shop.id,
      name: g.name,
      category: g.category,
      price_npr: g.price,
      image_url: pub.publicUrl,
      sizes: g.sizes ?? [],
      in_stock: g.inStock ?? true,
      tryon_enabled: g.tryonEnabled ?? true,
      stitched_to_order: g.stitchedToOrder ?? false,
    });
    if (error) throw new Error(`Insert failed for ${g.name}: ${error.message}`);
    console.log(`  ✓ ${g.name} (${g.category}, रू ${g.price.toLocaleString("en-IN")})`);
  }

  console.log(`\nSeeded ${GARMENTS.length} garments.`);
  console.log(`Storefront: /s/${SEED_SHOP_SLUG}`);
  console.log(`Kiosk:      /k/${SEED_SHOP_SLUG}`);
  console.log(`Dashboard:  sign in as ${SEED_EMAIL}`);
}

seed().catch((e) => {
  console.error("Seed failed:", e.message || e);
  process.exit(1);
});

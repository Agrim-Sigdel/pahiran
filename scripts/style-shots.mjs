/* Give the platform's default cuts a reference photograph.

   A cut in the peeq library is a description — that's what lets the library
   ship without a single image asset. This script turns each of those
   descriptions into a picture of the shape, in plain grey cloth, and attaches
   it to the cut as its ref_image_url. From then on compose gets both: the
   shop's words for the cut, and one example of it to take the silhouette from.

     npm run style-shots                      # every global cut with no photo yet
     npm run style-shots -- --dry-run         # print the prompts, spend nothing
     npm run style-shots -- --family=suit     # one family
     npm run style-shots -- suit-2pc-notch lehenga-a-line   # named cuts
     npm run style-shots -- --force suit-blazer             # redo one that has a photo
     npm run style-shots -- --quality=high --concurrency=1

   Requires Supabase mode plus an image key: NEXT_PUBLIC_SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY in .env.local.

   Service role on purpose. A global cut belongs to nobody's shop, so its photo
   lands in the styles bucket outside any shop-id folder — which the vendor
   write policy rejects by design (see 20260726000100). Platform-owned asset,
   platform-owned key.

   THIS SPENDS MONEY: one image per cut, medium quality by default. Cuts that
   already have a photo are skipped unless --force, so re-running is cheap. */

import { createClient } from "@supabase/supabase-js";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

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

/* ---------- import the app's own compose module ----------

   The prompt is not re-implemented here. It is the same buildPrompt every
   vendor render goes through, and a reference photograph made from a
   near-identical second copy of it would drift from the renders that later
   copy their shape out of it — which is exactly the bug the shared prompt
   exists to prevent.

   Node runs the TypeScript directly (type stripping, 22.18+); the hook below
   is only there to resolve the '@/…' alias the app uses, which is a tsconfig
   path and means nothing to Node. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC, specifier.slice(2));
      for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base]) {
        if (existsSync(c)) return nextResolve(pathToFileURL(c).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

let composeStyleShot;
let styleShotPrompt;
try {
  ({ composeStyleShot, styleShotPrompt } = await import(
    pathToFileURL(path.join(SRC, "lib/compose.ts")).href
  ));
} catch (e) {
  console.error(
    "Could not load src/lib/compose.ts — this script needs Node 22.18+ (running " +
      process.version +
      "), which reads TypeScript directly.\n" +
      String(e?.message || e)
  );
  process.exit(1);
}

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].slice(3).trim());
  process.exit(0);
}
const flag = (name) => argv.includes("--" + name);
const value = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY_RUN = flag("dry-run");
const FORCE = flag("force");
/* Off by default, and that is a deliberate call about other people's money.
   styles_bump_revision (20260726000600) fires on any ref_image_url change, and
   a bumped revision marks every existing render of that cut stale in every
   vendor's studio — a platform-wide prompt to pay for re-renders. But the cut's
   words have not changed: a photograph only sharpens a description it agrees
   with, so a render made from the words alone is still a picture of this cut.
   The bump is restored to the old value unless it is asked for. */
const BUMP_REVISION = flag("bump-revision");
const QUALITY = value("quality", "medium");
const CONCURRENCY = Math.max(1, Math.min(8, Number(value("concurrency", "3")) || 3));
const FAMILY = value("family", "");
const SLUGS = argv.filter((a) => !a.startsWith("-"));

if (!["low", "medium", "high"].includes(QUALITY)) {
  console.error(`--quality must be low, medium or high (got "${QUALITY}")`);
  process.exit(1);
}

/* ---------- credentials ---------- */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "This needs Supabase mode: set NEXT_PUBLIC_SUPABASE_URL and " +
      "SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example)."
  );
  process.exit(1);
}
if (!DRY_RUN && !(process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY)) {
  console.error("Rendering needs OPENAI_API_KEY in .env.local. (--dry-run works without it.)");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

/* ---------- pick the cuts ---------- */
async function pickCuts() {
  /* select * rather than a column list: coverage and revision arrive in later
     migrations, and naming a column a project hasn't migrated to yet fails the
     whole query. Both are read defensively below. */
  let q = sb.from("styles").select("*").is("shop_id", null).eq("active", true);
  if (FAMILY) q = q.eq("family", FAMILY);
  if (SLUGS.length) q = q.in("slug", SLUGS);
  const { data, error } = await q;
  if (error) throw new Error("Could not read the cut library: " + error.message);

  const rows = (data || []).sort(
    (a, b) => a.family.localeCompare(b.family) || (a.sort ?? 0) - (b.sort ?? 0)
  );

  if (SLUGS.length) {
    const found = new Set(rows.map((r) => r.slug));
    for (const s of SLUGS.filter((s) => !found.has(s))) {
      console.warn(`  ! no active global cut with slug "${s}" — skipped`);
    }
  }

  const usable = rows.filter((r) => (r.prompt_hint || "").trim());
  for (const r of rows.filter((r) => !(r.prompt_hint || "").trim())) {
    console.warn(`  ! ${r.slug} has no description to render from — skipped`);
  }
  return FORCE ? usable : usable.filter((r) => !r.ref_image_url);
}

/* ---------- one cut ---------- */
async function shoot(cut) {
  const req = {
    hint: cut.prompt_hint,
    family: cut.family,
    coverage: cut.coverage || "set",
    quality: QUALITY,
  };

  if (DRY_RUN) {
    console.log(`\n──── ${cut.slug} (${cut.family} · ${cut.name}) ────\n`);
    console.log(styleShotPrompt(req));
    return { slug: cut.slug, status: "dry-run" };
  }

  const dataUrl = await composeStyleShot(req);
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");

  /* A fresh path per render, never an overwrite: 'styles' is a public bucket,
     so its URLs are CDN-cached, and a re-shot cut that reused its path would
     keep serving the picture it just replaced. 'library/' rather than a
     shop-id folder is what marks this as platform-owned. */
  const objectPath = `library/${cut.slug}-${crypto.randomUUID()}.png`;
  const { error: upErr } = await sb.storage
    .from("styles")
    .upload(objectPath, bytes, { contentType: "image/png" });
  if (upErr) throw new Error("upload failed: " + upErr.message);
  const imageUrl = sb.storage.from("styles").getPublicUrl(objectPath).data.publicUrl;

  const { error: saveErr } = await sb
    .from("styles")
    .update({ ref_image_url: imageUrl })
    .eq("id", cut.id);
  if (saveErr) {
    // Don't leave the object behind for a row that never pointed at it.
    await sb.storage.from("styles").remove([objectPath]).then(() => {}, () => {});
    throw new Error("could not attach the photo: " + saveErr.message);
  }

  /* Put the revision back where it was. Only reachable when the column exists —
     a project without it has no staleness check to protect. */
  if (!BUMP_REVISION && typeof cut.revision === "number") {
    await sb.from("styles").update({ revision: cut.revision }).eq("id", cut.id);
  }

  /* Only now that the row points at the new photo, and only ours: a global cut
     should have no vendor-uploaded reference, but deleting a file this script
     did not write is not a mistake worth risking. */
  const previous = cut.ref_image_url;
  if (previous && previous !== imageUrl) {
    const oldPath = decodeURIComponent(previous.split("/styles/")[1] || "");
    if (oldPath.startsWith("library/")) {
      await sb.storage.from("styles").remove([oldPath]).then(() => {}, () => {});
    }
  }

  return { slug: cut.slug, status: "attached", imageUrl };
}

/* ---------- run ---------- */
/* A small pool rather than one at a time: a medium render is tens of seconds
   and the library is two dozen cuts. Capped low anyway — this is an image
   endpoint with rate limits, and a burst that gets throttled costs the same as
   one that doesn't. */
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    })
  );
  return results;
}

const cuts = await pickCuts();
if (cuts.length === 0) {
  console.log(
    FORCE
      ? "No cuts matched."
      : "Every matching cut already has a photo. Use --force to re-shoot them."
  );
  process.exit(0);
}

console.log(
  DRY_RUN
    ? `Would render ${cuts.length} cut(s) at ${QUALITY} quality:`
    : `Rendering ${cuts.length} cut(s) at ${QUALITY} quality, ${CONCURRENCY} at a time. ` +
        `This spends ${cuts.length} image generation(s).`
);
if (!DRY_RUN) for (const c of cuts) console.log(`  · ${c.family} · ${c.name} (${c.slug})`);

let failed = 0;
const done = await pool(cuts, DRY_RUN ? 1 : CONCURRENCY, async (cut) => {
  try {
    const r = await shoot(cut);
    if (r.status === "attached") console.log(`  ✓ ${cut.slug} → ${r.imageUrl}`);
    return r;
  } catch (e) {
    failed++;
    console.error(`  ✗ ${cut.slug}: ${String(e?.message || e)}`);
    return { slug: cut.slug, status: "failed" };
  }
});

if (!DRY_RUN) {
  const ok = done.filter((r) => r.status === "attached").length;
  console.log(`\nAttached ${ok} photo(s)${failed ? `, ${failed} failed` : ""}.`);
  if (ok && !BUMP_REVISION) {
    console.log(
      "Cut revisions left untouched, so no vendor's existing renders are marked stale.\n" +
        "Pass --bump-revision if you want them prompted to re-render."
    );
  }
  /* Local (no-Supabase) mode reads GLOBAL_STYLES in src/lib/style-library.ts,
     which carries no images by design. Nothing to sync — said out loud because
     the two lists are otherwise kept in step by hand. */
}
process.exit(failed ? 1 : 0);

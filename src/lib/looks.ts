/* "My Looks" — shopper-side memory of saved try-ons and the remembered photo.

   Two backends behind one API, chosen per call:
   - CLOUD (Supabase) when a shopper is signed in — looks + photo live in
     PRIVATE buckets keyed by the user id, synced across their devices, served
     via short-lived signed URLs, fully deletable by the owner.
   - DEVICE (IndexedDB) otherwise — never leaves this browser, 7-day photo
     expiry. This is the anonymous fast-path and the offline fallback.

   The kiosk imports these names and doesn't care which backend answers. */

import { currentUserId } from "@/lib/account";
import { supabase } from "@/lib/supabase";
import { blobToDataURL, dataURLToBlob } from "@/lib/images";

export interface SavedLook {
  id: string;
  garmentId: string;
  garmentName: string;
  price: number;
  shopName: string;
  shopId?: string | null;
  image: Blob | string; // Blob (device) or signed URL (cloud / expiring result)
  favorite: boolean;
  createdAt: string;
}

const LOOKS_BUCKET = "looks";
const PHOTO_BUCKET = "shopper-photos";
const SIGNED_TTL = 60 * 60; // 1h — looks are viewed in a single session

/* ============================ DEVICE (IndexedDB) ========================== */

const DB_NAME = "pahiran-looks";
const PHOTO_KEY = "my-photo";
const PHOTO_TTL_MS = 7 * 24 * 3600 * 1000;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("looks")) db.createObjectStore("looks", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const available = () => typeof window !== "undefined" && "indexedDB" in window;

async function deviceRememberPhoto(dataUrl: string): Promise<void> {
  if (!available()) return;
  try { await tx("kv", "readwrite", (s) => s.put({ dataUrl, savedAt: Date.now() }, PHOTO_KEY)); } catch {}
}

async function deviceGetRememberedPhoto(): Promise<string | null> {
  if (!available()) return null;
  try {
    const rec = await tx<any>("kv", "readonly", (s) => s.get(PHOTO_KEY));
    if (!rec) return null;
    if (Date.now() - rec.savedAt > PHOTO_TTL_MS) { await deviceForgetPhoto(); return null; }
    return rec.dataUrl as string;
  } catch { return null; }
}

async function deviceForgetPhoto(): Promise<void> {
  if (!available()) return;
  try { await tx("kv", "readwrite", (s) => s.delete(PHOTO_KEY)); } catch {}
}

async function deviceSaveLook(input: SaveLookInput): Promise<SavedLook | null> {
  if (!available()) return null;
  let image: Blob | string = input.imageUrl;
  try {
    const res = await fetch(input.imageUrl);
    if (res.ok) image = await res.blob();
  } catch {}
  const look: SavedLook = {
    id: crypto.randomUUID(),
    garmentId: input.garmentId,
    garmentName: input.garmentName,
    price: input.price,
    shopName: input.shopName,
    shopId: input.shopId ?? null,
    image,
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  try { await tx("looks", "readwrite", (s) => s.put(look)); return look; } catch { return null; }
}

async function deviceListLooks(): Promise<SavedLook[]> {
  if (!available()) return [];
  try {
    const all = await tx<SavedLook[]>("looks", "readonly", (s) => s.getAll());
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch { return []; }
}

async function deviceSetFavorite(id: string, favorite: boolean): Promise<void> {
  if (!available()) return;
  try {
    const look = await tx<SavedLook>("looks", "readonly", (s) => s.get(id));
    if (look) await tx("looks", "readwrite", (s) => s.put({ ...look, favorite }));
  } catch {}
}

async function deviceDeleteLook(id: string): Promise<void> {
  if (!available()) return;
  try { await tx("looks", "readwrite", (s) => s.delete(id)); } catch {}
}

async function deviceClearAll(): Promise<void> {
  if (!available()) return;
  try { await tx("looks", "readwrite", (s) => s.clear()); await deviceForgetPhoto(); } catch {}
}

/* ============================== CLOUD (Supabase) ========================== */

async function signedLookUrl(path: string): Promise<string> {
  const { data } = await supabase().storage.from(LOOKS_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? "";
}

interface LookMeta {
  garmentId: string;
  garmentName: string;
  price: number;
  shopName: string;
  shopId?: string | null;
  favorite?: boolean;
}

/** Upload the pixels + insert the row for one look. Shared by the live save
    path (fetches a result URL first) and the device→cloud migration (already
    holds the Blob). */
async function cloudSaveLookBlob(uid: string, meta: LookMeta, blob: Blob): Promise<SavedLook | null> {
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const sb = supabase();
  const { error: upErr } = await sb.storage.from(LOOKS_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
  if (upErr) return null;
  const { data, error } = await sb
    .from("saved_looks")
    .insert({
      user_id: uid,
      shop_id: meta.shopId ?? null,
      garment_id: meta.garmentId,
      garment_name: meta.garmentName,
      shop_name: meta.shopName,
      price_npr: meta.price,
      image_path: path,
      ...(meta.favorite ? { favorite: true } : {}),
    })
    .select()
    .single();
  if (error || !data) {
    await sb.storage.from(LOOKS_BUCKET).remove([path]).catch(() => {});
    return null;
  }
  return {
    id: data.id,
    garmentId: data.garment_id,
    garmentName: data.garment_name,
    price: data.price_npr,
    shopName: data.shop_name ?? "",
    shopId: data.shop_id,
    image: await signedLookUrl(path),
    favorite: data.favorite,
    createdAt: data.created_at,
  };
}

async function cloudSaveLook(uid: string, input: SaveLookInput): Promise<SavedLook | null> {
  // grab the pixels now — result URLs expire upstream
  let blob: Blob;
  try {
    const res = await fetch(input.imageUrl);
    if (!res.ok) return null;
    blob = await res.blob();
  } catch {
    return null;
  }
  return cloudSaveLookBlob(uid, input, blob);
}

async function cloudListLooks(uid: string): Promise<SavedLook[]> {
  const { data } = await supabase()
    .from("saved_looks")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  const rows = (data as any[]) || [];
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      garmentId: r.garment_id,
      garmentName: r.garment_name,
      price: r.price_npr,
      shopName: r.shop_name ?? "",
      shopId: r.shop_id,
      image: await signedLookUrl(r.image_path),
      favorite: r.favorite,
      createdAt: r.created_at,
    }))
  );
}

async function cloudSetFavorite(id: string, favorite: boolean): Promise<void> {
  await supabase().from("saved_looks").update({ favorite }).eq("id", id);
}

async function cloudDeleteLook(id: string): Promise<void> {
  const sb = supabase();
  const { data } = await sb.from("saved_looks").select("image_path").eq("id", id).maybeSingle();
  await sb.from("saved_looks").delete().eq("id", id);
  if (data?.image_path) await sb.storage.from(LOOKS_BUCKET).remove([data.image_path]).catch(() => {});
}

async function cloudClearAll(uid: string): Promise<void> {
  const sb = supabase();
  const { data } = await sb.from("saved_looks").select("image_path").eq("user_id", uid);
  const paths = ((data as any[]) || []).map((r) => r.image_path).filter(Boolean);
  await sb.from("saved_looks").delete().eq("user_id", uid);
  if (paths.length) await sb.storage.from(LOOKS_BUCKET).remove(paths).catch(() => {});
  await cloudForgetPhoto(uid);
}

async function cloudRememberPhoto(uid: string, dataUrl: string): Promise<void> {
  const sb = supabase();
  const path = `${uid}/photo.jpg`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, dataURLToBlob(dataUrl), {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) return;
  await sb.from("profiles").upsert({ id: uid, photo_path: path, updated_at: new Date().toISOString() }, { onConflict: "id" });
}

/* Returns a data URL, NOT a signed URL. The remembered photo feeds straight
   into runTryOn, and /api/tryon rejects anything that isn't a data URL — the
   device path (IndexedDB) has always returned one, so the cloud path has to
   match or try-on breaks for signed-in shoppers only. Downloading the blob
   also skips a signed-URL round trip on a bucket we can read directly. */
async function cloudGetRememberedPhoto(uid: string): Promise<string | null> {
  const sb = supabase();
  const { data } = await sb.from("profiles").select("photo_path").eq("id", uid).maybeSingle();
  if (!data?.photo_path) return null;
  const { data: blob, error } = await sb.storage.from(PHOTO_BUCKET).download(data.photo_path);
  if (error || !blob) return null;
  try {
    return await blobToDataURL(blob);
  } catch {
    return null;
  }
}

async function cloudForgetPhoto(uid: string): Promise<void> {
  const sb = supabase();
  await sb.storage.from(PHOTO_BUCKET).remove([`${uid}/photo.jpg`]).catch(() => {});
  await sb.from("profiles").upsert({ id: uid, photo_path: null, updated_at: new Date().toISOString() }, { onConflict: "id" });
}

/* ============================== PUBLIC API =============================== */

interface SaveLookInput {
  garmentId: string;
  garmentName: string;
  price: number;
  shopName: string;
  shopId?: string | null;
  imageUrl: string;
}

export async function rememberPhoto(dataUrl: string): Promise<void> {
  const uid = await currentUserId();
  return uid ? cloudRememberPhoto(uid, dataUrl) : deviceRememberPhoto(dataUrl);
}

export async function getRememberedPhoto(): Promise<string | null> {
  const uid = await currentUserId();
  return uid ? cloudGetRememberedPhoto(uid) : deviceGetRememberedPhoto();
}

export async function forgetPhoto(): Promise<void> {
  const uid = await currentUserId();
  return uid ? cloudForgetPhoto(uid) : deviceForgetPhoto();
}

export async function saveLook(input: SaveLookInput): Promise<SavedLook | null> {
  const uid = await currentUserId();
  return uid ? cloudSaveLook(uid, input) : deviceSaveLook(input);
}

export async function listLooks(): Promise<SavedLook[]> {
  const uid = await currentUserId();
  return uid ? cloudListLooks(uid) : deviceListLooks();
}

export async function setLookFavorite(id: string, favorite: boolean): Promise<void> {
  const uid = await currentUserId();
  return uid ? cloudSetFavorite(id, favorite) : deviceSetFavorite(id, favorite);
}

export async function deleteLook(id: string): Promise<void> {
  const uid = await currentUserId();
  return uid ? cloudDeleteLook(id) : deviceDeleteLook(id);
}

/** The "delete everything about me" button: looks + remembered photo. */
export async function clearAllLooks(): Promise<void> {
  const uid = await currentUserId();
  return uid ? cloudClearAll(uid) : deviceClearAll();
}

/** Wipe this browser's copy of a shopper's looks and remembered photo, and
    nothing else — cloud rows are never touched.

    This is what a shared shop tablet needs at the end of a session. It must
    NOT be clearAllLooks(): for a signed-in shopper that deletes their cloud
    looks permanently, so tidying the tablet would destroy the looks they'd
    expect to still find on their own phone. Handing the tablet to the next
    shopper is a local concern, never a reason to delete someone's account
    data. */
export async function clearDeviceSession(): Promise<void> {
  await deviceClearAll();
  await deviceForgetPhoto();
}

/* ---------- device → account migration ---------- */

/** How many looks are stranded in this browser's IndexedDB (0 if none / off).
    Drives the "add them to your account?" prompt after a shopper signs in. */
export async function deviceLooksCount(): Promise<number> {
  return (await deviceListLooks()).length;
}

/** Move any device-saved looks (and the remembered photo) into the signed-in
    user's cloud account, then clear them from this device. No-op if not signed
    in. Returns how many looks were copied up. */
export async function migrateDeviceLooksToCloud(): Promise<number> {
  const uid = await currentUserId();
  if (!uid) return 0;

  const looks = await deviceListLooks();
  let moved = 0;
  for (const l of looks) {
    let blob: Blob | null = null;
    try {
      blob = l.image instanceof Blob ? l.image : await (await fetch(l.image)).blob();
    } catch {
      blob = null;
    }
    if (!blob) continue;
    const saved = await cloudSaveLookBlob(uid, {
      garmentId: l.garmentId,
      garmentName: l.garmentName,
      price: l.price,
      shopName: l.shopName,
      shopId: l.shopId ?? null,
      favorite: l.favorite,
    }, blob);
    if (saved) moved++;
  }

  // carry the remembered photo over only if the account doesn't have one yet
  try {
    const devicePhoto = await deviceGetRememberedPhoto();
    if (devicePhoto && !(await cloudGetRememberedPhoto(uid))) {
      await cloudRememberPhoto(uid, devicePhoto);
    }
  } catch {}

  await deviceClearAll();
  return moved;
}

/* ---------- display / share helpers (backend-agnostic) ---------- */

export function lookImageURL(look: SavedLook): string {
  return look.image instanceof Blob ? URL.createObjectURL(look.image) : look.image;
}

/* Works with a fresh result URL too, so the kiosk can share straight from
   the result bar without saving a look first. */
export async function shareImage(image: Blob | string, garmentName: string, shopName: string): Promise<void> {
  const blob = image instanceof Blob ? image : await (await fetch(image)).blob();
  const file = new File([blob], "peeq-look.jpg", { type: blob.type || "image/jpeg" });
  const text = garmentName + " at " + (shopName || "the shop") + " — tried on with peeq";
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "peeq-look.jpg";
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function shareLook(look: SavedLook): Promise<void> {
  return shareImage(look.image, look.garmentName, look.shopName);
}

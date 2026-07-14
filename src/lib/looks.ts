/* "My Looks" — shopper-side memory, ON THIS DEVICE ONLY (IndexedDB).
   Nothing here ever touches a server: the consent screen promises the shop
   never keeps shopper photos, so reuse-photo and saved looks live entirely
   in the shopper's browser, with expiry and one-tap deletion. */

export interface SavedLook {
  id: string;
  garmentId: string;
  garmentName: string;
  price: number;
  shopName: string;
  image: Blob | string; // Blob preferred; falls back to the (expiring) result URL
  favorite: boolean;
  createdAt: string;
}

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

/* ---------- remembered photo (opt-in, 7-day expiry) ---------- */

export async function rememberPhoto(dataUrl: string): Promise<void> {
  if (!available()) return;
  try {
    await tx("kv", "readwrite", (s) => s.put({ dataUrl, savedAt: Date.now() }, PHOTO_KEY));
  } catch {}
}

export async function getRememberedPhoto(): Promise<string | null> {
  if (!available()) return null;
  try {
    const rec = await tx<any>("kv", "readonly", (s) => s.get(PHOTO_KEY));
    if (!rec) return null;
    if (Date.now() - rec.savedAt > PHOTO_TTL_MS) {
      await forgetPhoto();
      return null;
    }
    return rec.dataUrl as string;
  } catch {
    return null;
  }
}

export async function forgetPhoto(): Promise<void> {
  if (!available()) return;
  try {
    await tx("kv", "readwrite", (s) => s.delete(PHOTO_KEY));
  } catch {}
}

/* ---------- saved looks ---------- */

export async function saveLook(input: {
  garmentId: string;
  garmentName: string;
  price: number;
  shopName: string;
  imageUrl: string;
}): Promise<SavedLook | null> {
  if (!available()) return null;
  // Result URLs expire upstream, so grab the pixels now; keep the URL if CORS blocks us.
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
    image,
    favorite: false,
    createdAt: new Date().toISOString(),
  };
  try {
    await tx("looks", "readwrite", (s) => s.put(look));
    return look;
  } catch {
    return null;
  }
}

export async function listLooks(): Promise<SavedLook[]> {
  if (!available()) return [];
  try {
    const all = await tx<SavedLook[]>("looks", "readonly", (s) => s.getAll());
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function setLookFavorite(id: string, favorite: boolean): Promise<void> {
  if (!available()) return;
  try {
    const look = await tx<SavedLook>("looks", "readonly", (s) => s.get(id));
    if (look) await tx("looks", "readwrite", (s) => s.put({ ...look, favorite }));
  } catch {}
}

export async function deleteLook(id: string): Promise<void> {
  if (!available()) return;
  try {
    await tx("looks", "readwrite", (s) => s.delete(id));
  } catch {}
}

/** The "delete everything about me" button: looks + remembered photo. */
export async function clearAllLooks(): Promise<void> {
  if (!available()) return;
  try {
    await tx("looks", "readwrite", (s) => s.clear());
    await forgetPhoto();
  } catch {}
}

/* ---------- display / share helpers ---------- */

export function lookImageURL(look: SavedLook): string {
  return look.image instanceof Blob ? URL.createObjectURL(look.image) : look.image;
}

export async function shareLook(look: SavedLook): Promise<void> {
  const blob =
    look.image instanceof Blob ? look.image : await (await fetch(look.image)).blob();
  const file = new File([blob], "easyfitcheck-look.jpg", { type: blob.type || "image/jpeg" });
  const text = look.garmentName + " at " + (look.shopName || "the shop") + " — tried on with EasyFitCheck";
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "easyfitcheck-look.jpg";
  a.click();
  URL.revokeObjectURL(a.href);
}

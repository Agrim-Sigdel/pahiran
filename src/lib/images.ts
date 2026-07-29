/* Client-side image compression so catalog photos and shopper photos
   stay small enough for storage and the try-on API. */
export function fileToCompressedDataURL(
  file: File,
  maxDim = 720,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** A crop box in fractions of the image, 0..1. Resolution-independent, so the
    same numbers work against the on-screen preview and the full-size pixels. */
export interface CropRect { x: number; y: number; w: number; h: number }

/* Read a file without resizing it. The cropper needs the full picture to show,
   and the crop it produces is what gets compressed — squeezing to 720px first
   would mean cropping a quarter of the frame and keeping 180px of it. */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

/* Cut a region out of an image and compress what's left, to the same budget
   fileToCompressedDataURL uses — a cropped photo and a whole one arrive at
   storage the same size.

   maxDim applies to the crop, not the original: keeping just the weave from a
   4000px photo yields a 720px picture of the weave, which is the entire point
   of cropping before upload rather than after. */
export function cropToCompressedDataURL(
  src: string,
  crop: CropRect,
  maxDim = 720,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    /* Set before src, and needed since re-cropping arrived: the source used to
       be a data URL straight off the file input, and is now sometimes a photo
       already stored in a public bucket. Without this the canvas is tainted
       and toDataURL throws inside onload, where nothing catches it — the
       promise never settles and the cropper sits on "cropping…" forever. A
       bucket that refuses the CORS request fails through onerror instead,
       which the caller already shows. */
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error("Could not read that image"));
    img.onload = () => {
      const sw = Math.max(1, Math.round(crop.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(crop.h * img.naturalHeight));
      const sx = Math.round(crop.x * img.naturalWidth);
      const sy = Math.round(crop.y * img.naturalHeight);
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(sw * scale));
      c.height = Math.max(1, Math.round(sh * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("Could not read that image"));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.src = src;
  });
}

/* Fetch + decode an image before anything shows it.

   A URL arriving is not the same thing as a picture arriving: a signed render
   URL still has to be downloaded and decoded, which on a shop's wifi is a
   visible beat. Anything that swaps a loading state for an <img> the moment it
   has the URL will stop its own loading animation over a blank frame. Await
   this first and the swap lands on a picture that is already paintable.

   Never rejects — a decode failure should still let the caller try to render
   it (and the timeout keeps a stalled fetch from freezing the UI forever). */
export function preloadImage(src: string, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !src) return resolve();
    const img = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    img.onload = () => {
      // decode() moves the (expensive) decode off the frame that paints it
      const d = img.decode?.();
      if (d) d.then(finish, finish);
      else finish();
    };
    img.onerror = finish;
    img.decoding = "async";
    img.src = src;
  });
}

/* Blob → data URL. The inverse of dataURLToBlob, for pulling an image back out
   of Storage: /api/tryon only accepts data URLs, so anything fetched from a
   signed URL has to be inlined before it can be sent for a try-on. */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

/* data URL → Blob for uploads to Supabase Storage */
export function dataURLToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

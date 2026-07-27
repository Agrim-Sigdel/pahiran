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

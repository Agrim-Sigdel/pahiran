/* Client → our own /api/tryon proxy. The fal key never reaches the browser.
   shopId/garmentId ride along so the server can cache + log analytics. */
export async function runTryOn(
  personDataUrl: string,
  garmentImage: string,
  category: string,
  ids?: { shopId?: string | null; garmentId?: string | null }
): Promise<string> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personImage: personDataUrl,
      garmentImage,
      category,
      shopId: ids?.shopId || null,
      garmentId: ids?.garmentId || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Try-on failed (" + res.status + ")");
  if (!data.url) throw new Error("Try-on returned no image");
  return data.url;
}

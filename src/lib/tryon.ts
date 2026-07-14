/* Anonymous per-kiosk-session id: distinguishes 12 shoppers from one shopper
   trying 12 pieces. Rotates when the tab/session ends; carries no identity. */
export function getKioskSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem("pahiran:session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("pahiran:session", id);
    }
    return id;
  } catch {
    return null;
  }
}

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
      sessionId: getKioskSessionId(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Try-on failed (" + res.status + ")");
  if (!data.url) throw new Error("Try-on returned no image");
  return data.url;
}

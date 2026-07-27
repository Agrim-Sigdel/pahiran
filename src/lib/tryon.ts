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

/* Client → our own /api/tryon proxy. Provider keys never reach the browser.
   shopId/garmentId ride along so the server can cache + log analytics.
   Every try-on runs the studio finish now; the server still quietly falls
   back to quick when no OpenAI key is configured or the studio quota is
   spent, so the shopper always gets a result. */
export type TryOnFinish = "quick" | "studio";

export async function runTryOn(
  personDataUrl: string,
  garmentImage: string,
  category: string,
  ids?: {
    shopId?: string | null;
    garmentId?: string | null;
    /* Set instead of garmentId when the piece is a rendered fabric x cut. The
       server resolves whichever one it gets and refuses to trust garmentImage
       in Supabase mode either way. */
    compositionId?: string | null;
  },
  finish: TryOnFinish = "studio",
  /* So the kiosk can offer a way out of a wait it started. The shopper gets
     their minute back and the tab stops holding the connection; the render
     the provider already began is not recalled, which is why the kiosk asks
     before it starts rather than only offering to stop afterwards. */
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personImage: personDataUrl,
      garmentImage,
      category,
      finish,
      shopId: ids?.shopId || null,
      garmentId: ids?.garmentId || null,
      compositionId: ids?.compositionId || null,
      sessionId: getKioskSessionId(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Try-on failed (" + res.status + ")");
  if (!data.url) throw new Error("Try-on returned no image");
  return data.url;
}

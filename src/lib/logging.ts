/* Fire-and-forget client error reporting → /api/log.
   Never throws, never blocks the UI; keepalive survives page navigation. */
export function reportError(
  source: string,
  message: string,
  detail?: Record<string, unknown>
): void {
  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, message, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}

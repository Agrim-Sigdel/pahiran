export type Lang = "en" | "ne";

/* The language preference lives in BOTH localStorage and a cookie.

   localStorage is what the kiosk has always read, and it stays the source of
   truth on the client. The cookie exists for one reason: a server component
   can read it. /privacy used to be a client component that read localStorage
   in an effect, so a Nepali reader got a paragraph of English, a repaint, and
   then their own language — on the one page in the product where being able
   to read the words is the entire point.

   Written on every toggle so the two never disagree; a stale cookie would
   flash the wrong way round, which is the same bug with extra steps. */
export const LANG_KEY = "pahiran:lang";
export const LANG_COOKIE = "pq_lang";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ne";
}

/** Client-side: persist to both stores. */
export function persistLang(lang: Lang): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
  try {
    // a year, root path, lax — this is a display preference, not a credential
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  } catch { /* no document (SSR) */ }
}

/** Client-side: whatever we last stored, preferring localStorage. */
export function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (isLang(v)) return v;
  } catch { /* private mode */ }
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=(en|ne)`));
    if (m && isLang(m[1])) return m[1];
  } catch { /* no document */ }
  return "en";
}

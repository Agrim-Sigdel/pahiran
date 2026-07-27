/* Locale-aware formatting for a bilingual product.

   Dates were written as `toLocaleDateString("en-GB", …)` at the call site,
   which pins every date in a Nepali/English app to one European format
   whatever the reader's device says. Passing `undefined` hands the choice
   back to the browser, which already knows — and keeping it in one function
   means the next date added to the app doesn't have to re-decide.

   Deliberately NOT `ne-NP`-forced either: a Nepali speaker on a device set to
   English wants the dates their phone shows them everywhere else. */

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function formatDate(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, DATE_OPTS);
}

export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { ...DATE_OPTS, hour: "numeric", minute: "2-digit" });
}

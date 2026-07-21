import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/* Browser-side helpers for the admin console. Every call carries the caller's
   Supabase access token; the server re-checks it against ADMIN_EMAILS on each
   request, so nothing here is a security boundary — it only decides what the
   console renders. */

export type AdminStatus = "loading" | "unauth" | "forbidden" | "ready" | "nosupabase";

async function token(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GET an admin endpoint. Throws AdminError with the HTTP status on failure. */
export async function adminGet<T>(path: string): Promise<T> {
  const t = await token();
  if (!t) throw new AdminError("Not signed in", 401);
  const res = await fetch(path, { headers: { Authorization: "Bearer " + t } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new AdminError(j?.error || "Request failed", res.status);
  }
  return res.json();
}

/** POST to an admin endpoint. */
export async function adminPost<T = { ok: true }>(path: string, body: unknown): Promise<T> {
  const t = await token();
  if (!t) throw new AdminError("Not signed in", 401);
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new AdminError(j?.error || "Action failed", res.status);
  }
  return res.json();
}

/** Map a thrown AdminError onto the shell's status states. */
export function statusFromError(e: unknown): AdminStatus {
  if (!isSupabaseConfigured()) return "nosupabase";
  if (e instanceof AdminError) {
    if (e.status === 401) return "unauth";
    if (e.status === 403) return "forbidden";
  }
  return "forbidden";
}

/** Short, stable date rendering used across every admin table. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

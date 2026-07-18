"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/* Admin billing inbox — open plan/credit requests with one-click activate,
   grant, or dismiss. Visible only to ADMIN_EMAILS accounts (enforced by the
   /api/admin/requests route; this page just renders what that returns). */

interface Req {
  id: string;
  kind: "plan" | "credits";
  planId: string | null;
  note: string | null;
  createdAt: string;
  shopName: string;
  shopSlug: string;
}

type Status = "loading" | "unauth" | "forbidden" | "ready" | "nosupabase";

export default function AdminPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [grant, setGrant] = useState<Record<string, string>>({});

  const token = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) { setStatus("nosupabase"); return; }
    const t = await token();
    if (!t) { setStatus("unauth"); return; }
    const res = await fetch("/api/admin/requests", { headers: { Authorization: "Bearer " + t } });
    if (res.status === 403) { setStatus("forbidden"); return; }
    if (!res.ok) { setStatus("forbidden"); return; }
    const data = await res.json();
    setReqs(data.requests || []);
    setStatus("ready");
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (r: Req, action: "activate" | "grant" | "dismiss") => {
    setBusy(r.id + ":" + action);
    try {
      const t = await token();
      const tryons = action === "grant" ? parseInt(grant[r.id] || "50", 10) || 0 : undefined;
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ requestId: r.id, action, planId: r.planId, tryons }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Action failed.");
        return;
      }
      setReqs((rs) => rs.filter((x) => x.id !== r.id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px min(26px, 4vw) 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div className="wordmark" style={{ fontSize: 22 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>
            <div style={{ fontSize: 12, color: "var(--mut)", letterSpacing: ".12em", marginTop: 3 }}>admin · billing requests</div>
          </div>
          <Link href="/dashboard" className="ph-btn" style={{ fontSize: 12, color: "var(--mut)" }}>← dashboard</Link>
        </div>

        {status === "loading" && <Note>Loading…</Note>}
        {status === "nosupabase" && <Note>Admin tools need cloud mode (Supabase configured).</Note>}
        {status === "unauth" && <Note>Please <Link href="/login" style={{ color: "var(--violet)" }}>sign in</Link> with an admin account.</Note>}
        {status === "forbidden" && <Note>This account isn't an admin. Sign in as an allow-listed admin (ADMIN_EMAILS).</Note>}

        {status === "ready" && (
          reqs.length === 0 ? (
            <Note>No open requests. 🎉</Note>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {reqs.map((r) => (
                <div key={r.id} className="panel" style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <span className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)" }}>
                        {r.shopName || "(unnamed shop)"}
                      </span>
                      {r.shopSlug && <span style={{ fontSize: 12, color: "var(--mut)", marginLeft: 8 }}>/{r.shopSlug}</span>}
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--mut)" }}>
                      {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--stone)", margin: "6px 0 12px" }}>
                    <b style={{ color: r.kind === "plan" ? "var(--violet)" : "var(--camel)" }}>
                      {r.kind === "plan" ? "Plan upgrade" : "Credit top-up"}
                    </b>
                    {r.note ? " — " + r.note : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {r.kind === "plan" && r.planId && (
                      <button className="ph-btn btn-solid" disabled={!!busy} onClick={() => act(r, "activate")}
                        style={{ padding: "9px 16px", fontSize: 12 }}>
                        {busy === r.id + ":activate" ? "activating…" : "Activate " + r.planId}
                      </button>
                    )}
                    {r.kind === "credits" && (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={grant[r.id] ?? "50"} inputMode="numeric" maxLength={6}
                          onChange={(e) => setGrant((g) => ({ ...g, [r.id]: e.target.value.replace(/[^0-9]/g, "") }))}
                          style={{ width: 68, padding: "9px 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
                        <button className="ph-btn btn-solid" disabled={!!busy} onClick={() => act(r, "grant")}
                          style={{ padding: "9px 16px", fontSize: 12 }}>
                          {busy === r.id + ":grant" ? "granting…" : "Grant try-ons"}
                        </button>
                      </span>
                    )}
                    <button className="ph-btn" disabled={!!busy} onClick={() => act(r, "dismiss")}
                      style={{ padding: "9px 14px", fontSize: 12, color: "var(--mut)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="panel"><div style={{ color: "var(--mut)", padding: 20, fontSize: 14 }}>{children}</div></div>;
}

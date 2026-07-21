"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Note, SectionHead, Field } from "../AdminShell";
import { adminGet, adminPost, when } from "@/lib/admin-client";

/* Billing inbox — open plan/credit requests with one-click activate, grant, or
   dismiss. The shell above has already established that the caller is an
   admin; /api/admin/requests enforces it again server-side. */

interface Req {
  id: string;
  kind: "plan" | "credits";
  planId: string | null;
  note: string | null;
  createdAt: string;
  shopName: string;
  shopSlug: string;
}

export default function BillingPage() {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await adminGet<{ requests: Req[] }>("/api/admin/requests");
      setReqs(d.requests || []);
    } catch (e: any) {
      setErr(e?.message || "Could not load requests.");
      setReqs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (r: Req, action: "activate" | "grant" | "dismiss") => {
    setBusy(r.id + ":" + action);
    setErr("");
    try {
      const tryons = action === "grant" ? parseInt(grant[r.id] || "50", 10) || 0 : undefined;
      await adminPost("/api/admin/requests", {
        requestId: r.id,
        action,
        planId: r.planId,
        tryons,
      });
      setReqs((rs) => (rs || []).filter((x) => x.id !== r.id));
    } catch (e: any) {
      setErr(e?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SectionHead
        title="Billing requests"
        sub="Vendors request a plan or a top-up; you fulfil it here while live checkout is dormant."
      />

      {err && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 12, color: "#9b3232", fontSize: 13 }}>
          {err}
        </div>
      )}

      {reqs === null ? (
        <Note>Loading…</Note>
      ) : reqs.length === 0 ? (
        <Note>
          No open requests. <Icon name="party" />
        </Note>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reqs.map((r) => (
            <div key={r.id} className="panel" style={{ padding: "16px 18px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <span className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)" }}>
                    {r.shopName || "(unnamed shop)"}
                  </span>
                  {r.shopSlug && (
                    <span style={{ fontSize: 12, color: "var(--mut)", marginLeft: 8 }}>/{r.shopSlug}</span>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--mut)" }}>{when(r.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--stone)", margin: "6px 0 12px" }}>
                <b style={{ color: r.kind === "plan" ? "var(--violet)" : "var(--camel)" }}>
                  {r.kind === "plan" ? "Plan upgrade" : "Credit top-up"}
                </b>
                {r.note ? " — " + r.note : ""}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {r.kind === "plan" && r.planId && (
                  <button
                    className="ph-btn btn-solid"
                    disabled={!!busy}
                    onClick={() => act(r, "activate")}
                    style={{ padding: "9px 16px", fontSize: 12 }}
                  >
                    {busy === r.id + ":activate" ? "activating…" : "Activate " + r.planId}
                  </button>
                )}
                {r.kind === "credits" && (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Field
                      value={grant[r.id] ?? "50"}
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(e) =>
                        setGrant((g) => ({ ...g, [r.id]: e.target.value.replace(/[^0-9]/g, "") }))
                      }
                      style={{ width: 68 }}
                    />
                    <button
                      className="ph-btn btn-solid"
                      disabled={!!busy}
                      onClick={() => act(r, "grant")}
                      style={{ padding: "9px 16px", fontSize: 12 }}
                    >
                      {busy === r.id + ":grant" ? "granting…" : "Grant try-ons"}
                    </button>
                  </span>
                )}
                <button
                  className="ph-btn"
                  disabled={!!busy}
                  onClick={() => act(r, "dismiss")}
                  style={{
                    padding: "9px 14px",
                    fontSize: 12,
                    color: "var(--mut)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-btn)",
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

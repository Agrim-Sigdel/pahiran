"use client";

import { useEffect, useState } from "react";
import { Note, SectionHead } from "../AdminShell";
import { adminGet, when } from "@/lib/admin-client";

/* Ops — the recent error tail and the admin audit trail side by side.

   The audit trail is the accountability half of this console: every status
   change, role change, and deletion made from /admin lands here with the
   acting account's email, and nothing in the app can edit or remove it. */

interface ErrRow {
  id: string;
  source: string;
  message: string;
  shopId: string | null;
  detail: string | null;
  createdAt: string;
}
interface ActionRow {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: string | null;
  createdAt: string;
}

export default function OpsPage() {
  const [errors, setErrors] = useState<ErrRow[] | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminGet<{ errors: ErrRow[]; actions: ActionRow[] }>("/api/admin/ops")
      .then((d) => {
        setErrors(d.errors || []);
        setActions(d.actions || []);
      })
      .catch((e) => {
        setErr(e?.message || "Could not load ops data.");
        setErrors([]);
      });
  }, []);

  if (err) return <Note>{err}</Note>;

  return (
    <>
      <SectionHead title="Admin audit trail" sub="Every change made from this console." />
      {actions.length === 0 ? (
        <Note>Nothing recorded yet.</Note>
      ) : (
        <div className="panel" style={{ padding: "6px 0", marginBottom: 30 }}>
          {actions.map((a) => (
            <Row key={a.id} time={a.createdAt}>
              <b style={{ color: "var(--forest-deep)" }}>{a.action}</b>{" "}
              <span style={{ color: "var(--stone)" }}>{a.target}</span>
              <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 2 }}>
                by {a.actor}
                {a.detail ? " · " + a.detail : ""}
              </div>
            </Row>
          ))}
        </div>
      )}

      <SectionHead title="Recent errors" sub="From error_logs — the app's own reports." />
      {errors === null ? (
        <Note>Loading…</Note>
      ) : errors.length === 0 ? (
        <Note>No errors logged. Quiet is good.</Note>
      ) : (
        <div className="panel" style={{ padding: "6px 0" }}>
          {errors.map((e) => (
            <Row key={e.id} time={e.createdAt}>
              <b style={{ color: "#9b3232" }}>{e.source}</b>{" "}
              <span style={{ color: "var(--ink)" }}>{e.message}</span>
              {e.detail && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--mut)",
                    marginTop: 3,
                    fontFamily: "ui-monospace, monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {e.detail}
                </div>
              )}
            </Row>
          ))}
        </div>
      )}
    </>
  );
}

function Row({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--line)",
        fontSize: 13,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{ fontSize: 11.5, color: "var(--mut)", whiteSpace: "nowrap" }}>{when(time)}</div>
    </div>
  );
}

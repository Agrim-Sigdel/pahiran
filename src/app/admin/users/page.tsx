"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Note, Pill, SectionHead, Field } from "../AdminShell";
import { adminGet, adminPost, when } from "@/lib/admin-client";

/* Accounts — vendors and shoppers, with the levers that apply to a person
   rather than a shop.

   This screen shows the shape of an account and never its contents. A
   shopper's saved looks and remembered photo are counted here and nowhere
   viewable: they live in private buckets under per-user RLS, and the admin API
   deliberately declines to read them. Deleting the account is what removes
   them, and it removes all of them at once. */

interface User {
  id: string;
  email: string;
  role: string;
  name: string;
  phone: string;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  savedLookCount: number;
  shop: { id: string; name: string; slug: string; status: string } | null;
}

const ROLES = ["", "vendor", "shopper"] as const;
const ROLE_LABEL: Record<string, string> = { "": "Everyone", vendor: "Vendors", shopper: "Shoppers" };

export default function UsersPage() {
  const [role, setRole] = useState<string>("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<User[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setUsers(null);
    setErr("");
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (role) qs.set("role", role);
      if (q.trim()) qs.set("q", q.trim());
      const d = await adminGet<{ users: User[]; hasMore: boolean }>("/api/admin/users?" + qs);
      setUsers(d.users || []);
      setHasMore(d.hasMore);
    } catch (e: any) {
      setErr(e?.message || "Could not load accounts.");
      setUsers([]);
    }
  }, [role, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (u: User, body: Record<string, unknown>, key: string) => {
    setBusy(u.id + ":" + key);
    setErr("");
    try {
      await adminPost("/api/admin/users", { userId: u.id, ...body });
      await load();
      setConfirming(null);
      setConfirmText("");
    } catch (e: any) {
      setErr(e?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SectionHead
        title="Accounts"
        sub="Vendors and shoppers share one auth system; the role decides which entry points they get."
        right={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              load();
            }}
            style={{ display: "flex", gap: 6 }}
          >
            <Field
              placeholder="Search email, name, shop…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 220 }}
            />
            <button
              className="ph-btn"
              type="submit"
              style={{ padding: "9px 14px", fontSize: 12, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}
            >
              Search
            </button>
          </form>
        }
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {ROLES.map((r) => (
          <button
            key={r || "all"}
            onClick={() => { setRole(r); setPage(1); }}
            className="ph-btn"
            style={{
              padding: "7px 13px",
              fontSize: 12,
              borderRadius: 999,
              border: "1px solid " + (role === r ? "var(--forest-deep)" : "var(--line)"),
              color: role === r ? "var(--forest-deep)" : "var(--mut)",
              background: role === r ? "rgba(47,109,79,.07)" : "transparent",
            }}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      <div
        className="panel"
        style={{ padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "var(--mut)" }}
      >
        Saved looks and remembered photos are private to the account that made them and are not viewable
        here. Deleting an account erases them permanently.
      </div>

      {err && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 12, color: "#9b3232", fontSize: 13 }}>
          {err}
        </div>
      )}

      {users === null ? (
        <Note>Loading…</Note>
      ) : users.length === 0 ? (
        <Note>No accounts match.</Note>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <div key={u.id} className="panel" style={{ padding: "14px 17px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, color: "var(--ink)" }}>{u.email || "(no email)"}</span>
                    <Pill tone={u.role === "vendor" ? "good" : "mute"}>{u.role}</Pill>
                    {!u.confirmed && <Pill tone="warn">unconfirmed</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
                    {u.name || "no name"} {u.phone ? "· " + u.phone : ""} · {u.savedLookCount} saved look
                    {u.savedLookCount === 1 ? "" : "s"}
                  </div>
                  {u.shop && (
                    <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>
                      owns{" "}
                      <Link href={"/admin/shops?status=" + u.shop.status} style={{ color: "var(--violet)" }}>
                        {u.shop.name || u.shop.slug}
                      </Link>{" "}
                      ({u.shop.status})
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "right", whiteSpace: "nowrap" }}>
                  joined {when(u.createdAt)}
                  <div>last seen {when(u.lastSignInAt)}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 11, alignItems: "center" }}>
                <Btn
                  busy={busy === u.id + ":role"}
                  onClick={() => act(u, { action: "role", role: u.role === "vendor" ? "shopper" : "vendor" }, "role")}
                >
                  Make {u.role === "vendor" ? "shopper" : "vendor"}
                </Btn>
                <Btn busy={busy === u.id + ":ban"} onClick={() => act(u, { action: "ban" }, "ban")}>
                  Suspend
                </Btn>
                <Btn busy={busy === u.id + ":unban"} onClick={() => act(u, { action: "unban" }, "unban")}>
                  Restore
                </Btn>

                <span style={{ flex: 1 }} />

                {confirming === u.id ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Field
                      autoFocus
                      placeholder={"type " + u.email}
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      style={{ width: 200 }}
                    />
                    <Btn
                      danger
                      busy={busy === u.id + ":delete"}
                      onClick={() => act(u, { action: "delete", confirm: confirmText }, "delete")}
                    >
                      Delete forever
                    </Btn>
                    <Btn onClick={() => { setConfirming(null); setConfirmText(""); }}>Cancel</Btn>
                  </span>
                ) : (
                  <Btn danger onClick={() => setConfirming(u.id)}>
                    Delete account
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
        <Btn busy={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ← previous
        </Btn>
        <span style={{ fontSize: 12, color: "var(--mut)", alignSelf: "center" }}>page {page}</span>
        <Btn busy={!hasMore} onClick={() => setPage((p) => p + 1)}>
          next →
        </Btn>
      </div>
    </>
  );
}

function Btn({
  children,
  onClick,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className="ph-btn"
      disabled={busy}
      onClick={onClick}
      style={{
        padding: "8px 13px",
        fontSize: 12,
        borderRadius: "var(--radius-btn)",
        border: "1px solid var(--line)",
        color: danger ? "#9b3232" : "var(--mut)",
        opacity: busy ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

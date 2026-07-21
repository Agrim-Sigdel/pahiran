"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Note, Pill, SectionHead, Field } from "../AdminShell";
import { adminGet, adminPost, when } from "@/lib/admin-client";

/* Shops — the approval queue and every lever over a live vendor.

   Approve / reject / suspend all route through set_shop_status, which is what
   the storefront RLS policies and consume_tryon read. Deleting is guarded by
   typing the slug, because it cascades the whole catalog and lead history. */

interface Shop {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  whatsapp: string | null;
  listed: boolean;
  status: "pending" | "approved" | "rejected" | "suspended";
  statusNote: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  ownerEmail: string;
  garmentCount: number;
  plan: string;
  tryonsUsed: number;
  periodEnd: string | null;
}

const TABS = ["pending", "approved", "suspended", "rejected", ""] as const;
const TAB_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
  "": "All",
};

const TONE: Record<Shop["status"], "good" | "warn" | "bad" | "mute"> = {
  approved: "good",
  pending: "warn",
  suspended: "bad",
  rejected: "mute",
};

export default function ShopsPage() {
  return (
    <Suspense fallback={<Note>Loading…</Note>}>
      <ShopsTable />
    </Suspense>
  );
}

function ShopsTable() {
  const params = useSearchParams();
  const [tab, setTab] = useState<string>(params.get("status") || "pending");
  const [q, setQ] = useState("");
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  // Reject/suspend ask for a reason first — the vendor is shown it verbatim.
  const [noting, setNoting] = useState<{ id: string; status: Shop["status"] } | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(async () => {
    setShops(null);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (tab) qs.set("status", tab);
      if (q.trim()) qs.set("q", q.trim());
      const d = await adminGet<{ shops: Shop[] }>("/api/admin/shops?" + qs);
      setShops(d.shops || []);
    } catch (e: any) {
      setErr(e?.message || "Could not load shops.");
      setShops([]);
    }
  }, [tab, q]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (shop: Shop, body: Record<string, unknown>, key: string) => {
    setBusy(shop.id + ":" + key);
    setErr("");
    try {
      await adminPost("/api/admin/shops", { shopId: shop.id, ...body });
      await load();
      setConfirming(null);
      setConfirmText("");
      setNoting(null);
      setNoteText("");
    } catch (e: any) {
      setErr(e?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  // Approving needs no explanation; taking a shop dark does.
  const setStatus = (shop: Shop, status: Shop["status"], note?: string) =>
    act(shop, { action: "status", status, note: note || null }, status);

  return (
    <>
      <SectionHead
        title="Shops"
        sub="A shop is invisible to shoppers and cannot spend try-ons until it is approved."
        right={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            style={{ display: "flex", gap: 6 }}
          >
            <Field
              placeholder="Search name, slug, area…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 220 }}
            />
            <button className="ph-btn" type="submit" style={{ padding: "9px 14px", fontSize: 12, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}>
              Search
            </button>
          </form>
        }
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t || "all"}
            onClick={() => setTab(t)}
            className="ph-btn"
            style={{
              padding: "7px 13px",
              fontSize: 12,
              borderRadius: 999,
              border: "1px solid " + (tab === t ? "var(--forest-deep)" : "var(--line)"),
              color: tab === t ? "var(--forest-deep)" : "var(--mut)",
              background: tab === t ? "rgba(47,109,79,.07)" : "transparent",
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {err && (
        <div className="panel" style={{ padding: "12px 16px", marginBottom: 12, color: "#9b3232", fontSize: 13 }}>
          {err}
        </div>
      )}

      {shops === null ? (
        <Note>Loading…</Note>
      ) : shops.length === 0 ? (
        <Note>No shops here.</Note>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shops.map((s) => (
            <div key={s.id} className="panel" style={{ padding: "15px 17px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="ph-display" style={{ fontSize: 17, color: "var(--forest-deep)" }}>
                      {s.name || "(unnamed shop)"}
                    </span>
                    <Pill tone={TONE[s.status]}>{s.status}</Pill>
                    {s.listed && <Pill tone="mute">listed</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
                    /{s.slug} · {s.ownerEmail || "unknown owner"} {s.area ? "· " + s.area : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>
                    {s.garmentCount} garment{s.garmentCount === 1 ? "" : "s"} · plan{" "}
                    <b style={{ color: "var(--violet)" }}>{s.plan}</b> · {s.tryonsUsed} try-ons used this period
                  </div>
                  {s.statusNote && (
                    <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4, fontStyle: "italic" }}>
                      note: {s.statusNote}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--mut)", textAlign: "right", whiteSpace: "nowrap" }}>
                  joined {when(s.createdAt)}
                  {s.statusChangedAt && <div>changed {when(s.statusChangedAt)}</div>}
                </div>
              </div>

              {noting?.id === s.id && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    marginTop: 12,
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    background: "rgba(0,0,0,.03)",
                    borderRadius: "var(--radius-btn)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--mut)" }}>
                    Reason to {noting.status === "rejected" ? "reject" : "suspend"} (the vendor sees this):
                  </span>
                  <Field
                    autoFocus
                    maxLength={200}
                    placeholder="e.g. shop details could not be verified"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <Btn
                    busy={busy === s.id + ":" + noting.status || !noteText.trim()}
                    onClick={() => setStatus(s, noting.status, noteText)}
                  >
                    Confirm
                  </Btn>
                  <Btn onClick={() => { setNoting(null); setNoteText(""); }}>Cancel</Btn>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                {s.status !== "approved" && (
                  <Btn solid busy={busy === s.id + ":approved"} onClick={() => setStatus(s, "approved")}>
                    {s.status === "pending" ? "Approve" : "Restore"}
                  </Btn>
                )}
                {s.status === "approved" && (
                  <Btn onClick={() => { setNoting({ id: s.id, status: "suspended" }); setNoteText(""); }}>
                    Suspend
                  </Btn>
                )}
                {s.status === "pending" && (
                  <Btn onClick={() => { setNoting({ id: s.id, status: "rejected" }); setNoteText(""); }}>
                    Reject
                  </Btn>
                )}
                {s.listed && (
                  <Btn busy={busy === s.id + ":unlist"} onClick={() => act(s, { action: "unlist" }, "unlist")}>
                    Unlist
                  </Btn>
                )}
                <a
                  href={"/s/" + s.slug}
                  target="_blank"
                  rel="noreferrer"
                  className="ph-btn"
                  style={{ fontSize: 12, color: "var(--mut)", padding: "9px 6px" }}
                >
                  storefront ↗
                </a>

                <span style={{ flex: 1 }} />

                {confirming === s.id ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Field
                      autoFocus
                      placeholder={"type " + s.slug}
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      style={{ width: 150 }}
                    />
                    <Btn
                      danger
                      busy={busy === s.id + ":delete"}
                      onClick={() => act(s, { action: "delete", confirm: confirmText }, "delete")}
                    >
                      Delete forever
                    </Btn>
                    <Btn onClick={() => { setConfirming(null); setConfirmText(""); }}>Cancel</Btn>
                  </span>
                ) : (
                  <Btn danger onClick={() => setConfirming(s.id)}>
                    Delete
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Btn({
  children,
  onClick,
  busy,
  solid,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  solid?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={"ph-btn" + (solid ? " btn-solid" : "")}
      disabled={busy}
      onClick={onClick}
      style={{
        padding: "9px 14px",
        fontSize: 12,
        borderRadius: "var(--radius-btn)",
        ...(solid ? {} : { border: "1px solid var(--line)", color: danger ? "#9b3232" : "var(--mut)" }),
      }}
    >
      {busy ? "working…" : children}
    </button>
  );
}

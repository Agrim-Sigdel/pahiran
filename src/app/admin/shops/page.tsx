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
  planName: string | null;
  planStatus: "active" | "past_due" | "canceled";
  tryonsUsed: number;
  studioUsed: number;
  tryonLimit: number | null;
  studioLimit: number | null;
  maxGarments: number | null; // null = unlimited
  listedAllowed: boolean;
  periodEnd: string | null;
  type: "apparel" | "general";
  category: string;
  vendorCode: string | null;
  pinned: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  clothing: "Clothing & apparel",
  footwear: "Footwear",
  jewellery: "Jewellery & accessories",
  beauty: "Beauty & cosmetics",
  electronics: "Electronics",
  home: "Home & furniture",
  grocery: "Grocery & daily needs",
  sports: "Sports & outdoor",
  books: "Books & stationery",
  other: "Something else",
};

/** "240/300" with the limit, or a bare count when the plan is unknown. */
function usage(used: number, limit: number | null): string {
  return limit == null ? String(used) : `${used}/${limit}`;
}

/** Flags a shop that has burned most of its allowance, so it stands out. */
function short(used: number, limit: number | null): boolean {
  return limit != null && limit > 0 && used / limit >= 0.8;
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
  // Type / category live behind a Manage toggle — the row is dense enough.
  const [managing, setManaging] = useState<string | null>(null);
  const [typeNote, setTypeNote] = useState("");

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
                    {/* The single flag deciding whether this shop gets try-on
                        at all — worth a pill, not a buried field. */}
                    <Pill tone={s.type === "apparel" ? "good" : "mute"}>
                      {s.type === "apparel" ? "try-on" : "catalog only"}
                    </Pill>
                    {s.planStatus !== "active" && <Pill tone="bad">{s.planStatus}</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
                    /{s.slug} · {s.ownerEmail || "unknown owner"} {s.area ? "· " + s.area : ""}
                    {s.vendorCode ? " · " + s.vendorCode : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 3 }}>
                    {CATEGORY_LABEL[s.category] || s.category}
                    {s.whatsapp ? (
                      <> · <a href={"tel:" + s.whatsapp} style={{ color: "var(--violet)" }}>{s.whatsapp}</a></>
                    ) : (
                      <span style={{ color: "#9b3232" }}> · no phone number</span>
                    )}
                    {" · "}{s.pinned ? "pin placed" : "no map pin"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 4 }}>
                    {usage(s.garmentCount, s.maxGarments)} garment{s.garmentCount === 1 ? "" : "s"} · plan{" "}
                    <b style={{ color: "var(--violet)" }}>{s.planName || s.plan}</b> ·{" "}
                    <b style={{ color: short(s.tryonsUsed, s.tryonLimit) ? "#9b3232" : "inherit" }}>
                      {usage(s.tryonsUsed, s.tryonLimit)} try-ons
                    </b>
                    {" · "}
                    <span style={{ color: short(s.studioUsed, s.studioLimit) ? "#9b3232" : "inherit" }}>
                      {usage(s.studioUsed, s.studioLimit)} studio
                    </span>
                    {s.periodEnd && <> · renews {when(s.periodEnd)}</>}
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

              {managing === s.id && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(0,0,0,.03)", borderRadius: "var(--radius-btn)", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Category is descriptive and changes nothing else, so it
                      saves on pick. Try-on entitlement is a money question, so
                      it needs a reason and an explicit apply. */}
                  <label style={{ fontSize: 12, color: "var(--mut)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    Sells
                    <select
                      value={s.category}
                      disabled={busy === s.id + ":category"}
                      onChange={(e) => act(s, { action: "category", category: e.target.value }, "category")}
                      style={{ padding: "8px 10px", fontSize: 12, borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--cream)" }}
                    >
                      {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                    <span style={{ color: "var(--mut)" }}>descriptive only — does not change try-on</span>
                  </label>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--mut)" }}>
                      Try-on is <b>{s.type === "apparel" ? "on" : "off"}</b> — turn it{" "}
                      {s.type === "apparel" ? "off" : "on"}?
                    </span>
                    <Field
                      maxLength={200}
                      placeholder="reason (recorded in the audit trail)"
                      value={typeNote}
                      onChange={(e) => setTypeNote(e.target.value)}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <Btn
                      busy={busy === s.id + ":type" || !typeNote.trim()}
                      onClick={() => act(
                        s,
                        { action: "type", type: s.type === "apparel" ? "general" : "apparel", note: typeNote },
                        "type",
                      )}
                    >
                      Turn try-on {s.type === "apparel" ? "off" : "on"}
                    </Btn>
                  </div>

                  {!s.listedAllowed && (
                    <div style={{ fontSize: 12, color: "var(--mut)" }}>
                      The {s.plan} plan does not permit directory listing.
                    </div>
                  )}
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
                {s.listed ? (
                  <Btn busy={busy === s.id + ":unlist"} onClick={() => act(s, { action: "unlist" }, "unlist")}>
                    Unlist
                  </Btn>
                ) : (
                  /* Only offered when it could actually succeed — the server
                     enforces both conditions too, this just avoids a button
                     that always errors. */
                  s.status === "approved" && s.listedAllowed && (
                    <Btn busy={busy === s.id + ":list"} onClick={() => act(s, { action: "list" }, "list")}>
                      List
                    </Btn>
                  )
                )}
                <Btn onClick={() => { setManaging(managing === s.id ? null : s.id); setTypeNote(""); }}>
                  {managing === s.id ? "Close" : "Manage"}
                </Btn>
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

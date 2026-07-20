"use client";

import { useMemo, useState } from "react";
import { npr, waLink } from "@/lib/constants";
import Icon from "@/components/Icon";
import type { Garment, Lead, TryOnEvent } from "@/lib/types";

/* Vendor analytics, split into dashboard tabs:
   - OverviewTab: stat tiles, 30-day daily chart, most-tried table, CSV, errors
   - LeadsTab: "I want this" inbox with status chips + WhatsApp reply
   Aggregation happens here, client-side, from props. */

const DAY_MS = 24 * 3600 * 1000;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 24 * 60) return Math.round(mins / 60) + "h ago";
  return Math.round(mins / (24 * 60)) + "d ago";
}

export function garmentTryCounts(events: TryOnEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.garmentId) counts.set(e.garmentId, (counts.get(e.garmentId) || 0) + 1);
  }
  return counts;
}

/* ── Overview ─────────────────────────────────────────── */

export function OverviewTab({ events, catalog }: {
  events: TryOnEvent[]; catalog: Garment[];
}) {
  const byId = useMemo(() => new Map(catalog.map((g) => [g.id, g])), [catalog]);

  const { days, last30, week, sessions } = useMemo(() => {
    const now = Date.now();
    const cutoff30 = now - 30 * DAY_MS;
    const cutoff7 = now - 7 * DAY_MS;
    const last30 = events.filter((e) => new Date(e.createdAt).getTime() >= cutoff30);
    const counts = new Map<string, number>();
    for (const e of last30) counts.set(dayKey(e.createdAt), (counts.get(dayKey(e.createdAt)) || 0) + 1);
    const days: { key: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY_MS);
      const key = dayKey(d.toISOString());
      days.push({
        key,
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        count: counts.get(key) || 0,
      });
    }
    return {
      days,
      last30: last30.length,
      week: last30.filter((e) => new Date(e.createdAt).getTime() >= cutoff7).length,
      sessions: new Set(last30.map((e) => e.sessionId).filter(Boolean)).size,
    };
  }, [events]);

  const garmentRows = useMemo(() => {
    const cutoff7 = Date.now() - 7 * DAY_MS;
    const agg = new Map<string, { total: number; week: number; last: string }>();
    for (const e of events) {
      if (!e.garmentId) continue;
      const row = agg.get(e.garmentId) || { total: 0, week: 0, last: e.createdAt };
      row.total += 1;
      if (new Date(e.createdAt).getTime() >= cutoff7) row.week += 1;
      if (e.createdAt > row.last) row.last = e.createdAt;
      agg.set(e.garmentId, row);
    }
    return Array.from(agg, ([garmentId, r]) => ({ garmentId, garment: byId.get(garmentId), ...r }))
      .filter((r) => r.garment)
      .sort((a, b) => b.total - a.total);
  }, [events, byId]);

  const exportCsv = () => {
    const rows = [["date", "time", "garment", "cached", "session"]];
    for (const e of events) {
      const d = new Date(e.createdAt);
      rows.push([
        dayKey(e.createdAt),
        d.toTimeString().slice(0, 8),
        byId.get(e.garmentId || "")?.name || e.garmentId || "",
        String(e.cached),
        e.sessionId || "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => '"' + c.replaceAll('"', '""') + '"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "peeq-tryons.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (events.length === 0) {
    return (
      <div className="panel" style={{ color: "var(--mut)", fontSize: 14, lineHeight: 1.6 }}>
        <span className="panel-head" style={{ marginBottom: 6 }}><span className="title">Activity</span></span>
        No try-ons yet — once shoppers use your kiosk, daily activity and your most-tried
        pieces appear here.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatTile label="Try-ons · 30 days" value={last30} />
        <StatTile label="This week" value={week} />
        <StatTile label="Shoppers · 30 days" value={sessions} hint="unique kiosk sessions" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="title">Try-ons per day</span><span className="sub">last 30 days</span>
          <button className="ph-btn" onClick={exportCsv}
            style={{ marginLeft: "auto", color: "var(--mut)", fontSize: 11, letterSpacing: ".1em", padding: "5px 10px", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}>
            Export CSV
          </button>
        </div>
        <DailyBars days={days} />
      </div>

      {garmentRows.length > 0 && (
        <div className="panel" style={{ overflowX: "auto" }}>
          <div className="panel-head"><span className="title">Most-tried items</span><span className="sub">last 90 days</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
            <thead>
              <tr>
                {["Garment", "Tries", "This week", "Last tried"].map((h, i) => (
                  <th key={h} style={{ color: "var(--mut)", fontSize: 10, letterSpacing: ".12em", textAlign: i ? "right" : "left", padding: "6px 8px 10px", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {garmentRows.slice(0, 10).map((r) => (
                <tr key={r.garmentId}>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src={r.garment!.image} alt="" style={{ width: 28, height: 36, objectFit: "cover", borderRadius: 3 }} />
                      <span style={{ fontWeight: 500 }}>{r.garment!.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right", fontWeight: 600, color: "var(--camel)" }}>{r.total}</td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right" }}>{r.week}</td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right", color: "var(--mut)" }}>{timeAgo(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div style={{ background: "var(--cream)", border: "1px solid " + (accent ? "var(--camel)" : "var(--line)"), borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: "var(--mut)", fontWeight: 500, letterSpacing: ".12em" }}>{label}</div>
      <div className="ph-display" style={{ fontSize: 34, marginTop: 2, color: accent ? "var(--camel)" : "var(--forest-deep)" }}>
        {value.toLocaleString("en-IN")}
      </div>
      {hint && <div style={{ fontSize: 11, color: "var(--mut)" }}>{hint}</div>}
    </div>
  );
}

/* Single-series bars in the brand green, per-bar hover tooltip. */
function DailyBars({ days }: { days: { key: string; label: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110, position: "relative" }}>
        {days.map((d, i) => (
          <div key={d.key}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", position: "relative", cursor: "default" }}>
            <div style={{
              width: "100%",
              height: Math.max(d.count === 0 ? 2 : 6, (d.count / max) * 100) + "%",
              background: d.count === 0 ? "var(--line)" : hover === i ? "var(--camel)" : "var(--forest)",
              opacity: d.count === 0 ? 1 : 0.85,
              borderRadius: "2px 2px 0 0",
              transition: "background .15s",
            }} />
            {hover === i && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                background: "var(--forest-deep)", color: "var(--cream)", fontSize: 11, fontWeight: 500, padding: "4px 9px",
                borderRadius: 4, whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
              }}>
                {d.label} · {d.count} tr{d.count === 1 ? "y" : "ies"}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mut)", marginTop: 6 }}>
        <span>{days[0]?.label}</span>
        <span>peak {days.every((d) => d.count === 0) ? 0 : max}/day</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/* ── Leads ────────────────────────────────────────────── */

export function LeadsTab({ leads, catalog, onLeadHandled, shopName }: {
  leads: Lead[]; catalog: Garment[]; onLeadHandled: (id: string, handled: boolean) => void;
  shopName?: string;
}) {
  const byId = useMemo(() => new Map(catalog.map((g) => [g.id, g])), [catalog]);
  const open = leads.filter((l) => !l.handled);
  const sorted = [...open, ...leads.filter((l) => l.handled)];

  if (leads.length === 0) {
    return (
      <div className="panel" style={{ color: "var(--mut)", fontSize: 14, lineHeight: 1.6 }}>
        No leads yet — when a shopper taps "I want this" after a try-on, it lands here
        with their size and (optional) contact details.
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="title">Leads</span>
        <span className="sub">shoppers who tapped "I want this" · newest first</span>
      </div>
      <div>
        {sorted.slice(0, 50).map((l, i) => {
          const g = byId.get(l.garmentId || "");
          const wa = l.phone
            ? waLink(l.phone, `Namaste${l.name ? " " + l.name : ""}! This is ${shopName || "the shop"} — about the ${g?.name || "garment"} you tried on with peeq. It's ready for you!`)
            : null;
          return (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none", opacity: l.handled ? 0.5 : 1, flexWrap: "wrap" }}>
              {g && <img src={g.image} alt="" style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {g?.name || "Removed garment"}
                  {l.size && <span style={{ color: "var(--camel)", marginLeft: 8, fontWeight: 600 }}>size {l.size}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 1 }}>
                  {[l.name, l.phone].filter(Boolean).join(" · ") || "anonymous shopper"} · {timeAgo(l.createdAt)}
                  {g && <b style={{ color: "var(--forest)", marginLeft: 8 }}>{npr(g.price)}</b>}
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  background: l.handled ? "transparent" : "var(--butter)",
                  color: l.handled ? "var(--stone)" : "var(--ink)",
                  border: l.handled ? "1px solid var(--line)" : "none",
                }}>
                  {l.handled ? "done" : "new"}
                </span>
                {!l.handled && wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="ph-btn"
                    style={{ fontSize: 11, letterSpacing: ".08em", padding: "7px 12px", border: "1px solid var(--whatsapp)", color: "var(--whatsapp)", borderRadius: "var(--radius-btn)", fontWeight: 500, textDecoration: "none" }}>
                    WhatsApp
                  </a>
                )}
                <button className="ph-btn" onClick={() => onLeadHandled(l.id, !l.handled)}
                  style={{ fontSize: 11, letterSpacing: ".08em", padding: "7px 12px", border: "1px solid var(--forest)", color: "var(--forest)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
                  {l.handled ? "Reopen" : <>Done <Icon name="check" /></>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

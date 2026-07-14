"use client";

import { useMemo, useState } from "react";
import { npr } from "@/lib/constants";
import type { ErrorLog, Garment, Lead, TryOnEvent } from "@/lib/types";

/* Vendor activity panel: stat tiles, 30-day try-on chart, leads inbox,
   per-garment history table, CSV export, error log. All data arrives
   as props; aggregation happens here, client-side. */

interface ActivityProps {
  events: TryOnEvent[];
  catalog: Garment[];
  leads: Lead[];
  errors: ErrorLog[];
  onLeadHandled: (id: string, handled: boolean) => void;
}

const DAY_MS = 24 * 3600 * 1000;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 24 * 60) return Math.round(mins / 60) + "h ago";
  return Math.round(mins / (24 * 60)) + "d ago";
}

export default function Activity({ events, catalog, leads, errors, onLeadHandled }: ActivityProps) {
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

  const openLeads = leads.filter((l) => !l.handled);

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
    a.download = "pahiran-tryons.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (events.length === 0 && leads.length === 0) {
    return (
      <div style={{ margin: "26px 0 0", padding: "22px 24px", background: "#fff", border: "1px solid var(--line)", borderRadius: 16, color: "var(--mut)", fontSize: 14 }}>
        <span className="ph-display" style={{ fontSize: 19, color: "var(--ink)", marginRight: 10 }}>Activity</span>
        No try-ons yet — once shoppers use your kiosk, daily activity, most-tried
        pieces and "I want this" leads appear here.
      </div>
    );
  }

  return (
    <div style={{ margin: "26px 0 0", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <StatTile label="Try-ons · 30 days" value={last30} />
        <StatTile label="This week" value={week} />
        <StatTile label="Shoppers · 30 days" value={sessions} hint="unique kiosk sessions" />
        <StatTile label="Open leads" value={openLeads.length} accent={openLeads.length > 0} />
      </div>

      {/* daily chart */}
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 20px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <span className="ph-display" style={{ fontSize: 19 }}>Try-ons per day</span>
            <span style={{ fontSize: 12, color: "var(--mut)", marginLeft: 10 }}>last 30 days</span>
          </div>
          <button className="ph-btn" onClick={exportCsv}
            style={{ background: "transparent", color: "var(--mut)", fontSize: 12, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 8 }}>
            Export CSV
          </button>
        </div>
        <DailyBars days={days} />
      </div>

      {/* leads inbox */}
      {leads.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span className="ph-display" style={{ fontSize: 19 }}>Leads</span>
            <span style={{ fontSize: 12, color: "var(--mut)" }}>
              shoppers who tapped "I want this"{openLeads.length > 0 ? ` · ${openLeads.length} open` : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...openLeads, ...leads.filter((l) => l.handled)].slice(0, 20).map((l) => {
              const g = byId.get(l.garmentId || "");
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: l.handled ? 0.55 : 1 }}>
                  {g && <img src={g.image} alt="" style={{ width: 34, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g?.name || "Removed garment"}
                      {l.size && <span style={{ color: "var(--rani)", marginLeft: 8 }}>size {l.size}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--mut)" }}>
                      {[l.name, l.phone].filter(Boolean).join(" · ") || "anonymous shopper"} · {timeAgo(l.createdAt)}
                      {g && <span style={{ marginLeft: 8, color: "var(--rani)", fontWeight: 600 }}>{npr(g.price)}</span>}
                    </div>
                  </div>
                  <button className="ph-btn" onClick={() => onLeadHandled(l.id, !l.handled)}
                    style={{ background: l.handled ? "transparent" : "var(--ink)", color: l.handled ? "var(--mut)" : "#fff", fontSize: 12, padding: "7px 12px", flexShrink: 0, border: l.handled ? "1px solid var(--line)" : "none" }}>
                    {l.handled ? "Reopen" : "Done ✓"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* per-garment history table */}
      {garmentRows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 20px", overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span className="ph-display" style={{ fontSize: 19 }}>Most-tried items</span>
            <span style={{ fontSize: 12, color: "var(--mut)" }}>last 90 days</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--mut)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "left" }}>
                <th style={{ padding: "6px 8px 10px", fontWeight: 600 }}>Garment</th>
                <th style={{ padding: "6px 8px 10px", fontWeight: 600, textAlign: "right" }}>Tries</th>
                <th style={{ padding: "6px 8px 10px", fontWeight: 600, textAlign: "right" }}>This week</th>
                <th style={{ padding: "6px 8px 10px", fontWeight: 600, textAlign: "right" }}>Last tried</th>
              </tr>
            </thead>
            <tbody>
              {garmentRows.slice(0, 10).map((r) => (
                <tr key={r.garmentId} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src={r.garment!.image} alt="" style={{ width: 28, height: 36, objectFit: "cover", borderRadius: 5 }} />
                      <span style={{ fontWeight: 600 }}>{r.garment!.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "var(--rani)" }}>{r.total}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{r.week}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: "var(--mut)" }}>{timeAgo(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* error log */}
      {errors.length > 0 && (
        <details style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "14px 20px" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--mut)", fontWeight: 600 }}>
            ⚠ {errors.length} recent error{errors.length !== 1 ? "s" : ""} — tap to view
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {errors.map((e) => (
              <div key={e.id} style={{ fontSize: 12, color: "var(--mut)", fontFamily: "monospace" }}>
                <span style={{ color: "var(--rani)", fontWeight: 700 }}>[{e.source}]</span> {e.message}
                <span style={{ marginLeft: 8 }}>{timeAgo(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid " + (accent ? "var(--rani)" : "var(--line)"), borderRadius: 16, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--mut)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</div>
      <div className="ph-display" style={{ fontSize: 30, marginTop: 2, color: accent ? "var(--rani)" : "var(--ink)" }}>
        {value.toLocaleString("en-IN")}
      </div>
      {hint && <div style={{ fontSize: 11, color: "var(--mut)" }}>{hint}</div>}
    </div>
  );
}

/* Single-series bar chart: brand rani on cream track (validated ≥3:1 on the
   light surface), 2px gaps, rounded data-ends, per-bar hover tooltip. */
function DailyBars({ days }: { days: { key: string; label: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, position: "relative" }}>
        {days.map((d, i) => (
          <div key={d.key}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", position: "relative", cursor: "default" }}>
            <div style={{
              width: "100%",
              height: Math.max(d.count === 0 ? 2 : 6, (d.count / max) * 100) + "%",
              background: d.count === 0 ? "var(--line)" : hover === i ? "var(--rani-soft)" : "var(--rani)",
              borderRadius: "4px 4px 0 0",
              transition: "background .15s",
            }} />
            {hover === i && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                background: "var(--ink)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 9px",
                borderRadius: 7, whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
              }}>
                {d.label} · {d.count} tr{d.count === 1 ? "y" : "ies"}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mut)", marginTop: 6 }}>
        <span>{days[0]?.label}</span>
        <span>peak {max === 1 && days.every((d) => d.count === 0) ? 0 : max}/day</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}

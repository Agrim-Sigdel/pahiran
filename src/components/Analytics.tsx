"use client";

import { useEffect, useMemo, useState } from "react";
import { npr, waLink } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Icon from "@/components/Icon";
import type { Garment, Lead, TryOnEvent } from "@/lib/types";

/* Vendor analytics, split into dashboard tabs:
   - OverviewTab: stat tiles, 30-day daily chart, most-tried table, CSV, errors
   - LeadsTab: the orders inbox — bag checkouts regrouped into one card per
     order, plus lone kiosk "I want this" leads, with call/WhatsApp reply
   Aggregation happens here, client-side, from props. */

const DAY_MS = 24 * 3600 * 1000;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 24 * 60) return Math.round(mins / 60) + "h ago";
  return Math.round(mins / (24 * 60)) + "d ago";
}

/* timeAgo was computed at render off Date.now(), so a dashboard left open on
   the counter all day kept saying "2m ago" about an order placed at nine in
   the morning. This ticks once a minute and re-renders whoever uses it. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return now;
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

  /* Actually the last 90 days. The heading said so while the aggregation ran
     over every event ever recorded with no cutoff at all, so a shop's oldest
     bestseller outranked what shoppers are trying this month — on the table a
     vendor uses to decide what to restock. */
  const garmentRows = useMemo(() => {
    const cutoff7 = Date.now() - 7 * DAY_MS;
    const cutoff90 = Date.now() - 90 * DAY_MS;
    const agg = new Map<string, { total: number; week: number; last: string }>();
    for (const e of events) {
      if (!e.garmentId) continue;
      if (new Date(e.createdAt).getTime() < cutoff90) continue;
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
      <div className="panel" style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6 }}>
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
            style={{ marginLeft: "auto", color: "var(--stone)", fontSize: 11, letterSpacing: ".1em", padding: "5px 10px", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}>
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
                  <th key={h} scope="col" style={{ color: "var(--stone)", fontSize: 12, letterSpacing: ".06em", textAlign: i ? "right" : "left", padding: "6px 8px 10px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {garmentRows.slice(0, 10).map((r) => (
                <tr key={r.garmentId}>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img src={r.garment!.image} alt="" style={{ width: 28, height: 36, objectFit: "cover", borderRadius: "var(--radius-xs)" }} />
                      <span style={{ fontWeight: 500 }}>{r.garment!.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>{r.total}</td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right" }}>{r.week}</td>
                  <td style={{ padding: "9px 8px", borderTop: "1px solid var(--line)", textAlign: "right", color: "var(--stone)" }}>{timeAgo(r.last)}</td>
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
    <div style={{ background: "var(--card)", border: "1px solid " + (accent ? "var(--stone)" : "var(--line)"), borderRadius: "var(--radius-card)", padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: "var(--stone)", fontWeight: 600, letterSpacing: ".06em" }}>{label}</div>
      <div className="ph-display" style={{ fontSize: 34, marginTop: 2, color: accent ? "var(--stone)" : "var(--ink)" }}>
        {value.toLocaleString("en-IN")}
      </div>
      {hint && <div style={{ fontSize: 12, color: "var(--stone)" }}>{hint}</div>}
    </div>
  );
}

/* Single-series daily bars.

   The old version put every value in a :hover tooltip and nothing else — no
   axis, no gridlines, no labels, no touch handler and no accessible
   equivalent. On a phone, which is where the marketing says vendors run this,
   the chart was thirty coloured rectangles carrying no numbers at all.

   Four changes: the bars are buttons (so a tap on a phone and a Tab on a
   keyboard both reach them), there is a y-axis with a midpoint gridline, the
   selected day's number is printed under the chart rather than floated over
   it, and the same data is available as a real table underneath. */
function DailyBars({ days }: { days: { key: string; label: string; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.count));
  const shown = active == null ? days[days.length - 1] : days[active];
  const total = days.reduce((n, d) => n + d.count, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {/* y-axis: two numbers is enough to make the bars mean something */}
        <div aria-hidden style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: 110, fontSize: 11, color: "var(--stone)", flexShrink: 0, textAlign: "right", minWidth: 18 }}>
          <span>{max}</span>
          <span>0</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {/* midpoint gridline, behind the bars */}
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 55, borderTop: "1px dashed var(--line)" }} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 110, position: "relative" }}>
            {days.map((d, i) => (
              /* A real button: the hover state was the only way to read a
                 value, which on a touchscreen is no way at all. */
              <button key={d.key} className="ph-btn"
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${d.label}: ${d.count} try-on${d.count === 1 ? "" : "s"}`}
                aria-pressed={active === i}
                style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", padding: 0, minWidth: 0, borderRadius: 0 }}>
                <span style={{
                  width: "100%",
                  height: Math.max(d.count === 0 ? 2 : 6, (d.count / max) * 100) + "%",
                  /* Selected is DARKER, not lighter. It used to go --ink
                     (near-black) → --stone (body-text grey), so highlighting a
                     bar read as disabling it. */
                  background: d.count === 0 ? "var(--line)" : active === i ? "var(--violet)" : "var(--ink)",
                  opacity: d.count === 0 ? 1 : active === i ? 1 : 0.72,
                  borderRadius: "2px 2px 0 0",
                  transition: "background .15s, opacity .15s",
                  display: "block",
                }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "var(--stone)", marginTop: 6, flexWrap: "wrap" }}>
        <span>{days[0]?.label}</span>
        <span>peak {days.every((d) => d.count === 0) ? 0 : max}/day · {total} total</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>

      {/* the value, in text, where a phone can read it */}
      <div aria-live="polite" style={{ marginTop: 8, fontSize: 13.5, color: "var(--ink)" }}>
        <b>{shown?.label}</b>{" · "}
        <span style={{ color: "var(--stone)" }}>{shown?.count ?? 0} try-on{(shown?.count ?? 0) === 1 ? "" : "s"}</span>
        {active != null && (
          <button className="ph-btn" onClick={() => setActive(null)}
            style={{ marginLeft: 10, fontSize: 12, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
            latest
          </button>
        )}
      </div>

      <button className="ph-btn" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}
        style={{ marginTop: 8, fontSize: 12, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
        {showTable ? "hide the numbers" : "show the numbers"}
      </button>
      {showTable && (
        <div className="scroll-x" style={{ marginTop: 8 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 320 }}>
            <caption className="sr-only">Try-ons per day over the last 30 days</caption>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", padding: "4px 8px", color: "var(--stone)", fontWeight: 600 }}>Day</th>
                <th scope="col" style={{ textAlign: "right", padding: "4px 8px", color: "var(--stone)", fontWeight: 600 }}>Try-ons</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key}>
                  <th scope="row" style={{ textAlign: "left", padding: "4px 8px", borderTop: "1px solid var(--line)", fontWeight: 400 }}>{d.label}</th>
                  <td style={{ textAlign: "right", padding: "4px 8px", borderTop: "1px solid var(--line)" }}>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Leads ────────────────────────────────────────────── */

export interface LeadOrder {
  key: string;
  ref: string | null;
  lines: Lead[];
  name: string;
  phone: string;
  kind: "order" | "enquiry";
  createdAt: string;
  handled: boolean; // every line dealt with
}

/** A bag checkout writes one lead row per line, all sharing an orderRef. The
    inbox is about orders, not rows, so put them back together. Kiosk leads
    have no ref and stay one-line orders of their own. */
export function groupLeads(leads: Lead[]): LeadOrder[] {
  const orders = new Map<string, LeadOrder>();
  for (const l of leads) {
    const key = l.orderRef ? "ref:" + l.orderRef : "solo:" + l.id;
    const o = orders.get(key);
    if (o) {
      o.lines.push(l);
      o.handled = o.handled && l.handled;
      // the whole bag lands at once, but keep the earliest stamp as the order's
      if (l.createdAt < o.createdAt) o.createdAt = l.createdAt;
    } else {
      orders.set(key, {
        key, ref: l.orderRef, lines: [l], name: l.name, phone: l.phone,
        kind: l.kind, createdAt: l.createdAt, handled: l.handled,
      });
    }
  }
  return Array.from(orders.values()).sort((a, b) => {
    if (a.handled !== b.handled) return a.handled ? 1 : -1; // open first
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** What one piece cost when it was ordered. Falls back to the catalog for
    rows written before orders snapshotted their price — a vendor who edits a
    price today must not silently restate what an old order was worth. */
function linePrice(lead: Lead, garment?: Garment): number {
  return lead.unitPrice ?? garment?.price ?? 0;
}

const PAGE = 25;

export function LeadsTab({ leads, catalog, onLeadHandled, shopName }: {
  leads: Lead[]; catalog: Garment[]; onLeadHandled: (id: string, handled: boolean) => void;
  shopName?: string;
}) {
  const byId = useMemo(() => new Map(catalog.map((g) => [g.id, g])), [catalog]);
  const all = useMemo(() => groupLeads(leads), [leads]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [limit, setLimit] = useState(PAGE);
  const now = useNow();

  /* Search, a status filter and paging. There were none: the inbox rendered
     `orders.slice(0, 50)` with no count, no pagination and no "showing 50 of
     N", so the fifty-first order a shop ever took simply stopped existing as
     far as the dashboard was concerned. */
  const orders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((o) => {
      if (status === "open" && o.handled) return false;
      if (status === "done" && !o.handled) return false;
      if (!q) return true;
      if (o.name.toLowerCase().includes(q)) return true;
      if (o.phone.toLowerCase().includes(q)) return true;
      if ((o.ref ?? "").toLowerCase().includes(q)) return true;
      return o.lines.some((l) => (byId.get(l.garmentId || "")?.name ?? "").toLowerCase().includes(q));
    });
  }, [all, query, status, byId]);

  const openCount = all.filter((o) => !o.handled).length;

  const exportOrders = () => {
    const rows = [["date", "ref", "kind", "name", "phone", "garment", "size", "qty", "unit_price_npr", "handled"]];
    for (const o of orders) {
      for (const l of o.lines) {
        rows.push([
          formatDate(o.createdAt), o.ref ?? "", o.kind, o.name, o.phone,
          byId.get(l.garmentId || "")?.name ?? "", l.size ?? "", String(l.qty),
          String(linePrice(l, byId.get(l.garmentId || ""))), String(l.handled),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => '"' + c.replaceAll('"', '""') + '"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "peeq-orders.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (leads.length === 0) {
    return (
      <div className="panel" style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6 }}>
        No orders yet — when a shopper checks out from your storefront bag, or taps
        &ldquo;I want this&rdquo; after a try-on, it lands here with their name, phone and sizes.
      </div>
    );
  }

  const shown = orders.slice(0, limit);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="title">Orders</span>
        <span className="sub">
          {openCount > 0 ? `${openCount} to call back · ` : ""}{all.length} total · newest first
        </span>
        {/* try-ons had a CSV export and orders — the thing a shop actually
            needs to reconcile against its books — had none */}
        <button className="ph-btn" onClick={exportOrders}
          style={{ marginLeft: "auto", color: "var(--stone)", fontSize: 12, letterSpacing: ".06em", padding: "6px 12px", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)" }}>
          Export CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="sr-only">Search orders by name, phone, order ref or piece</span>
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="name, phone, PQ-…, or a piece"
            style={{ padding: "10px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13.5, width: "100%" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setLimit(PAGE); }}
            style={{ padding: "10px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13.5 }}>
            <option value="all">All orders</option>
            <option value="open">To call back</option>
            <option value="done">Done</option>
          </select>
        </label>
      </div>

      <div aria-live="polite" style={{ fontSize: 12.5, color: "var(--stone)", marginBottom: 10 }}>
        Showing {shown.length} of {orders.length}{orders.length !== all.length ? ` (filtered from ${all.length})` : ""}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((o) => (
          <OrderCard key={o.key} order={o} byId={byId} shopName={shopName} onLeadHandled={onLeadHandled} now={now} />
        ))}
        {shown.length === 0 && (
          <div style={{ color: "var(--stone)", fontSize: 13.5, padding: "20px 0", textAlign: "center" }}>
            Nothing matches that.
          </div>
        )}
      </div>

      {limit < orders.length && (
        <button className="ph-btn btn-solid" onClick={() => setLimit((n) => n + PAGE)}
          style={{ marginTop: 14, padding: "10px 22px", fontSize: 13 }}>
          show {Math.min(PAGE, orders.length - limit)} more
        </button>
      )}
    </div>
  );
}

function OrderCard({ order, byId, shopName, onLeadHandled, now }: {
  order: LeadOrder; byId: Map<string, Garment>; shopName?: string;
  onLeadHandled: (id: string, handled: boolean) => void;
  now: number;
}) {
  const items = order.lines.map((l) => ({ lead: l, garment: byId.get(l.garmentId || "") }));
  const pieces = order.lines.reduce((n, l) => n + l.qty, 0);
  /* Only priced pieces count: a removed garment with no snapshot has no price
     to add, and inventing one would misstate what the vendor is owed. */
  const total = items.reduce((n, it) => n + linePrice(it.lead, it.garment) * it.lead.qty, 0);
  const missing = items.some((it) => !it.garment && it.lead.unitPrice === null);

  const summary = items
    .map((it) => `${it.lead.qty}× ${it.garment?.name || "a piece"}${it.lead.size ? ` (size ${it.lead.size})` : ""}`)
    .join(", ");
  const wa = order.phone
    ? waLink(order.phone, `Namaste${order.name ? " " + order.name : ""}! This is ${shopName || "the shop"} — about your peeq order${order.ref ? " " + order.ref : ""}: ${summary}. It's ready for you!`)
    : null;

  /* One button, whole order: the vendor deals with a shopper, not with rows. */
  const setHandled = (handled: boolean) => {
    for (const l of order.lines) if (l.handled !== handled) onLeadHandled(l.id, handled);
  };

  return (
    /* A handled order used to sit at opacity .55 — including the phone
       number, which is the one thing a vendor comes back to a closed order
       for. It recedes by going onto the well surface instead, and everything
       on it stays readable. */
    <div className={order.handled ? "done-row" : undefined}
      style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {order.name || "anonymous shopper"}
            {/* --on-light on butter, never --ink.

                --butter is one of the fills that stays LIGHT in both themes,
                so the text on it must stay dark in both — which is exactly
                what --on-light is for. This pill took --ink, and --ink
                inverts to near-white on a dark page, so in dark mode the word
                "ORDER" was white on pale yellow and effectively gone.

                The enquiry pill had the mirror problem in LIGHT mode: green
                text on a white card is ~2:1. The green now identifies the
                channel from the border and a dot, and the word itself is read
                in ink. */}
            {order.kind === "enquiry" ? (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                padding: "3px 9px", borderRadius: "var(--radius-pill)",
                display: "inline-flex", alignItems: "center", gap: 6,
                color: "var(--ink)", border: "1px solid var(--whatsapp)",
              }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "var(--radius-pill)", background: "var(--whatsapp)", flexShrink: 0 }} />
                WhatsApp enquiry
              </span>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                padding: "3px 9px", borderRadius: "var(--radius-pill)",
                background: "var(--butter)", color: "var(--on-light)",
              }}>
                order
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 2 }}>
            {order.phone || "no number"} · {timeAgo(order.createdAt, now)}
            {order.ref && <span style={{ marginLeft: 8, fontFamily: "ui-monospace, monospace" }}>{order.ref}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{npr(total)}{missing && "+"}</div>
          <div style={{ fontSize: 12, color: "var(--stone)" }}>{pieces} piece{pieces !== 1 ? "s" : ""}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0 0" }}>
        {items.map(({ lead, garment }) => (
          <div key={lead.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {garment
              ? <img src={garment.image} alt="" style={{ width: 34, height: 44, objectFit: "cover", borderRadius: "var(--radius-xs)", flexShrink: 0 }} />
              : <div style={{ width: 34, height: 44, borderRadius: "var(--radius-xs)", background: "var(--line)", flexShrink: 0 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b style={{ color: "var(--stone)" }}>{lead.qty}×</b> {garment?.name || "Removed garment"}
                {lead.size && <span style={{ color: "var(--ink)", marginLeft: 6, fontWeight: 700 }}>size {lead.size}</span>}
              </div>
            </div>
            {linePrice(lead, garment) > 0 && (
              <div style={{ fontSize: 12.5, color: "var(--stone)", flexShrink: 0 }}>{npr(linePrice(lead, garment) * lead.qty)}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
        {order.phone && (
          <a href={"tel:" + order.phone} className="ph-btn"
            style={{ fontSize: 12, letterSpacing: ".06em", padding: "9px 14px", border: "1px solid var(--line-strong)", color: "var(--ink)", borderRadius: "var(--radius-btn)", fontWeight: 600, textDecoration: "none" }}>
            <Icon name="phone" /> Call
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="ph-btn"
            style={{ fontSize: 12, letterSpacing: ".06em", padding: "9px 14px", border: "1px solid var(--whatsapp)", color: "var(--whatsapp)", borderRadius: "var(--radius-btn)", fontWeight: 600, textDecoration: "none" }}>
            WhatsApp
          </a>
        )}
        {/* Done and Reopen were the same outlined pill in the same colour, so
            the only way to tell an order's state was to read the word — on a
            card that was already dimmed. Done is a filled affirmative; Reopen
            is a quiet undo. */}
        <button className="ph-btn" onClick={() => setHandled(!order.handled)}
          aria-pressed={order.handled}
          style={order.handled
            ? { fontSize: 12, letterSpacing: ".06em", padding: "9px 14px", border: "1px solid var(--line-strong)", color: "var(--stone)", borderRadius: "var(--radius-btn)", fontWeight: 600 }
            : { fontSize: 12, letterSpacing: ".06em", padding: "9px 14px", background: "var(--ok)", color: "var(--on-accent)", borderRadius: "var(--radius-btn)", fontWeight: 700 }}>
          {order.handled ? "Reopen" : <>Done <Icon name="check" /></>}
        </button>
      </div>
    </div>
  );
}

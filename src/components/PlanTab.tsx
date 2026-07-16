"use client";

import { useEffect, useState } from "react";
import { npr } from "@/lib/constants";
import { getPlans, getSubscription } from "@/lib/storage";
import { submitBillingRequest, ADMIN_EMAIL } from "@/lib/billing-client";
import type { PlanInfo, Shop, Subscription } from "@/lib/types";

/* Plan & usage tab: current plan, this period's usage meters, and an upgrade
   grid. Billing is manual for now — vendors request an upgrade or a credit
   top-up (logged + emailed to the admin), who tops them up by hand. */

export default function PlanTab({ shop }: { shop: Shop }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([getSubscription(shop.id), getPlans()]);
      setSub(s);
      setPlans(p);
      setLoading(false);
    })();
  }, [shop.id]);

  if (loading) {
    return <div className="panel"><div style={{ color: "var(--mut)", padding: 24 }}>Loading your plan…</div></div>;
  }

  // Local mode (no Supabase) has no plans/metering.
  if (!sub) {
    return (
      <div className="panel">
        <div className="panel-head"><span className="title">Plan &amp; usage</span></div>
        <p style={{ color: "var(--mut)", fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
          Plans and try-on limits apply once this shop runs in cloud mode (Supabase connected and
          deployed). In local mode there are no limits — everything is on this device.
        </p>
      </div>
    );
  }

  const requestPlan = async (plan: PlanInfo) => {
    setBusy("plan:" + plan.id);
    try {
      await submitBillingRequest({
        shop: { id: shop.id, name: shop.name, slug: shop.slug },
        kind: "plan",
        plan: { id: plan.id, name: plan.name, priceNpr: plan.priceNpr },
      });
      setNotice(`Upgrade request sent for ${plan.name}. We'll be in touch to set it up.`);
    } finally {
      setBusy(null);
    }
  };

  const requestCredits = async () => {
    setBusy("credits");
    try {
      await submitBillingRequest({
        shop: { id: shop.id, name: shop.name, slug: shop.slug },
        kind: "credits",
        currentPlanName: sub.plan.name,
      });
      setNotice("Credit top-up request sent. We'll top you up shortly.");
    } finally {
      setBusy(null);
    }
  };

  const reset = new Date(sub.periodEnd);
  const resetLabel = reset.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {notice && (
        <div style={{ background: "var(--sage)", border: "1px solid var(--forest)", borderRadius: "var(--radius-card)", padding: "12px 16px", fontSize: 13.5, color: "var(--forest-deep)" }}>
          {notice} <span style={{ color: "var(--mut)" }}>Didn't see an email open? Write to {ADMIN_EMAIL}.</span>
        </div>
      )}

      {/* current plan + usage */}
      <div className="panel">
        <div className="panel-head" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span className="title">Current plan · {sub.plan.name}</span>
          <span style={{ fontSize: 12.5, color: "var(--mut)" }}>
            {sub.status !== "active" ? <b style={{ color: "var(--camel)" }}>{sub.status} · </b> : null}
            resets {resetLabel}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 4 }}>
          <Meter label="Try-ons this period" used={sub.tryonsUsed} limit={sub.plan.tryonLimit} />
          <Meter label="Studio finishes" used={sub.studioUsed} limit={sub.plan.studioLimit} />
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="ph-btn" disabled={!!busy} onClick={requestCredits}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "9px 16px", fontSize: 12.5, color: "var(--forest-deep)", fontWeight: 500, opacity: busy ? 0.6 : 1 }}>
            {busy === "credits" ? "requesting…" : "Request a credit top-up"}
          </button>
        </div>
      </div>

      {/* upgrade grid */}
      <div className="panel">
        <div className="panel-head"><span className="title">Plans</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {plans.map((p) => {
            const current = p.id === sub.planId;
            const canRequest = p.priceNpr > 0 && p.sort > sub.plan.sort;
            return (
              <div key={p.id} style={{
                border: "1px solid " + (current ? "var(--forest)" : "var(--line)"),
                borderRadius: "var(--radius-card)", padding: "18px 16px", background: current ? "var(--sage)" : "var(--cream)",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span className="ph-display" style={{ fontSize: 18, color: "var(--forest-deep)" }}>{p.name}</span>
                  {current && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", color: "var(--forest)", textTransform: "uppercase" }}>current</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
                  {p.priceNpr > 0 ? npr(p.priceNpr) : p.id === "free" ? "Free" : "Custom"}
                  {p.priceNpr > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--mut)" }}> /mo</span>}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 8px", fontSize: 13, color: "var(--mut)", lineHeight: 1.9 }}>
                  <li>{p.tryonLimit.toLocaleString("en-IN")} try-ons / month</li>
                  <li>{p.studioLimit.toLocaleString("en-IN")} studio finishes</li>
                  <li>{p.maxGarments == null ? "Unlimited garments" : p.maxGarments + " garments"}</li>
                </ul>
                {canRequest ? (
                  <button className="ph-btn btn-solid" disabled={!!busy} onClick={() => requestPlan(p)}
                    style={{ marginTop: "auto", padding: "9px 12px", fontSize: 12, opacity: busy ? 0.6 : 1 }}>
                    {busy === "plan:" + p.id ? "requesting…" : "Request " + p.name}
                  </button>
                ) : p.priceNpr === 0 && p.id !== "free" ? (
                  <div style={{ marginTop: "auto", fontSize: 12.5, color: "var(--mut)" }}>Contact us to set up.</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: "var(--mut)", marginTop: 14, lineHeight: 1.6 }}>
          A studio finish uses one try-on and one studio slot. Cached repeats are free. Requesting an
          upgrade or top-up emails us — we'll set you up and start a fresh 30-day period.
        </p>
      </div>
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const left = Math.max(0, limit - used);
  const low = left <= Math.max(1, Math.round(limit * 0.1));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--ink)" }}>{label}</span>
        <span style={{ fontSize: 12.5, color: low ? "var(--camel)" : "var(--mut)", fontWeight: low ? 600 : 400 }}>
          {left.toLocaleString("en-IN")} left
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: low ? "var(--camel)" : "var(--forest)", transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 4 }}>
        {used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")} used
      </div>
    </div>
  );
}

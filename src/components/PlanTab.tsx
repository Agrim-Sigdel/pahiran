"use client";

import { useEffect, useState } from "react";
import { npr } from "@/lib/constants";
import { getPlans, getSubscription } from "@/lib/storage";
import { submitBillingRequest, ADMIN_EMAIL } from "@/lib/billing-client";
import { formatDate } from "@/lib/format";
import { toastFailure } from "@/lib/toast";
import Icon from "@/components/Icon";
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
  const [failed, setFailed] = useState("");

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([getSubscription(shop.id), getPlans()]);
      setSub(s);
      setPlans(p);
      setLoading(false);
    })();
  }, [shop.id]);

  if (loading) {
    return <div className="panel"><div style={{ color: "var(--stone)", padding: 24 }}>Loading your plan…</div></div>;
  }

  // Local mode (no Supabase) has no plans/metering.
  if (!sub) {
    return (
      <div className="panel">
        <div className="panel-head"><span className="title">Plan &amp; usage</span></div>
        <p style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
          Plans and try-on limits apply once this shop runs in cloud mode (Supabase connected and
          deployed). In local mode there are no limits — everything is on this device.
        </p>
      </div>
    );
  }

  /* try/catch, not try/finally. These were try/FINALLY with no catch at all,
     so a failed billing request produced an unhandled promise rejection, no
     UI change whatsoever, and a vendor who believed they had asked to be
     upgraded — and then waited. */
  const requestPlan = async (plan: PlanInfo) => {
    setBusy("plan:" + plan.id);
    setFailed("");
    setNotice("");
    try {
      await submitBillingRequest({
        shop: { id: shop.id, name: shop.name, slug: shop.slug },
        kind: "plan",
        plan: { id: plan.id, name: plan.name, priceNpr: plan.priceNpr },
      });
      setNotice(`Upgrade request sent for ${plan.name}. We'll be in touch to set it up.`);
    } catch (e) {
      setFailed(`We couldn't send your ${plan.name} request. Nothing has changed — try again, or email ${ADMIN_EMAIL}.`);
      toastFailure("Could not send your upgrade request", e);
    } finally {
      setBusy(null);
    }
  };

  const requestCredits = async () => {
    setBusy("credits");
    setFailed("");
    setNotice("");
    try {
      await submitBillingRequest({
        shop: { id: shop.id, name: shop.name, slug: shop.slug },
        kind: "credits",
        currentPlanName: sub.plan.name,
      });
      setNotice("Credit top-up request sent. We'll top you up shortly.");
    } catch (e) {
      setFailed(`We couldn't send your top-up request. Nothing has changed — try again, or email ${ADMIN_EMAIL}.`);
      toastFailure("Could not send your top-up request", e);
    } finally {
      setBusy(null);
    }
  };

  const resetLabel = formatDate(sub.periodEnd);
  const paidPlan = sub.plan.priceNpr > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* --ok, the token that means "this went through" — it was --paper on
          --ink, i.e. the same neutral pair as every other panel on the page.
          And it can be dismissed: it never cleared, so a vendor who asked for
          an upgrade in the morning still had the confirmation on screen at
          closing time. */}
      {notice && (
        <div role="status" style={{ background: "var(--ok-bg)", border: "1px solid var(--ok)", borderRadius: "var(--radius-card)", padding: "12px 16px", fontSize: 13.5, color: "var(--ink)", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ color: "var(--ok)", flexShrink: 0 }}><Icon name="check" /></span>
          <span style={{ flex: 1 }}>
            {notice} <span style={{ color: "var(--stone)" }}>Didn't see an email open? Write to {ADMIN_EMAIL}.</span>
          </span>
          <button className="ph-btn" onClick={() => setNotice("")} aria-label="Dismiss"
            style={{ color: "var(--stone)", flexShrink: 0, padding: 2 }}><Icon name="close" /></button>
        </div>
      )}
      {failed && (
        <div role="alert" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", borderRadius: "var(--radius-card)", padding: "12px 16px", fontSize: 13.5, color: "var(--ink)" }}>
          {failed}
        </div>
      )}

      {/* current plan + usage */}
      <div className="panel">
        <div className="panel-head" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span className="title">Current plan · {sub.plan.name}</span>
          <span style={{ fontSize: 12.5, color: "var(--stone)" }}>
            {sub.status !== "active" ? <b style={{ color: "var(--danger)" }}>{sub.status} · </b> : null}
            resets {resetLabel}
          </span>
        </div>
        {/* One meter: every try-on runs the studio finish and spends from
            tryon_limit — the retired studio allowance isn't shown. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 4 }}>
          <Meter label="Try-ons this period" used={sub.tryonsUsed} limit={sub.plan.tryonLimit} />
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="ph-btn" disabled={!!busy} onClick={requestCredits}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "9px 16px", fontSize: 12.5, color: "var(--ink)", fontWeight: 500, opacity: busy ? 0.6 : 1 }}>
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
                border: "1px solid " + (current ? "var(--ink)" : "var(--line)"),
                borderRadius: "var(--radius-card)", padding: "18px 16px", background: current ? "var(--paper)" : "var(--card)",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span className="ph-display" style={{ fontSize: 18, color: "var(--ink)" }}>{p.name}</span>
                  {current && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", color: "var(--ink)", textTransform: "uppercase" }}>current</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
                  {p.priceNpr > 0 ? npr(p.priceNpr) : p.id === "free" ? "Free" : "Custom"}
                  {p.priceNpr > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--stone)" }}> /mo</span>}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 8px", fontSize: 13, color: "var(--stone)", lineHeight: 1.9 }}>
                  <li>{p.tryonLimit.toLocaleString("en-IN")} try-ons / month</li>
                  <li>{p.maxGarments == null ? "Unlimited garments" : p.maxGarments + " garments"}</li>
                </ul>
                {canRequest ? (
                  <button className="ph-btn btn-solid" disabled={!!busy} onClick={() => requestPlan(p)}
                    style={{ marginTop: "auto", padding: "9px 12px", fontSize: 12, opacity: busy ? 0.6 : 1 }}>
                    {busy === "plan:" + p.id ? "requesting…" : "Request " + p.name}
                  </button>
                ) : p.priceNpr === 0 && p.id !== "free" ? (
                  <div style={{ marginTop: "auto", fontSize: 12.5, color: "var(--stone)" }}>Contact us to set up.</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 14, lineHeight: 1.6 }}>
          A studio finish uses one try-on and one studio slot. Cached repeats are free. Requesting an
          upgrade or top-up emails us — we'll set you up and start a fresh 30-day period.
        </p>
        {/* The grid only ever offered plans ABOVE the current one
            (`p.sort > sub.plan.sort`), so a paying vendor could move up and
            nowhere else: no downgrade, no cancel, no way out of a plan they
            had outgrown in the other direction. Billing is manual, so the way
            down is the same channel as the way up — it just has to exist. */}
        {paidPlan && (
          <p style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 10, lineHeight: 1.6 }}>
            Want to move down a plan, or stop?{" "}
            <a href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(`Change my plan — ${shop.name || shop.slug || shop.id}`)}`}
              style={{ color: "var(--violet)", fontWeight: 600 }}>
              email us
            </a>{" "}
            and we'll change it from the next period. Your catalog and storefront stay exactly as they are.
          </p>
        )}
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
        <span style={{ fontSize: 12.5, color: low ? "var(--warn)" : "var(--stone)", fontWeight: low ? 600 : 400 }}>
          {left.toLocaleString("en-IN")} left
        </span>
      </div>
      <div style={{ height: 8, borderRadius: "var(--radius-pill)", background: "var(--line)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: low ? "var(--warn)" : "var(--ink)", transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--stone)", marginTop: 4 }}>
        {used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")} used
      </div>
    </div>
  );
}

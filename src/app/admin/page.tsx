"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Note, SectionHead } from "./AdminShell";
import { adminGet } from "@/lib/admin-client";

/* Console landing: what the platform holds, and what is waiting on you.

   The queue cards come first and link straight into the screen that clears
   them — since the approval gate landed, a shop sitting in 'pending' has no
   storefront, no catalog writes, and no try-on, so that number is the most
   time-sensitive thing on the page. */

interface Overview {
  totals: { shops: number; garments: number; leads: number; accounts: number; vendors: number; shoppers: number };
  queues: { pendingShops: number; suspendedShops: number; openRequests: number };
  week: { tryons: number; leads: number; errors: number };
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminGet<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e) => setErr(e?.message || "Could not load overview."));
  }, []);

  if (err) return <Note>{err}</Note>;
  if (!data) return <Note>Loading…</Note>;

  return (
    <>
      <SectionHead title="Needs attention" sub="Queues that only an admin can clear." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <Queue
          href="/admin/shops?status=pending"
          label="Shops awaiting approval"
          value={data.queues.pendingShops}
          hint="No storefront or try-on until approved"
          urgent={data.queues.pendingShops > 0}
        />
        <Queue
          href="/admin/billing"
          label="Open billing requests"
          value={data.queues.openRequests}
          hint="Plan upgrades and top-ups"
          urgent={data.queues.openRequests > 0}
        />
        <Queue
          href="/admin/shops?status=suspended"
          label="Suspended shops"
          value={data.queues.suspendedShops}
          hint="Currently dark"
          urgent={false}
        />
      </div>

      <div style={{ height: 28 }} />
      <SectionHead title="Platform" sub="Everything on peeq right now." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Shops" value={data.totals.shops} />
        <Stat label="Garments" value={data.totals.garments} />
        <Stat label="Accounts" value={data.totals.accounts} />
        <Stat label="Vendors" value={data.totals.vendors} />
        <Stat label="Shoppers" value={data.totals.shoppers} />
        <Stat label="Leads" value={data.totals.leads} />
      </div>

      <div style={{ height: 28 }} />
      <SectionHead title="Last 7 days" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Try-ons" value={data.week.tryons} />
        <Stat label="Leads" value={data.week.leads} />
        <Stat label="Errors" value={data.week.errors} tone={data.week.errors > 0 ? "bad" : undefined} />
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="panel" style={{ padding: "14px 16px" }}>
      <div
        className="ph-display"
        style={{ fontSize: 26, color: tone === "bad" ? "#9b3232" : "var(--forest-deep)", lineHeight: 1.1 }}
      >
        {value.toLocaleString("en-GB")}
      </div>
      <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Queue({
  href,
  label,
  value,
  hint,
  urgent,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  urgent: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        className="panel"
        style={{
          padding: "14px 16px",
          borderLeft: "3px solid " + (urgent ? "var(--butter-deep)" : "var(--line)"),
          height: "100%",
        }}
      >
        <div
          className="ph-display"
          style={{ fontSize: 26, color: urgent ? "var(--butter-deep)" : "var(--mut)", lineHeight: 1.1 }}
        >
          {value.toLocaleString("en-GB")}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink)", marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 2 }}>{hint}</div>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, signOut } from "@/lib/account";

/* Shared account affordance — dropped into every page's nav so a signed-in
   shopper or vendor is always one tap from their account, and a signed-out
   visitor is always one tap from /signin. Reflects the remembered session:
   nothing to render when Supabase is off (marketing keeps its own links). */

export default function AccountMenu() {
  const { user, role, loading, configured } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <Link href="/signin" style={{ color: "var(--violet)", fontWeight: 600 }}>
        sign in
      </Link>
    );
  }

  const isVendor = role === "vendor";
  const initial = (user.email || "?").trim().charAt(0).toUpperCase() || "?";

  /* /account is everyone's, vendors included. It used to be an either/or with
     the dashboard — role picked one destination and the other was unreachable
     from the nav — so a vendor who had tried a piece on had no way back to
     their own saved looks, contact details or orders from anywhere in the
     product. Both now sit in the same menu, dashboard first because that is
     the vendor's working surface. */
  const items = [
    ...(isVendor ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/account", label: "My account" },
    /* A vendor lands on /dashboard and stays there: the dashboard nav has no
       link out to the public side, so "back to home" is the way back to the
       storefronts they are building for. Shoppers already start there. */
    ...(isVendor ? [{ href: "/", label: "Back to home" }] : []),
  ];

  const itemStyle: React.CSSProperties = {
    display: "block", padding: "11px 14px", fontSize: 14,
    color: "var(--ink)", textDecoration: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        className="ph-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        style={{
          width: 34, height: 34, borderRadius: "var(--radius-pill)", background: "var(--violet)", color: "var(--on-accent)",
          fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 190, zIndex: 80,
            background: "var(--card, #fff)", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-soft, 0 6px 24px rgba(0,0,0,.12))", overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, color: "var(--stone)" }}>{isVendor ? "signed in — vendor" : "signed in"}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </div>
          </div>
          {items.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" onClick={() => setOpen(false)} style={itemStyle}>
              {it.label}
            </Link>
          ))}
          {/* only sign out takes a rule: it's the one item that ends the
              session rather than going somewhere, and the destinations above
              read as one group */}
          <button
            className="ph-btn"
            role="menuitem"
            onClick={async () => { setOpen(false); await signOut(); window.location.href = "/"; }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", fontSize: 14, color: "var(--stone)", borderTop: "1px solid var(--line)" }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { useAccount, signOut } from "@/lib/account";

/* Shared account affordance — dropped into every page's nav so a signed-in
   shopper or vendor is always one tap from their account, and a signed-out
   visitor is always one tap from /signin. Reflects the remembered session:
   nothing to render when Supabase is off (marketing keeps its own links). */

export default function AccountMenu({ extraItems = [] }: {
  /* Destinations belonging to the page that mounted this, shown as the first
     group. The dashboard puts Plan and Shop settings here: both are set-up-
     once surfaces that were costing a permanent slot in a tab bar a vendor
     scrolls sideways on a phone, next to the tabs they open every day. */
  extraItems?: { label: string; onSelect: () => void }[];
} = {}) {
  const { user, role, loading, configured } = useAccount();
  const pathname = usePathname();
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

  if (loading) return null;

  const signedIn = configured && !!user;

  /* Nothing of its own to show AND nothing the page hung on it: with Supabase
     off there is no account at all (marketing keeps its own links), and when
     it's on, a signed-out visitor gets the one link that fixes that.

     The extraItems guard matters because the dashboard runs in local mode too,
     with Supabase off and so no session — and this menu is where its Overview,
     Plan and Shop settings live. Returning null there would strand three
     surfaces behind a URL a vendor would have to know to type. */
  if (!signedIn && extraItems.length === 0) {
    return configured ? (
      <Link href="/signin" style={{ color: "var(--violet)", fontWeight: 600 }}>
        sign in
      </Link>
    ) : null;
  }

  const isVendor = role === "vendor";
  const initial = (user?.email || "?").trim().charAt(0).toUpperCase() || "?";

  /* /account is everyone's, vendors included. It used to be an either/or with
     the dashboard — role picked one destination and the other was unreachable
     from the nav — so a vendor who had tried a piece on had no way back to
     their own saved looks, contact details or orders from anywhere in the
     product. Both now sit in the same menu, dashboard first because that is
     the vendor's working surface.

     Minus whichever one you are already reading: a link to the current page is
     a row that does nothing, and "Dashboard" on /dashboard was exactly that —
     the entry a vendor sees most often and can never use. Dropping self-links
     is also what frees the slot the dashboard fills with "Overview". */
  const items = !signedIn ? [] : [
    ...(isVendor ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/account", label: "My account" },
    /* A vendor lands on /dashboard and stays there: the dashboard nav has no
       link out to the public side, so "back to home" is the way back to the
       storefronts they are building for. Shoppers already start there. */
    ...(isVendor ? [{ href: "/", label: "Back to home" }] : []),
  ].filter((it) => it.href !== pathname);

  const itemStyle: React.CSSProperties = {
    display: "block", padding: "11px 14px", fontSize: 14,
    color: "var(--ink)", textDecoration: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      {/* The initial when there's a session to name, three rules when there
          isn't — the menu is still the way to the page's own destinations, so
          it needs a handle either way. */}
      <button
        className="ph-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={signedIn ? "Your account" : "Menu"}
        style={{
          width: 34, height: 34, borderRadius: "var(--radius-pill)",
          background: signedIn ? "var(--violet)" : "var(--card)",
          color: signedIn ? "var(--on-accent)" : "var(--ink)",
          border: signedIn ? "none" : "1px solid var(--line-strong)",
          fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {signedIn ? initial : <Icon name="menu" />}
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
          {signedIn && (
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12, color: "var(--stone)" }}>{isVendor ? "signed in — vendor" : "signed in"}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user!.email}
              </div>
            </div>
          )}
          {/* The page's own destinations first, ruled off from the account
              ones below: "Plan" is about this shop, "My account" is about the
              person signed in, and running them together as one list makes a
              vendor read all six to find either. */}
          {extraItems.length > 0 && (
            /* No rule when nothing follows — in local mode these are the whole
               menu, and a hairline under the last row is a divider dividing
               one thing. */
            <div style={{ borderBottom: signedIn || configured ? "1px solid var(--line)" : undefined }}>
              {extraItems.map((it) => (
                <button
                  key={it.label}
                  className="ph-btn"
                  role="menuitem"
                  onClick={() => { setOpen(false); it.onSelect(); }}
                  style={{ ...itemStyle, width: "100%", textAlign: "left" }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
          {items.map((it) => (
            <Link key={it.href} href={it.href} role="menuitem" onClick={() => setOpen(false)} style={itemStyle}>
              {it.label}
            </Link>
          ))}
          {/* only sign out takes a rule: it's the one item that ends the
              session rather than going somewhere, and the destinations above
              read as one group. Signed out with Supabase on, the same slot is
              the way in; with Supabase off there is no session to end and no
              sign-in to offer, so it holds nothing. */}
          {signedIn ? (
            <button
              className="ph-btn"
              role="menuitem"
              onClick={async () => { setOpen(false); await signOut(); window.location.href = "/"; }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", fontSize: 14, color: "var(--stone)", borderTop: "1px solid var(--line)" }}
            >
              Sign out
            </button>
          ) : configured ? (
            <Link href="/signin" role="menuitem" onClick={() => setOpen(false)}
              style={{ ...itemStyle, color: "var(--violet)", fontWeight: 600, borderTop: "1px solid var(--line)" }}>
              Sign in
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

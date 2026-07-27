"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminGet, statusFromError, type AdminStatus } from "@/lib/admin-client";

/* The console frame: one guard, one nav, rendered around every /admin page.

   The guard runs once here rather than in each page, so a page body can assume
   the caller is an admin. It is a rendering decision only — every /api/admin
   route re-checks the token independently. */

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/shops", label: "Shops" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/ops", label: "Ops" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AdminStatus>("loading");
  const [email, setEmail] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    adminGet<{ email: string }>("/api/admin/me")
      .then((d) => {
        if (!alive) return;
        setEmail(d.email);
        setStatus("ready");
      })
      .catch((e) => {
        if (alive) setStatus(statusFromError(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px min(26px, 4vw) 64px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <div className="wordmark" style={{ fontSize: 22 }}>
              p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q
            </div>
            <div style={{ fontSize: 12, color: "var(--mut)", letterSpacing: ".12em", marginTop: 3 }}>
              admin console
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            {email && <span style={{ color: "var(--mut)" }}>{email}</span>}
            <Link href="/dashboard" className="ph-btn" style={{ color: "var(--mut)" }}>
              ← dashboard
            </Link>
          </div>
        </header>

        {status === "ready" && (
          <nav
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              borderBottom: "1px solid var(--line)",
              marginBottom: 22,
            }}
          >
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    padding: "9px 14px",
                    fontSize: 13,
                    textDecoration: "none",
                    color: active ? "var(--forest-deep)" : "var(--mut)",
                    borderBottom: "2px solid " + (active ? "var(--butter-deep)" : "transparent"),
                    marginBottom: -1,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}

        {status === "loading" && <Note>Loading…</Note>}
        {status === "nosupabase" && <Note>Admin tools need cloud mode (Supabase configured).</Note>}
        {status === "unauth" && (
          <Note>
            Please{" "}
            <Link href="/login" style={{ color: "var(--violet)" }}>
              sign in
            </Link>{" "}
            with an admin account.
          </Note>
        )}
        {status === "forbidden" && (
          <Note>This account isn&apos;t an admin. Sign in as an allow-listed admin (ADMIN_EMAILS).</Note>
        )}
        {status === "ready" && children}
      </div>
    </main>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel">
      <div style={{ color: "var(--mut)", padding: 20, fontSize: 14 }}>{children}</div>
    </div>
  );
}

/** Status pill shared by the shops table and the user list. */
export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "mute"; children: React.ReactNode }) {
  // Straight off the semantic tokens. These were hand-mixed alphas before,
  // which cost the pills their meaning in dark mode: the tints were built from
  // light-mode ink and washed out to nothing, and "good" took --forest-deep as
  // its text, which inverts to the page's off-white — so a live shop and a
  // suspended one were told apart by a tint nobody could see.
  const colors = {
    good: { bg: "var(--ok-bg)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-bg)", fg: "var(--warn)" },
    bad: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    mute: { bg: "var(--line)", fg: "var(--mut)" },
  }[tone];
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 11,
        letterSpacing: ".04em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Section heading + optional right-hand controls. */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 14,
      }}
    >
      <div>
        <div className="ph-display" style={{ fontSize: 19, color: "var(--forest-deep)" }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** Text input styled like the rest of the console. */
export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        padding: "9px 12px",
        borderRadius: "var(--radius-btn)",
        border: "1px solid var(--line)",
        fontSize: 13,
        background: "var(--card)",
        ...props.style,
      }}
    />
  );
}

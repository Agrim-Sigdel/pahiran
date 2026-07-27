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
    <main style={{ minHeight: "100dvh", background: "var(--paper)", color: "var(--ink)" }}>
      <div id="main" style={{ maxWidth: 1100, margin: "0 auto", padding: "22px min(26px, 4vw) 64px" }}>
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
            <div style={{ fontSize: 12, color: "var(--stone)", letterSpacing: ".12em", marginTop: 3 }}>
              admin console
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            {email && <span style={{ color: "var(--stone)" }}>{email}</span>}
            {/* was "← dashboard" → /dashboard, which for an admin with no
                shop of their own drops them straight into vendor onboarding —
                a form asking the person who approves shops to create one */}
            <Link href="/" className="ph-btn" style={{ color: "var(--stone)" }}>
              ← peeq
            </Link>
          </div>
        </header>

        {/* .tabs, the same component the vendor dashboard uses. This nav
            re-implemented it from scratch and marked the active tab with a
            --butter-deep underline where the dashboard uses --violet, so the
            product had two visual languages for "you are here" depending on
            which half of it you were in. */}
        {status === "ready" && (
          <nav className="tabs" aria-label="Admin sections">
            {NAV.map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={active ? "on" : ""}
                  aria-current={active ? "page" : undefined}
                  style={{ textDecoration: "none", display: "inline-block", position: "relative" }}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}

        {status === "loading" && <Note>Loading…</Note>}
        {status === "nosupabase" && <Note>Admin tools need cloud mode (Supabase configured).</Note>}
        {/* Denials were rendered by <Note> — grey --stone text in a plain panel,
            i.e. exactly the styling used for "Loading…". Being refused access
            and being told a neutral fact are not the same message. */}
        {status === "unauth" && (
          <Denied>
            You need to be signed in.{" "}
            <Link href="/login" style={{ color: "var(--violet)", fontWeight: 600 }}>
              Sign in
            </Link>{" "}
            with an admin account.
          </Denied>
        )}
        {status === "forbidden" && (
          <Denied>This account isn&apos;t an admin. Sign in as an allow-listed admin (ADMIN_EMAILS).</Denied>
        )}
        {status === "ready" && children}
      </div>
    </main>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel">
      <div style={{ color: "var(--stone)", padding: 20, fontSize: 14 }}>{children}</div>
    </div>
  );
}

/** An access refusal. Same shape as Note, but it looks like a wall. */
function Denied({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="panel" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
      <div style={{ color: "var(--ink)", padding: 20, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

/** Status pill shared by the shops table and the user list. */
export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "mute"; children: React.ReactNode }) {
  // Straight off the semantic tokens. These were hand-mixed alphas before,
  // which cost the pills their meaning in dark mode: the tints were built from
  // light-mode ink and washed out to nothing, and "good" took --ink as
  // its text, which inverts to the page's off-white — so a live shop and a
  // suspended one were told apart by a tint nobody could see.
  const colors = {
    good: { bg: "var(--ok-bg)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-bg)", fg: "var(--warn)" },
    bad: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    mute: { bg: "var(--line)", fg: "var(--stone)" },
  }[tone];
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.fg,
        borderRadius: "var(--radius-pill)",
        padding: "3px 9px",
        fontSize: 12,
        fontWeight: 600,
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
        <div className="ph-display" style={{ fontSize: 19, color: "var(--ink)" }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 3 }}>{sub}</div>}
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

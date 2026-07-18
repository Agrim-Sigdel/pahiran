"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  signInWithEmail, signUpWithEmail,
  ensureRole, getRole, roleHome,
} from "@/lib/account";

/* Shared sign-in/sign-up form behind the two dedicated auth surfaces:
   /signin (shoppers) and /login (vendors). The surface fixes the intent —
   there is no role picker — and the intent only ever stamps a role on a
   brand-new account. An existing account's role always wins (getRole treats
   shop ownership as ground truth), so a vendor signing in on the shopper
   page still lands on their dashboard, and vice versa. */

interface Copy {
  signinTitle: string;
  signupTitle: string;
  signinBlurb: string;
  signupBlurb: string;
  localMode: { blurb: string; cta: string; href: string };
  crossLink: { question: string; label: string; href: string };
}

const COPY: Record<"shopper" | "vendor", Copy> = {
  shopper: {
    signinTitle: "welcome back",
    signupTitle: "create your account",
    signinBlurb: "Sign in to your looks, bag and wishlist.",
    signupBlurb: "Save your try-ons and bag, and pick up on any device.",
    localMode: {
      blurb: "This install runs in local mode (no Supabase configured) — your looks and bag live in this browser.",
      cta: "see your looks",
      href: "/account",
    },
    crossLink: { question: "Selling on peeq?", label: "Vendor sign in", href: "/login" },
  },
  vendor: {
    signinTitle: "vendor sign in",
    signupTitle: "open your shop",
    signinBlurb: "Sign in to your shop dashboard.",
    signupBlurb: "Set up your shop dashboard — catalog, try-ons, leads.",
    localMode: {
      blurb: "This install runs in local mode (no Supabase configured) — your catalog lives in this browser. Head straight to the dashboard.",
      cta: "open dashboard",
      href: "/dashboard",
    },
    crossLink: { question: "Just shopping?", label: "Shopper sign in", href: "/signin" },
  },
};

export default function AuthPage({ intent }: { intent: "shopper" | "vendor" }) {
  const router = useRouter();
  const copy = COPY[intent];

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // remembered session → skip the form, route by the stored role
  useEffect(() => {
    if (!isSupabaseConfigured()) { setChecking(false); return; }
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (data.session) {
        const role = (await getRole()) ?? intent;
        router.replace(roleHome(role));
        return;
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <h1 className="ph-display" style={{ fontSize: 26, color: "var(--forest-deep)", margin: "0 0 4px" }}>no sign-in needed</h1>
        <p style={{ color: "var(--mut)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 }}>{copy.localMode.blurb}</p>
        <button className="ph-btn btn-solid" style={{ width: "100%" }} onClick={() => router.push(copy.localMode.href)}>{copy.localMode.cta}</button>
      </Shell>
    );
  }

  if (checking) {
    return (
      <Shell>
        <span className="ee-mark ee-looking" style={{ fontSize: 40, color: "var(--violet)" }}><span>ee</span></span>
        <p style={{ color: "var(--stone)", marginTop: 12 }}>one moment…</p>
      </Shell>
    );
  }

  const EMAIL_MAX = 120;
  const PASSWORD_MIN = 6;
  const PASSWORD_MAX = 72; // bcrypt limit — Supabase truncates beyond this

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    const trimmed = email.trim();
    if (!trimmed) errors.email = "Email is required.";
    else if (trimmed.length > EMAIL_MAX) errors.email = `Email must be ${EMAIL_MAX} characters or fewer.`;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Password is required.";
    else if (password.length < PASSWORD_MIN) errors.password = `Password must be at least ${PASSWORD_MIN} characters.`;
    else if (password.length > PASSWORD_MAX) errors.password = `Password must be ${PASSWORD_MAX} characters or fewer.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await signUpWithEmail(email.trim(), password);
        if (error) {
          // confirmations off: Supabase reports the duplicate directly
          if (/already registered|already exists/i.test(error.message)) {
            setMode("signin");
            setMessage("An account with this email already exists — sign in below.");
            return;
          }
          throw error;
        }
        // confirmations on: duplicates come back as an obfuscated user with no
        // identities instead of an error (anti-enumeration behaviour)
        if (data.user && !data.session && data.user.identities?.length === 0) {
          setMode("signin");
          setMessage("An account with this email already exists — sign in below.");
          return;
        }
        if (!data.session) { setMessage("Check your email to confirm your account, then sign in."); setMode("signin"); return; }
      } else {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) throw error;
      }
      const role = await ensureRole(intent);
      router.push(roleHome(role));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  const input = (invalid: boolean): React.CSSProperties => ({
    padding: "13px 14px", borderRadius: "var(--radius-btn)",
    border: "1px solid " + (invalid ? "var(--camel)" : "var(--line)"),
    background: "#fff", color: "var(--ink)", fontSize: 15, width: "100%",
  });

  const fieldError: React.CSSProperties = {
    fontSize: 12.5, color: "var(--camel)", textAlign: "left", marginTop: -6,
  };

  return (
    <Shell>
      <h1 className="ph-display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 4px" }}>
        {mode === "signin" ? copy.signinTitle : copy.signupTitle}
      </h1>
      <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6 }}>
        {mode === "signin" ? copy.signinBlurb : copy.signupBlurb}
      </p>

      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={input(!!fieldErrors.email)} type="email" maxLength={EMAIL_MAX} placeholder="you@email.com" value={email}
          onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }}
          autoComplete="email" aria-invalid={!!fieldErrors.email} />
        {fieldErrors.email && <div style={fieldError}>{fieldErrors.email}</div>}
        <input style={input(!!fieldErrors.password)} type="password" maxLength={PASSWORD_MAX} placeholder="Password (6+ characters)"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
          autoComplete={mode === "signin" ? "current-password" : "new-password"} aria-invalid={!!fieldErrors.password} />
        {fieldErrors.password && <div style={fieldError}>{fieldErrors.password}</div>}
        <button className="ph-btn btn-violet" disabled={busy} type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "one moment…" : mode === "signin" ? "sign in" : "sign up"}
        </button>
      </form>
      {message && (
        message.startsWith("Check your email") ? (
          <div className="note-ok" style={{ marginTop: 14 }}>{message}</div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--camel)" }}>{message}</div>
        )
      )}
      <button className="ph-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setFieldErrors({}); }}
        style={{ color: "var(--stone)", fontSize: 13, marginTop: 18, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--stone)" }}>
        {copy.crossLink.question}{" "}
        <Link href={copy.crossLink.href} style={{ color: "var(--violet)", fontWeight: 600 }}>{copy.crossLink.label}</Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--sage)" }}>
      <nav className="efc-nav" style={{ background: "var(--paper)" }}>
        <div className="nav-links">
          <Link href="/">home</Link>
        </div>
        <div className="nav-logo">
          <Link href="/" style={{ textDecoration: "none" }}>
            <div className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)" }}>p<span className="ee">ee</span>q</div>
          </Link>
        </div>
        <div className="nav-tools" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/owner" style={{ color: "var(--violet)" }}>for store owners</Link>
        </div>
      </nav>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", padding: "40px 36px", width: 400, maxWidth: "100%", textAlign: "center", boxShadow: "var(--shadow-soft)" }}>
          {children}
        </div>
      </div>
    </main>
  );
}

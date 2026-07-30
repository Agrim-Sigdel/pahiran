"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import Icon from "@/components/Icon";
import {
  signInWithEmail, signUpWithEmail, sendPasswordReset,
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
    signupBlurb: "Your looks, on every device.",
    localMode: {
      blurb: "Local mode — this browser only.",
      cta: "see your looks",
      href: "/account",
    },
    crossLink: { question: "Selling on peeq?", label: "Vendor sign in", href: "/login" },
  },
  vendor: {
    signinTitle: "vendor sign in",
    signupTitle: "open your shop",
    signinBlurb: "Sign in to your shop dashboard.",
    signupBlurb: "Catalog, try-ons, leads.",
    localMode: {
      blurb: "Local mode — this browser only.",
      cta: "open dashboard",
      href: "/dashboard",
    },
    crossLink: { question: "Just shopping?", label: "Shopper sign in", href: "/signin" },
  },
};

export default function AuthPage({ intent }: { intent: "shopper" | "vendor" }) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = COPY[intent];

  /* Honour ?mode=signup. /owner's two "create your shop free" buttons — the
     page's whole conversion path — sent acquisition traffic to /login, which
     opened on a form headed "vendor sign in" asking a brand-new vendor for a
     password they had never set. */
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );

  /* Where to land after sign-in, when the visit started somewhere specific —
     /counter bounces through here as ?next=/dashboard?counter=1. Same-site
     relative paths only ("//evil.com" parses as protocol-relative), and only
     for vendors: a shopper's home is /account no matter where they came from. */
  const rawNext = params.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const landing = (role: "shopper" | "vendor") =>
    role === "vendor" && next ? next : roleHome(role);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  /* Two channels, because they are two different things and were sharing one:
     "you already have an account, sign in below" was rendered in role="alert"
     and --danger, i.e. as a failure, for a message that is just information. */
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailId = useId();
  const passwordId = useId();

  // remembered session → skip the form, route by the stored role
  useEffect(() => {
    if (!isSupabaseConfigured()) { setChecking(false); return; }
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (data.session) {
        const role = (await getRole()) ?? intent;
        router.replace(landing(role));
        return;
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <h1 className="ph-display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 4px" }}>no sign-in needed</h1>
        <p style={{ color: "var(--stone)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 }}>{copy.localMode.blurb}</p>
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
            setNotice("You already have an account with this email — sign in below.");
            return;
          }
          throw error;
        }
        // confirmations on: duplicates come back as an obfuscated user with no
        // identities instead of an error (anti-enumeration behaviour)
        if (data.user && !data.session && data.user.identities?.length === 0) {
          setMode("signin");
          setNotice("You already have an account with this email — sign in below.");
          return;
        }
        if (!data.session) { setNotice("Check your email to confirm your account, then sign in."); setMode("signin"); return; }
      } else {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) throw error;
      }
      const role = await ensureRole(intent);
      router.push(landing(role));
    } catch (err: unknown) {
      /* Supabase's own strings were surfaced verbatim. "Invalid login
         credentials" and "AuthApiError: …" are messages for a developer;
         these are the two things that actually go wrong, said plainly. */
      setMessage(friendlyAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  };

  /* Always the same answer, sent or not: telling someone "no account with that
     email" turns this box into a way to find out who has one. */
  const forgotPassword = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldErrors((f) => ({ ...f, email: "Enter your email address first, then tap “forgot password”." }));
      return;
    }
    setResetting(true);
    setMessage("");
    await sendPasswordReset(trimmed);
    setResetting(false);
    setNotice(`If an account exists for ${trimmed}, we've sent it a link to set a new password. Check your inbox and spam.`);
  };

  const input = (invalid: boolean): React.CSSProperties => ({
    padding: "13px 14px", borderRadius: "var(--radius-btn)",
    border: "1px solid " + (invalid ? "var(--danger)" : "var(--line)"),
    background: "var(--card)", color: "var(--ink)", fontSize: 15, width: "100%",
  });

  const fieldError: React.CSSProperties = {
    fontSize: 12.5, color: "var(--danger)", textAlign: "left", marginTop: -6, fontWeight: 600,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 600, color: "var(--ink)", textAlign: "left", marginBottom: 5, display: "block",
  };

  return (
    <Shell>
      <h1 className="ph-display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 4px" }}>
        {mode === "signin" ? copy.signinTitle : copy.signupTitle}
      </h1>
      <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6 }}>
        {mode === "signin" ? copy.signinBlurb : copy.signupBlurb}
      </p>

      {/* Real <label>s. Both fields were placeholder-only, so the instant you
          typed an email the form was two unlabelled boxes — and the errors,
          which had aria-invalid but no aria-describedby and no role, were
          never announced at all. */}
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label htmlFor={emailId} style={labelStyle}>Email</label>
          <input id={emailId} style={input(!!fieldErrors.email)} type="email" maxLength={EMAIL_MAX}
            placeholder="you@email.com" value={email} autoFocus
            onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }}
            autoComplete="email" aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? emailId + "-err" : undefined} />
          {fieldErrors.email && <div id={emailId + "-err"} role="alert" style={fieldError}>{fieldErrors.email}</div>}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <label htmlFor={passwordId} style={labelStyle}>Password</label>
            {/* The way back in. There was none — anywhere in the codebase. */}
            {mode === "signin" && (
              <button type="button" className="ph-btn" onClick={forgotPassword} disabled={resetting}
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
                {resetting ? "sending…" : "forgot password?"}
              </button>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input id={passwordId} style={{ ...input(!!fieldErrors.password), paddingRight: 46 }}
              type={reveal ? "text" : "password"} maxLength={PASSWORD_MAX}
              placeholder={mode === "signup" ? `at least ${PASSWORD_MIN} characters` : "your password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined })); }}
              autoComplete={mode === "signin" ? "current-password" : "new-password"} aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? passwordId + "-err" : undefined} />
            {/* Typing a password you can't see, on a phone keyboard, is how
                people get locked out of an account they just created. */}
            <button type="button" className="ph-btn" onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"} aria-pressed={reveal}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: 8, color: "var(--stone)", fontSize: 16 }}>
              <Icon name="eye" />
            </button>
          </div>
          {fieldErrors.password && <div id={passwordId + "-err"} role="alert" style={fieldError}>{fieldErrors.password}</div>}
        </div>
        <button className="ph-btn btn-violet" disabled={busy} type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "one moment…" : mode === "signin" ? "sign in" : "sign up"}
        </button>
      </form>

      {notice && <div className="note-ok" style={{ marginTop: 14 }}>{notice}</div>}
      {message && <div role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--danger)", fontWeight: 600 }}>{message}</div>}

      <button className="ph-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setNotice(""); setFieldErrors({}); }}
        style={{ color: "var(--stone)", fontSize: 13, marginTop: 18, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>

  

      <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--stone)" }}>
        {copy.crossLink.question}{" "}
        <Link href={copy.crossLink.href} style={{ color: "var(--violet)", fontWeight: 600 }}>{copy.crossLink.label}</Link>
      </div>
    </Shell>
  );
}

/* Supabase's raw messages leaked straight to the form. These are the cases
   that actually happen; anything else keeps a generic line rather than
   showing a shopper an AuthApiError. */
function friendlyAuthError(err: unknown, mode: "signin" | "signup"): string {
  const raw = err instanceof Error ? err.message : "";
  if (/invalid login credentials|invalid_grant/i.test(raw)) {
    return "That email and password don't match. Check them, or use “forgot password”.";
  }
  if (/email not confirmed/i.test(raw)) {
    return "Check your email and confirm your account first, then sign in.";
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (/weak password|password should be/i.test(raw)) {
    return "That password is too weak — try a longer one.";
  }
  if (/network|fetch/i.test(raw)) {
    return "We couldn't reach the server — check your connection and try again.";
  }
  return mode === "signup"
    ? "We couldn't create your account just now — please try again."
    : "We couldn't sign you in just now — please try again.";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
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
      <div id="main" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="sheet" style={{ padding: "40px 36px", width: 400, maxWidth: "100%", textAlign: "center" }}>
          {children}
        </div>
      </div>
    </main>
  );
}

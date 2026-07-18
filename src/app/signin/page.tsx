"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  signInWithEmail, signUpWithEmail,
  ensureRole, getRole, roleHome,
} from "@/lib/account";

/* One sign-in for everyone. Shoppers and vendors sign in here from anywhere;
   the session is remembered, so a returning user is bounced straight to their
   home. New users pick an intent (shop vs sell) which only decides the role
   when the account has none yet — ensureRole() never re-roles an existing one. */

type Intent = "shopper" | "vendor";

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const initialIntent: Intent = params.get("intent") === "vendor" ? "vendor" : "shopper";

  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  // remembered session → skip the form, route by the stored role
  useEffect(() => {
    if (!isSupabaseConfigured()) { setChecking(false); return; }
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (data.session) {
        const role = (await getRole()) ?? initialIntent;
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
        <p style={{ color: "var(--mut)", fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 }}>
          This install runs in local mode (no Supabase configured) — your catalog lives in this
          browser. Head straight to the dashboard.
        </p>
        <button className="ph-btn btn-solid" style={{ width: "100%" }} onClick={() => router.push("/dashboard")}>open dashboard</button>
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await signUpWithEmail(email, password);
        if (error) throw error;
        if (!data.session) { setMessage("Check your email to confirm your account, then sign in."); setMode("signin"); return; }
      } else {
        const { error } = await signInWithEmail(email, password);
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

  const input: React.CSSProperties = {
    padding: "13px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)",
    background: "#fff", color: "var(--ink)", fontSize: 15, width: "100%",
  };

  const pill = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "10px 0", fontSize: 13.5, fontWeight: 600, borderRadius: 999, cursor: "pointer",
    border: "1.5px solid " + (on ? "var(--violet)" : "var(--line)"),
    background: on ? "var(--violet)" : "#fff", color: on ? "#fff" : "var(--ink)",
  });

  return (
    <Shell>
      <h1 className="ph-display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 4px" }}>
        {mode === "signin" ? "welcome back" : "create your account"}
      </h1>
      <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6 }}>
        {mode === "signin"
          ? "Sign in to your account."
          : intent === "vendor"
            ? "Set up your shop dashboard."
            : "Save your try-ons and bag, and pick up on any device."}
      </p>

      {/* intent picks the role for a brand-new account only — irrelevant when
          signing in (the stored role wins), so it's hidden there */}
      {mode === "signup" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button type="button" className="ph-btn" style={pill(intent === "shopper")} onClick={() => setIntent("shopper")}>I'm shopping</button>
          <button type="button" className="ph-btn" style={pill(intent === "vendor")} onClick={() => setIntent("vendor")}>I sell on peeq</button>
        </div>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={input} type="email" required maxLength={120} placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input style={input} type="password" required minLength={6} maxLength={72} placeholder="Password (6+ characters)"
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        <button className="ph-btn btn-violet" disabled={busy} type="submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "one moment…" : mode === "signin" ? "sign in" : "sign up"}
        </button>
      </form>
      {message && <div style={{ marginTop: 14, fontSize: 13, color: "var(--camel)" }}>{message}</div>}
      <button className="ph-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
        style={{ color: "var(--stone)", fontSize: 13, marginTop: 18, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </Shell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--sage)" }}>
      <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", padding: "40px 36px", width: 400, maxWidth: "100%", textAlign: "center", boxShadow: "var(--shadow-soft)" }}>
        <div className="wordmark" style={{ fontSize: 20, marginBottom: 22 }}>peeq</div>
        {children}
      </div>
    </main>
  );
}

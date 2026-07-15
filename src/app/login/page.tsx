"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const sb = supabase();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMessage("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/dashboard");
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  const input: React.CSSProperties = {
    padding: "13px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)",
    background: "#fff", color: "var(--ink)", fontSize: 15, width: "100%",
  };

  return (
    <Shell>
      <h1 className="ph-display" style={{ fontSize: 26, color: "var(--forest-deep)", margin: "0 0 4px" }}>
        {mode === "signin" ? "vendor sign in" : "create your shop"}
      </h1>
      <div style={{ color: "var(--mut)", fontSize: 13, marginBottom: 24 }}>
        {mode === "signin"
          ? ""
          : ""}
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={input} type="email" required placeholder="you@shop.com" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input style={input} type="password" required minLength={6} placeholder="Password (6+ characters)"
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        <button className="ph-btn btn-solid" disabled={busy} type="submit"
          style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "one moment…" : mode === "signin" ? "sign in" : "sign up"}
        </button>
      </form>
      {message && (
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--camel)" }}>{message}</div>
      )}
      <button className="ph-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
        style={{ color: "var(--mut)", fontSize: 13, marginTop: 20, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {mode === "signin" ? "New here? Create a shop account" : "Already have an account? Sign in"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--sage)" }}>
      <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", padding: "40px 36px", width: 380, maxWidth: "100%", textAlign: "center", boxShadow: "var(--shadow-soft)" }}>
        <div className="wordmark" style={{ fontSize: 20, marginBottom: 26 }}>peeq</div>
        {children}
      </div>
    </main>
  );
}

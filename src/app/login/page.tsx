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
        <div className="ph-display" style={{ fontSize: 24, marginBottom: 10 }}>No sign-in needed</div>
        <p style={{ color: "rgba(255,255,255,.6)", maxWidth: 380, margin: "0 0 24px" }}>
          This install runs in local mode (no Supabase configured) — your catalog lives in this
          browser. Head straight to the dashboard.
        </p>
        <button className="ph-btn" onClick={() => router.push("/dashboard")}
          style={{ background: "var(--rani)", color: "#fff", padding: "14px 28px", fontSize: 16 }}>
          Open dashboard
        </button>
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
    padding: "13px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 15, width: "100%",
  };

  return (
    <Shell>
      <div className="ph-display" style={{ fontSize: 28, marginBottom: 6 }}>
        {mode === "signin" ? "Vendor sign in" : "Create your shop"}
      </div>
      <p style={{ color: "rgba(255,255,255,.55)", fontSize: 14, margin: "0 0 26px" }}>
        {mode === "signin"
          ? "Manage your catalog and kiosk."
          : "One account per shop — your catalog, kiosk link and analytics."}
      </p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, width: 320, maxWidth: "86vw" }}>
        <input style={input} type="email" required placeholder="you@shop.com" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input style={input} type="password" required minLength={6} placeholder="Password (6+ characters)"
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        <button className="ph-btn" disabled={busy} type="submit"
          style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "14px", fontSize: 16, opacity: busy ? 0.6 : 1 }}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {message && (
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--marigold)", maxWidth: 320, textAlign: "center" }}>
          {message}
        </div>
      )}
      <button className="ph-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}
        style={{ background: "transparent", color: "rgba(255,255,255,.55)", fontSize: 13, marginTop: 18 }}>
        {mode === "signin" ? "New here? Create a shop account" : "Already have an account? Sign in"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: 24, color: "#fff",
      background: "radial-gradient(120% 100% at 50% 0%, #3A2140 0%, var(--ink) 55%)",
    }}>
      <div className="ph-display" style={{ fontSize: 20, marginBottom: 30 }}>
        Pahiran<span style={{ color: "var(--rani-soft)" }}>.</span>
      </div>
      {children}
    </main>
  );
}

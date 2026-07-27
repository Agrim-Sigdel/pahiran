"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getRole, roleHome, updatePassword } from "@/lib/account";

/* Where the "forgot password" email lands.

   Supabase turns the link's token into a real session before this page runs,
   so by the time it renders the visitor is signed in and simply needs to set
   a password. The page has to handle three states: no session (the link
   expired, or someone typed the URL), the form, and done.

   The whole flow — this page, the link on both auth surfaces and in the
   checkout drawer — did not exist. Forgetting a password locked a shopper out
   of their looks and order history and a vendor out of their entire shop,
   permanently, with no route back. */

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72; // bcrypt limit — Supabase truncates beyond this

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pwId = useId();
  const confirmId = useId();

  useEffect(() => {
    if (!isSupabaseConfigured()) { setReady("no-session"); return; }
    /* The recovery token is exchanged for a session asynchronously, so a
       single getSession() on mount can land before it arrives and wrongly
       report an expired link. Listen as well, and let either one win. */
    let settled = false;
    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => {
      if (session && !settled) { settled = true; setReady("ok"); }
    });
    supabase().auth.getSession().then(({ data }) => {
      if (settled) return;
      settled = true;
      setReady(data.session ? "ok" : "no-session");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < PASSWORD_MIN) { setError(`Your new password must be at least ${PASSWORD_MIN} characters.`); return; }
    if (password.length > PASSWORD_MAX) { setError(`Your new password must be ${PASSWORD_MAX} characters or fewer.`); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(/weak|should be/i.test(err.message)
        ? "That password is too weak — try a longer one."
        : "We couldn't set your new password just now — please try again.");
      return;
    }
    setDone(true);
    // straight in, rather than asking them to sign in with what they just typed
    const role = (await getRole()) ?? "shopper";
    setTimeout(() => router.replace(roleHome(role)), 1400);
  };

  const input: React.CSSProperties = {
    padding: "13px 14px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)",
    background: "var(--card)", color: "var(--ink)", fontSize: 15, width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12.5, fontWeight: 600, color: "var(--ink)", textAlign: "left", marginBottom: 5, display: "block",
  };

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <nav className="efc-nav" style={{ background: "var(--paper)" }}>
        <div className="nav-links"><Link href="/">home</Link></div>
        <div className="nav-logo">
          <Link href="/" className="wordmark" style={{ fontSize: "clamp(22px, 5vw, 28px)", textDecoration: "none" }}>
            p<span className="ee">ee</span>q
          </Link>
        </div>
        <div className="nav-tools" />
      </nav>

      <div id="main" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="sheet" style={{ padding: "40px 36px", width: 400, maxWidth: "100%", textAlign: "center" }}>
          {ready === "checking" ? (
            <>
              <span className="ee-mark ee-looking" style={{ fontSize: 40, color: "var(--violet)" }}><span>ee</span></span>
              <p style={{ color: "var(--stone)", marginTop: 12 }}>one moment…</p>
            </>
          ) : ready === "no-session" ? (
            <>
              <h1 className="ph-display" style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 6px" }}>this link has expired</h1>
              <p style={{ color: "var(--stone)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 20px" }}>
                Password links only work once, and only for an hour. Ask for a fresh one and
                we'll send it straight away.
              </p>
              <Link href="/signin" className="ph-btn btn-violet" style={{ width: "100%" }}>back to sign in</Link>
            </>
          ) : done ? (
            <>
              <div className="note-ok">Your new password is set — taking you in…</div>
            </>
          ) : (
            <>
              <h1 className="ph-display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 4px" }}>choose a new password</h1>
              <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6 }}>
                Pick something you'll remember. You'll be signed in straight after.
              </p>
              <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label htmlFor={pwId} style={labelStyle}>New password</label>
                  <div style={{ position: "relative" }}>
                    <input id={pwId} style={{ ...input, paddingRight: 46 }} type={reveal ? "text" : "password"}
                      value={password} maxLength={PASSWORD_MAX} autoComplete="new-password" autoFocus
                      placeholder={`at least ${PASSWORD_MIN} characters`}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }} />
                    <button type="button" className="ph-btn" onClick={() => setReveal((v) => !v)}
                      aria-label={reveal ? "Hide password" : "Show password"} aria-pressed={reveal}
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: 8, color: "var(--stone)", fontSize: 16 }}>
                      <Icon name="eye" />
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor={confirmId} style={labelStyle}>Type it again</label>
                  <input id={confirmId} style={input} type={reveal ? "text" : "password"}
                    value={confirm} maxLength={PASSWORD_MAX} autoComplete="new-password"
                    onChange={(e) => { setConfirm(e.target.value); setError(""); }} />
                </div>
                {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--danger)", fontWeight: 600, textAlign: "left" }}>{error}</div>}
                <button className="ph-btn btn-violet" type="submit" disabled={busy} style={{ width: "100%", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "one moment…" : "set my password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, signOut, getContact, saveContact } from "@/lib/account";
import {
  listLooks, deleteLook, setLookFavorite, clearAllLooks, lookImageURL, shareLook,
  deviceLooksCount, migrateDeviceLooksToCloud, type SavedLook,
} from "@/lib/looks";
import { npr } from "@/lib/constants";
import { nameError, phoneError, fieldErrorStyle } from "@/lib/validate";

/* Shopper account hub — your saved try-ons, contact details (for one-tap
   checkout), and full deletion, all synced to your account and available on
   any device. Signing in itself happens on /signin; a signed-out visitor is
   forwarded there. */

export default function AccountPage() {
  const { user, loading, configured } = useAccount();
  const router = useRouter();

  // signed-out shoppers sign in on the unified page
  useEffect(() => {
    if (configured && !loading && !user) router.replace("/signin");
  }, [configured, loading, user, router]);

  if (!configured) {
    return (
      <Shell>
        <h1 className="ph-display" style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 6px" }}>accounts aren't on yet</h1>
        <p style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          This install runs in local mode — your saved looks live on this device only. Accounts turn on
          once the shop connects its cloud backend.
        </p>
        <Link href="/" className="btn-violet" style={{ width: "100%" }}>back home</Link>
      </Shell>
    );
  }

  if (loading || !user) {
    return (
      <Shell>
        <span className="ee-mark ee-looking" style={{ fontSize: 40, color: "var(--violet)" }}><span>ee</span></span>
        <p style={{ color: "var(--stone)", marginTop: 12 }}>one moment…</p>
      </Shell>
    );
  }

  return <SignedIn email={user.email || ""} />;
}

/* ---------- signed in: contact + saved looks ---------- */

function SignedIn({ email }: { email: string }) {
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [savedMsg, setSavedMsg] = useState(false);
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [pendingLooks, setPendingLooks] = useState(0); // device looks to offer up
  const [merging, setMerging] = useState(false);
  const urls = useRef<Map<string, string>>(new Map());

  const refresh = async () => setLooks(await listLooks());

  useEffect(() => {
    getContact().then((c) => c && setContact(c));
    refresh();
    deviceLooksCount().then(setPendingLooks);
    const map = urls.current;
    return () => { map.forEach((u) => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); }); };
  }, []);

  const mergeDeviceLooks = async () => {
    setMerging(true);
    try {
      await migrateDeviceLooksToCloud();
      setPendingLooks(0);
      await refresh();
    } finally {
      setMerging(false);
    }
  };

  const imgSrc = (l: SavedLook) => {
    if (!urls.current.has(l.id)) urls.current.set(l.id, lookImageURL(l));
    return urls.current.get(l.id)!;
  };

  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  // both fields are optional prefill data — validated only when filled in
  const saveInfo = async () => {
    const next = {
      name: contact.name.trim() ? nameError(contact.name) ?? undefined : undefined,
      phone: phoneError(contact.phone, { required: false }) ?? undefined,
    };
    setErrors(next);
    if (next.name || next.phone) return;
    await saveContact({ name: contact.name.trim(), phone: contact.phone.trim() });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 1600);
  };

  const input: React.CSSProperties = {
    padding: "11px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 14, width: "100%",
  };

  const sorted = looks ? [...looks].sort((a, b) => Number(b.favorite) - Number(a.favorite)) : [];

  return (
    <main style={{ minHeight: "100vh", background: "var(--sage)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "var(--paper)", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="wordmark" style={{ fontSize: 20 }}>peeq</div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>{email}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" className="ph-btn" style={{ fontSize: 13, color: "var(--stone)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999 }}>home</Link>
          <button className="ph-btn" onClick={async () => { await signOut(); window.location.href = "/"; }}
            style={{ fontSize: 13, color: "var(--stone)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999 }}>sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 50px" }}>
        {/* looks saved on this device before signing in — offer to keep them */}
        {pendingLooks > 0 && (
          <section style={{ background: "var(--butter)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "16px 20px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="ph-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
                {pendingLooks} look{pendingLooks !== 1 ? "s" : ""} saved on this device
              </div>
              <div style={{ fontSize: 13, color: "var(--ink)", opacity: 0.75, marginTop: 2 }}>
                Add them to your account so they're on every device you sign in on.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="ph-btn btn-violet" onClick={mergeDeviceLooks} disabled={merging} style={{ opacity: merging ? 0.6 : 1 }}>
                {merging ? "adding…" : "add to my account"}
              </button>
              <button className="ph-btn" onClick={() => setPendingLooks(0)} disabled={merging}
                style={{ fontSize: 13, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                not now
              </button>
            </div>
          </section>
        )}

        {/* contact for one-tap checkout */}
        <section style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "20px 22px", marginBottom: 26 }}>
          <h2 className="ph-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>your details</h2>
          <p style={{ fontSize: 13, color: "var(--stone)", margin: "0 0 14px" }}>Saved for one-tap checkout — never shown to other shoppers.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              <input style={{ ...input, borderColor: errors.name ? "var(--camel)" : "var(--line)" }} placeholder="Your name" maxLength={80} value={contact.name} aria-invalid={!!errors.name}
                onChange={(e) => { setContact((c) => ({ ...c, name: e.target.value })); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }} />
              {errors.name && <div style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.name}</div>}
            </div>
            <div>
              <input style={{ ...input, borderColor: errors.phone ? "var(--camel)" : "var(--line)" }} placeholder="Phone number" maxLength={30} inputMode="tel" value={contact.phone} aria-invalid={!!errors.phone}
                onChange={(e) => { setContact((c) => ({ ...c, phone: e.target.value.replace(/[^0-9+ ]/g, "") })); if (errors.phone) setErrors((x) => ({ ...x, phone: undefined })); }} />
              {errors.phone && <div style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.phone}</div>}
            </div>
          </div>
          <button className="ph-btn btn-violet" onClick={saveInfo} style={{ marginTop: 14, padding: "10px 22px" }}>
            {savedMsg ? "✓ saved" : "save details"}
          </button>
        </section>

        {/* saved looks */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: 0 }}>your saved looks</h2>
          {looks && looks.length > 0 && (
            <button className="ph-btn" onClick={async () => { if (confirm("Delete all your saved looks and photo? This can't be undone.")) { await clearAllLooks(); refresh(); } }}
              style={{ fontSize: 12.5, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3 }}>delete everything</button>
          )}
        </div>

        {looks === null ? (
          <p style={{ color: "var(--stone)" }}>loading…</p>
        ) : looks.length === 0 ? (
          <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: 40, textAlign: "center", color: "var(--stone)" }}>
            No looks yet — try something on and tap “save look”.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
            {sorted.map((l) => (
              <div key={l.id} style={{ background: "var(--cream)", borderRadius: 16, overflow: "hidden", border: "1px solid " + (l.favorite ? "var(--violet)" : "var(--line)") }}>
                <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--sage-mist)" }}>
                  <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button className="ph-btn" onClick={async () => { await setLookFavorite(l.id, !l.favorite); refresh(); }}
                    style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,.9)", color: l.favorite ? "var(--violet)" : "var(--stone)", fontSize: 15, padding: "5px 9px", borderRadius: 999 }}>
                    {l.favorite ? "♥" : "♡"}
                  </button>
                </div>
                <div style={{ padding: "10px 12px 12px", fontSize: 12.5 }}>
                  <b>{l.garmentName}</b>
                  <div style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(l.price)}</div>
                  {l.shopName && <div style={{ fontSize: 10.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="ph-btn" onClick={() => shareLook(l).catch(() => {})}
                      style={{ flex: 1, border: "1.5px solid var(--ink)", color: "var(--ink)", fontSize: 12, padding: "6px 0", fontWeight: 600, borderRadius: 999 }}>share</button>
                    <button className="ph-btn" onClick={async () => { await deleteLook(l.id); refresh(); }}
                      style={{ color: "var(--stone)", fontSize: 11.5, padding: "6px 8px" }}>delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--sage)" }}>
      <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", padding: "36px 32px", width: 400, maxWidth: "100%", textAlign: "center", boxShadow: "var(--shadow-soft)" }}>
        {children}
      </div>
    </main>
  );
}

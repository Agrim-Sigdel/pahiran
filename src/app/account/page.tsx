"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, signOut, getContact, saveContact } from "@/lib/account";
import {
  listLooks, deleteLook, setLookFavorite, clearAllLooks, lookImageURL, shareLook,
  deviceLooksCount, migrateDeviceLooksToCloud, type SavedLook,
} from "@/lib/looks";
import { getMyOrders } from "@/lib/storage";
import type { OrderHistoryLine } from "@/lib/types";
import { npr } from "@/lib/constants";
import Icon from "@/components/Icon";
import LookViewer from "@/components/LookViewer";
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
  const [viewing, setViewing] = useState<SavedLook | null>(null);
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
    padding: "11px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 14, width: "100%",
  };

  const sorted = looks ? [...looks].sort((a, b) => Number(b.favorite) - Number(a.favorite)) : [];

  return (
    <main style={{ minHeight: "100vh", background: "var(--sage)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "var(--paper)", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="wordmark" style={{ fontSize: 20 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>
          <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>{email}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/" className="ph-btn" style={{ fontSize: 13, color: "var(--stone)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999 }}>home</Link>
          <button className="ph-btn" onClick={async () => { await signOut(); window.location.href = "/"; }}
            style={{ fontSize: 13, color: "var(--stone)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 999 }}>sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 50px" }}>
        {/* looks saved on this device before signing in — offer to keep them */}
        {pendingLooks > 0 && (
          <section style={{ background: "var(--butter)", color: "var(--on-light)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "16px 20px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="ph-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--on-light)" }}>
                {pendingLooks} look{pendingLooks !== 1 ? "s" : ""} saved on this device
              </div>
              <div style={{ fontSize: 13, color: "var(--on-light)", opacity: 0.75, marginTop: 2 }}>
                Add them to your account so they're on every device you sign in on.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="ph-btn btn-violet" onClick={mergeDeviceLooks} disabled={merging} style={{ opacity: merging ? 0.6 : 1 }}>
                {merging ? "adding…" : "add to my account"}
              </button>
              <button className="ph-btn" onClick={() => setPendingLooks(0)} disabled={merging}
                style={{ fontSize: 13, color: "var(--on-light)", textDecoration: "underline", textUnderlineOffset: 3 }}>
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
              <input style={{ ...input, borderColor: errors.name ? "var(--danger)" : "var(--line)" }} placeholder="Your name" maxLength={80} value={contact.name} aria-invalid={!!errors.name}
                onChange={(e) => { setContact((c) => ({ ...c, name: e.target.value })); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }} />
              {errors.name && <div style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.name}</div>}
            </div>
            <div>
              <input style={{ ...input, borderColor: errors.phone ? "var(--danger)" : "var(--line)" }} placeholder="Phone number" maxLength={30} inputMode="tel" value={contact.phone} aria-invalid={!!errors.phone}
                onChange={(e) => { setContact((c) => ({ ...c, phone: e.target.value.replace(/[^0-9+ ]/g, "") })); if (errors.phone) setErrors((x) => ({ ...x, phone: undefined })); }} />
              {errors.phone && <div style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.phone}</div>}
            </div>
          </div>
          <button className="ph-btn btn-violet" onClick={saveInfo} style={{ marginTop: 14, padding: "10px 22px" }}>
            {savedMsg ? <><Icon name="check" /> saved</> : "save details"}
          </button>
        </section>

        {/* orders placed from a storefront bag while signed in */}
        <OrdersSection />

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
                  <button onClick={() => setViewing(l)} title={l.garmentName}
                    style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                    <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                  <button className="ph-btn" onClick={async () => { await setLookFavorite(l.id, !l.favorite); refresh(); }}
                    style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,.9)", color: l.favorite ? "var(--violet)" : "var(--stone)", fontSize: 15, padding: "5px 9px", borderRadius: 999 }}>
                    <Icon name={l.favorite ? "heart-filled" : "heart"} />
                  </button>
                </div>
                <div style={{ padding: "10px 12px 12px", fontSize: 12.5 }}>
                  <b>{l.garmentName}</b>
                  <div style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(l.price)}</div>
                  {l.shopName && <div style={{ fontSize: 10.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="ph-btn" onClick={() => shareLook(l).catch(() => {})}
                      style={{ flex: 1, border: "1.5px solid var(--ink)", color: "var(--ink)", fontSize: 12, padding: "6px 0", fontWeight: 600, borderRadius: 999 }}>share</button>
                    <button className="ph-btn" onClick={async () => {
                      if (!confirm("Delete this look? This can't be undone.")) return;
                      await deleteLook(l.id); refresh();
                    }}
                      style={{ color: "var(--stone)", fontSize: 11.5, padding: "6px 8px" }}>delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <LookViewer look={viewing} src={imgSrc(viewing)} onClose={() => setViewing(null)}
          onDelete={async () => { await deleteLook(viewing.id); refresh(); }} />
      )}
    </main>
  );
}

/* ---------- order history ----------
   Lines of one bag share an orderRef, so they regroup into one order here the
   same way they do in the vendor's inbox. Only orders placed while signed in
   appear: a guest order is deliberately unclaimable, since matching on a typed
   phone number would hand anyone a stranger's history. */

function OrdersSection() {
  const [lines, setLines] = useState<OrderHistoryLine[] | null>(null);

  useEffect(() => { getMyOrders().then(setLines).catch(() => setLines([])); }, []);

  const orders = useMemo(() => {
    if (!lines) return [];
    const map = new Map<string, OrderHistoryLine[]>();
    for (const l of lines) {
      const key = l.orderRef ? "ref:" + l.orderRef : "solo:" + l.id;
      const group = map.get(key);
      if (group) group.push(l);
      else map.set(key, [l]);
    }
    return Array.from(map.entries()).map(([key, ls]) => ({
      key,
      ref: ls[0].orderRef,
      shopName: ls[0].shopName,
      shopSlug: ls[0].shopSlug,
      createdAt: ls[0].createdAt,
      kind: ls[0].kind,
      /* The vendor closes each line as they deal with it, so an order counts as
         confirmed only once none of it is still waiting. */
      confirmed: ls.every((l) => l.handled),
      total: ls.reduce((n, l) => n + l.unitPrice * l.qty, 0),
      lines: ls,
    }));
  }, [lines]);

  if (lines === null) {
    return (
      <section style={{ marginBottom: 26 }}>
        <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" }}>your orders</h2>
        <p style={{ color: "var(--stone)" }}>loading…</p>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section style={{ marginBottom: 26 }}>
        <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" }}>your orders</h2>
        <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: 30, textAlign: "center", color: "var(--stone)", fontSize: 14, lineHeight: 1.6 }}>
          No orders yet — anything you check out from a shop's bag while signed in shows up here.
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 26 }}>
      <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" }}>your orders</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.map((o) => (
          <div key={o.key} style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                  {o.shopSlug
                    ? <Link href={`/s/${o.shopSlug}`} style={{ color: "var(--ink)", textDecoration: "none" }}>{o.shopName}</Link>
                    : o.shopName}
                </div>
                <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>
                  {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {o.ref && <span style={{ marginLeft: 8, fontFamily: "ui-monospace, monospace" }}>{o.ref}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{npr(o.total)}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: o.confirmed ? "var(--violet)" : "var(--stone)" }}>
                  {o.confirmed ? "confirmed by shop" : o.kind === "enquiry" ? "enquiry sent" : "waiting for the shop"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {o.lines.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {l.image
                    ? <img src={l.image} alt="" style={{ width: 38, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "var(--sage-mist)" }} />
                    : <div style={{ width: 38, height: 48, borderRadius: 8, background: "var(--line)", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--ink)" }}>
                    <b style={{ color: "var(--stone)" }}>{l.qty}×</b> {l.garmentName}
                    {l.size && <span style={{ color: "var(--stone)", marginLeft: 6 }}>size {l.size}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--stone)", flexShrink: 0 }}>{npr(l.unitPrice * l.qty)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--stone)", margin: "10px 2px 0", lineHeight: 1.5 }}>
        peeq doesn't take payment — each shop confirms price, payment and delivery with you directly.
      </p>
    </section>
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

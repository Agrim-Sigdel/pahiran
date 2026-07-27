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
import AccountMenu from "@/components/AccountMenu";
import { confirmAsync } from "@/components/Dialog";
import { toastFailure, toastOk } from "@/lib/toast";
import { nameError, phoneError, fieldErrorStyle } from "@/lib/validate";
import { formatDate } from "@/lib/format";

/* Shopper account hub — your saved try-ons, contact details (for one-tap
   checkout), and full deletion, all synced to your account and available on
   any device. Signing in itself happens on /signin; a signed-out visitor is
   forwarded there. */

/* "not now" on the device-looks banner has to survive a reload, or the same
   question gets asked on every visit forever. */
const MERGE_DISMISSED = "peeq:merge-dismissed";

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
    let dismissed = false;
    try { dismissed = localStorage.getItem(MERGE_DISMISSED) === "1"; } catch {}
    if (!dismissed) deviceLooksCount().then(setPendingLooks);
    const map = urls.current;
    return () => { map.forEach((u) => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); }); };
  }, []);

  const mergeDeviceLooks = async () => {
    setMerging(true);
    try {
      await migrateDeviceLooksToCloud();
      setPendingLooks(0);
      await refresh();
    } catch (e) {
      toastFailure("Could not add those looks to your account", e);
    } finally {
      setMerging(false);
    }
  };

  const dismissMerge = () => {
    setPendingLooks(0);
    try { localStorage.setItem(MERGE_DISMISSED, "1"); } catch {}
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
    /* saveContact could reject and nothing happened at all — the button still
       said "saved ✓" because that was on a timer, not on the result. */
    try {
      await saveContact({ name: contact.name.trim(), phone: contact.phone.trim() });
    } catch (e) {
      toastFailure("Could not save your details", e);
      return;
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 1600);
  };

  const input: React.CSSProperties = {
    padding: "11px 14px", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 14, width: "100%",
  };

  const sorted = looks ? [...looks].sort((a, b) => Number(b.favorite) - Number(a.favorite)) : [];

  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      {/* .efc-nav, like every other page. This header was hand-rolled: the
          wordmark wasn't a link home (it is everywhere else in the product),
          and there was no AccountMenu, so the account page was the one page
          you couldn't reach your account from. */}
      <nav className="efc-nav">
        <div className="nav-links">
          <Link href="/">shops</Link>
        </div>
        <div className="nav-logo">
          <Link href="/" className="wordmark" style={{ fontSize: 20, textDecoration: "none" }}>
            p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q
          </Link>
        </div>
        <div className="nav-tools">
          <span className="hide-sm" style={{ fontSize: 12.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{email}</span>
          <AccountMenu />
          <button className="ph-btn" onClick={async () => { await signOut(); window.location.href = "/"; }}
            style={{ fontSize: 13, color: "var(--stone)", padding: "8px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)" }}>sign out</button>
        </div>
      </nav>

      <div id="main" style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 50px" }}>
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
              {/* Remembered. "not now" only cleared local state, so the same
                  banner asked the same question on every single visit — which
                  reads as the app not listening. */}
              <button className="ph-btn" onClick={dismissMerge} disabled={merging}
                style={{ fontSize: 13, color: "var(--on-light)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                not now
              </button>
            </div>
          </section>
        )}

        {/* contact for one-tap checkout */}
        <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "20px 22px", marginBottom: 26 }}>
          <h2 className="ph-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: "0 0 4px" }}>your details</h2>
          <p style={{ fontSize: 13, color: "var(--stone)", margin: "0 0 14px" }}>Saved for one-tap checkout — never shown to other shoppers.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label className="field">Your name
              <input style={{ ...input, borderColor: errors.name ? "var(--danger)" : "var(--line)" }}
                placeholder="e.g. Sunita Shrestha" maxLength={80} value={contact.name} autoComplete="name"
                aria-invalid={!!errors.name} aria-describedby={errors.name ? "acct-name-err" : undefined}
                onChange={(e) => { setContact((c) => ({ ...c, name: e.target.value })); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }} />
              {errors.name && <div id="acct-name-err" style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.name}</div>}
            </label>
            <label className="field">Phone number
              <input style={{ ...input, borderColor: errors.phone ? "var(--danger)" : "var(--line)" }}
                placeholder="98XXXXXXXX" maxLength={30} inputMode="tel" value={contact.phone} autoComplete="tel"
                aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "acct-phone-err" : undefined}
                onChange={(e) => { setContact((c) => ({ ...c, phone: e.target.value.replace(/[^0-9+ ]/g, "") })); if (errors.phone) setErrors((x) => ({ ...x, phone: undefined })); }} />
              {errors.phone && <div id="acct-phone-err" style={{ ...fieldErrorStyle, marginTop: 4 }}>{errors.phone}</div>}
            </label>
          </div>
          <button className="ph-btn btn-violet" onClick={saveInfo} style={{ marginTop: 14, padding: "10px 22px" }}>
            {savedMsg ? <><Icon name="check" /> saved</> : "save details"}
          </button>
          {/* The label swapping to "saved ✓" for 1600ms was the only feedback,
              and a screen reader was never told. */}
          <span role="status" aria-live="polite" className="sr-only">{savedMsg ? "Your details are saved." : ""}</span>
        </section>

        {/* orders placed from a storefront bag while signed in */}
        <OrdersSection />

        {/* saved looks */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: 0 }}>your saved looks</h2>
          {looks && looks.length > 0 && (
            /* The most destructive control on the page was a 12.5px grey
               underlined link — quieter than "share" two rows below it. */
            <button className="ph-btn"
              onClick={async () => {
                const ok = await confirmAsync({
                  title: "Delete everything?",
                  body: "All your saved looks and your remembered photo will be deleted from your account and this device. This can't be undone.",
                  confirmLabel: "Delete everything", destructive: true,
                });
                if (!ok) return;
                try { await clearAllLooks(); await refresh(); toastOk("Deleted."); }
                catch (e) { toastFailure("Could not delete your looks", e); }
              }}
              style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-btn)", padding: "8px 16px" }}>delete everything</button>
          )}
        </div>

        {looks === null ? (
          <p style={{ color: "var(--stone)" }}>loading…</p>
        ) : looks.length === 0 ? (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: 40, textAlign: "center", color: "var(--stone)" }}>
            No looks yet — try something on and tap “save look”.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
            {sorted.map((l) => (
              <div key={l.id} style={{ background: "var(--card)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid " + (l.favorite ? "var(--violet)" : "var(--line)") }}>
                <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)" }}>
                  <button onClick={() => setViewing(l)} title={l.garmentName}
                    style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                    <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} className="img-blend" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                  {/* var(--card), not a hardcoded white: --stone is #C7B299 in
                      dark mode, so a stone glyph on a fixed white pill was 2.0:1
                      — the same bug the kiosk's copy of this control already
                      avoids by using the token. */}
                  <button className="ph-btn"
                    aria-label={l.favorite ? "Remove from favourites" : "Add to favourites"} aria-pressed={l.favorite}
                    onClick={async () => {
                      try { await setLookFavorite(l.id, !l.favorite); refresh(); }
                      catch (e) { toastFailure("Could not update that look", e); }
                    }}
                    style={{ position: "absolute", top: 8, right: 8, background: "var(--card)", border: "1px solid var(--line)", color: l.favorite ? "var(--violet)" : "var(--stone)", fontSize: 15, padding: "6px 10px", borderRadius: "var(--radius-pill)" }}>
                    <Icon name={l.favorite ? "heart-filled" : "heart"} />
                  </button>
                </div>
                <div style={{ padding: "10px 12px 12px", fontSize: 12.5 }}>
                  <b>{l.garmentName}</b>
                  <div style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(l.price)}</div>
                  {l.shopName && <div style={{ fontSize: 12, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button className="ph-btn" onClick={() => shareLook(l).catch(() => toastFailure("Could not share that look"))}
                      style={{ flex: 1, border: "1.5px solid var(--ink)", color: "var(--ink)", fontSize: 12.5, padding: "8px 0", fontWeight: 600, borderRadius: "var(--radius-pill)" }}>share</button>
                    <button className="ph-btn" onClick={async () => {
                      const ok = await confirmAsync({
                        title: "Delete this look?", body: "“" + l.garmentName + "” will be gone from every device. This can't be undone.",
                        confirmLabel: "Delete", destructive: true,
                      });
                      if (!ok) return;
                      try { await deleteLook(l.id); refresh(); }
                      catch (e) { toastFailure("Could not delete that look", e); }
                    }}
                      style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, padding: "8px 10px" }}>delete</button>
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
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /* A failed fetch used to become `[]`, which the empty state then reported as
     "No orders yet" — a shopper whose connection dropped was told, in the
     product's own voice, that they had never ordered anything. */
  useEffect(() => {
    let live = true;
    setFailed(false);
    getMyOrders()
      .then((l) => { if (live) setLines(l); })
      .catch(() => { if (live) { setFailed(true); setLines([]); } });
    return () => { live = false; };
  }, [reloadKey]);

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

  if (failed) {
    return (
      <section style={{ marginBottom: 26 }}>
        <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" }}>your orders</h2>
        <div role="alert" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)", borderRadius: "var(--radius-card)", padding: "20px 24px", textAlign: "center", color: "var(--ink)", fontSize: 14, lineHeight: 1.6 }}>
          We couldn't load your orders just now — this isn't the same as having none.
          <div>
            <button className="ph-btn" onClick={() => { setLines(null); setReloadKey((k) => k + 1); }}
              style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section style={{ marginBottom: 26 }}>
        <h2 className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 12px" }}>your orders</h2>
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: 30, textAlign: "center", color: "var(--stone)", fontSize: 14, lineHeight: 1.6 }}>
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
          <div key={o.key} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                  {o.shopSlug
                    ? <Link href={`/s/${o.shopSlug}`} style={{ color: "var(--ink)", textDecoration: "none" }}>{o.shopName}</Link>
                    : o.shopName}
                </div>
                <div style={{ fontSize: 12, color: "var(--stone)", marginTop: 2 }}>
                  {formatDate(o.createdAt)}
                  {o.ref && <span style={{ marginLeft: 8, fontFamily: "ui-monospace, monospace" }}>{o.ref}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{npr(o.total)}</div>
                {/* --ok is the token for "this went through". --violet means
                    "you can interact with this", and a status is not a link. */}
                <div style={{ fontSize: 12, fontWeight: 600, color: o.confirmed ? "var(--ok)" : "var(--stone)" }}>
                  {o.confirmed ? "confirmed by shop" : o.kind === "enquiry" ? "enquiry sent" : "waiting for the shop"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {o.lines.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {l.image
                    ? <img src={l.image} alt="" style={{ width: 38, height: 48, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0, background: "var(--paper-deep)" }} />
                    : <div style={{ width: 38, height: 48, borderRadius: "var(--radius-sm)", background: "var(--line)", flexShrink: 0 }} />}
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
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--paper)" }}>
      <div className="sheet" style={{ padding: "36px 32px", width: 400, maxWidth: "100%", textAlign: "center" }}>
        {children}
      </div>
    </main>
  );
}

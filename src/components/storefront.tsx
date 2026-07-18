"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { npr, waLink, CHECKOUT } from "@/lib/constants";
import { submitLead } from "@/lib/storage";
import { useCart, type CartLine } from "@/lib/cart";
import type { Garment, Shop } from "@/lib/types";

/* Shared storefront building blocks — used by both the collection page
   (/s/[slug]) and the product page (/s/[slug]/[garment]) so cards, the
   wishlist heart, and the cart drawer behave identically everywhere. */

export type CartApi = ReturnType<typeof useCart>;

/* ---------- save-for-later heart ---------- */

export function HeartButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button className="ph-btn" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      aria-label={saved ? "Remove from saved" : "Save for later"} aria-pressed={saved}
      style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,.9)", color: saved ? "var(--violet)" : "var(--stone)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
      {saved ? "♥" : "♡"}
    </button>
  );
}

/* ---------- product card (links to the product page) ---------- */

export function ShopCard({ g, slug, saved, onToggleSave, onAdd }: {
  g: Garment; slug: string; saved: boolean; onToggleSave: () => void; onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  const needsSize = g.sizes.length > 1; // pick a size on the product page first
  const href = `/s/${slug}/${encodeURIComponent(g.id)}`;

  const quickAdd = () => {
    onAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="fade-up" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden", opacity: g.inStock ? 1 : 0.6, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "3/4", background: "var(--sage-mist)" }}>
        <Link href={href} style={{ position: "absolute", inset: 0, display: "block" }}>
          <img src={g.image} alt={g.name} loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: g.inStock ? "none" : "grayscale(.7)" }} />
          {!g.inStock && (
            <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--ink)", color: "var(--paper)", fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 999 }}>
              out of stock
            </span>
          )}
        </Link>
        <HeartButton saved={saved} onClick={onToggleSave} />
      </div>
      <div style={{ padding: "13px 14px 15px", display: "flex", flexDirection: "column", flex: 1 }}>
        <Link href={href} style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2, color: "var(--ink)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</Link>
        <div style={{ color: "var(--stone)", fontWeight: 500, fontSize: 14, marginBottom: 12 }}>{npr(g.price)}</div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {g.inStock ? (
            needsSize ? (
              <Link href={href} className="ph-btn"
                style={{ background: "var(--violet)", color: "#fff", fontWeight: 700, fontFamily: "'Baloo 2', cursive", fontSize: 14, padding: "10px 0", borderRadius: 999, width: "100%", textAlign: "center", textDecoration: "none" }}>
                choose size
              </Link>
            ) : (
              <button className="ph-btn" onClick={quickAdd}
                style={{ background: "var(--violet)", color: "#fff", fontWeight: 700, fontFamily: "'Baloo 2', cursive", fontSize: 14, padding: "10px 0", borderRadius: 999, width: "100%" }}>
                {added ? "✓ added" : "add to bag"}
              </button>
            )
          ) : (
            <button className="ph-btn" disabled style={{ background: "var(--line)", color: "var(--stone)", fontWeight: 700, fontFamily: "'Baloo 2', cursive", fontSize: 14, padding: "10px 0", borderRadius: 999, width: "100%", cursor: "not-allowed" }}>
              sold out
            </button>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href={`/k/${slug}?g=${encodeURIComponent(g.id)}`}
              style={{ textDecoration: "underline", textUnderlineOffset: 4, fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>
              see it on you →
            </Link>
            <Link href={href} className="ph-btn" style={{ color: "var(--stone)", fontSize: 12, textDecoration: "none" }}>
              details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- cart drawer + checkout (WhatsApp + leads, env-toggleable) ---------- */

export function CartDrawer({ shop, cart, catalog, defaultName, defaultPhone, loggedIn, onClose, onKeepShopping }: {
  shop: Shop; cart: CartApi; catalog: Garment[];
  defaultName?: string; defaultPhone?: string; loggedIn?: boolean;
  onClose: () => void; onKeepShopping: () => void;
}) {
  const [name, setName] = useState(defaultName || "");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [state, setState] = useState<"cart" | "sending" | "done">("cart");

  useEffect(() => { if (defaultName && !name) setName(defaultName); }, [defaultName]);
  useEffect(() => { if (defaultPhone && !phone) setPhone(defaultPhone); }, [defaultPhone]);

  const canWa = CHECKOUT.whatsapp && !!waLink(shop.whatsapp, "x");
  const canLead = CHECKOUT.leads;
  const canCheckout = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7;

  const orderMessage = (): string => {
    const lines = cart.lines
      .map((l) => `• ${l.qty}× ${l.name}${l.size ? ` — size ${l.size}` : ""} — ${npr(l.price * l.qty)}`)
      .join("\n");
    return (
      `Namaste! I'd like to order from ${shop.name || "your shop"} (via peeq):\n\n` +
      `${lines}\n\nTotal: ${npr(cart.total)}\n\nName: ${name.trim()}\nPhone: ${phone.trim()}`
    );
  };

  const checkout = async () => {
    if (!canCheckout) return;
    setState("sending");
    if (canLead) {
      for (const l of cart.lines) {
        const g = catalog.find((x) => x.id === l.garmentId);
        if (!g) continue;
        try {
          await submitLead(shop, g, { name: name.trim(), phone: phone.trim(), size: l.size });
        } catch { /* WhatsApp is the reliable path */ }
      }
    }
    if (canWa) {
      const link = waLink(shop.whatsapp, orderMessage());
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    }
    cart.clear();
    setState("done");
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,.45)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--cream)", width: 420, maxWidth: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <span className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
            {state === "done" ? "order sent" : `your bag (${cart.count})`}
          </span>
          <button className="ph-btn" onClick={onClose} aria-label="Close" style={{ fontSize: 18, color: "var(--stone)", padding: 6 }}>✕</button>
        </div>

        {state === "done" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 28 }}>
            <div style={{ fontSize: 44 }}>🛍</div>
            <div className="ph-display" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>the shop has your order</div>
            <p style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6, maxWidth: 300, margin: 0 }}>
              {canWa
                ? "We opened WhatsApp with your order — send that message to confirm. The shop will reply about payment and delivery."
                : "The shop has your order and will reach out to confirm payment and delivery."}
            </p>
            <button className="ph-btn btn-violet" onClick={onKeepShopping} style={{ marginTop: 4 }}>keep shopping</button>
          </div>
        ) : cart.lines.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 28 }}>
            <div style={{ fontSize: 40, opacity: 0.5 }}>🛍</div>
            <p style={{ color: "var(--stone)", fontSize: 14, margin: 0 }}>Your bag is empty.</p>
            <button className="ph-btn btn-violet" onClick={onKeepShopping}>browse the collection</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {cart.lines.map((l) => (
                <CartRow key={l.garmentId + l.size} line={l}
                  onQty={(q) => cart.setQty(l.garmentId, l.size, q)}
                  onRemove={() => cart.remove(l.garmentId, l.size)} />
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "16px 20px 20px", background: "var(--card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <span style={{ fontSize: 14, color: "var(--stone)" }}>Total</span>
                <span className="ph-display" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>{npr(cart.total)}</span>
              </div>
              {loggedIn === false && (
                <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 10, textAlign: "center" }}>
                  <Link href="/account" style={{ color: "var(--violet)", fontWeight: 600, textUnderlineOffset: 3 }}>Sign in</Link> to save your bag and skip typing next time.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                  style={{ padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 15 }} />
                <input value={phone} maxLength={30} inputMode="tel" onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ""))} placeholder="Phone number"
                  style={{ padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", fontSize: 15 }} />
                <button className="ph-btn" disabled={!canCheckout || state === "sending"} onClick={checkout}
                  style={{ background: canWa ? "var(--whatsapp)" : "var(--violet)", color: "#fff", fontWeight: 700, fontFamily: "'Baloo 2', cursive", fontSize: 16, padding: "14px 0", borderRadius: 999, opacity: !canCheckout || state === "sending" ? 0.6 : 1 }}>
                  {state === "sending" ? "sending…" : canWa ? "place order on WhatsApp" : "place order"}
                </button>
                <button className="ph-btn" onClick={onKeepShopping} style={{ color: "var(--stone)", fontSize: 13, padding: 6 }}>
                  keep shopping
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--stone)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
                No online payment — the shop confirms price, payment and delivery with you directly.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CartRow({ line, onQty, onRemove }: { line: CartLine; onQty: (q: number) => void; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <img src={line.image} alt={line.name} style={{ width: 62, height: 82, objectFit: "cover", borderRadius: 12, background: "var(--sage-mist)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</div>
        {line.size && <div style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 1 }}>Size {line.size}</div>}
        <div style={{ fontSize: 13, color: "var(--stone)", fontWeight: 500, marginTop: 2 }}>{npr(line.price)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden" }}>
            <button className="ph-btn" onClick={() => onQty(line.qty - 1)} aria-label="Decrease" style={{ width: 32, height: 32, fontSize: 16, color: "var(--ink)" }}>−</button>
            <span style={{ minWidth: 24, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{line.qty}</span>
            <button className="ph-btn" onClick={() => onQty(line.qty + 1)} aria-label="Increase" style={{ width: 32, height: 32, fontSize: 16, color: "var(--ink)" }}>+</button>
          </div>
          <button className="ph-btn" onClick={onRemove} style={{ fontSize: 12, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3 }}>remove</button>
        </div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{npr(line.price * line.qty)}</div>
    </div>
  );
}

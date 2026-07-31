"use client";

import { useState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { npr, waLink, CHECKOUT, STOREFRONT_DEFAULTS } from "@/lib/constants";
import { submitOrder } from "@/lib/storage";
import { signInWithEmail, signUpWithEmail, sendPasswordReset, ensureRole, saveContact } from "@/lib/account";
import { isSupabaseConfigured } from "@/lib/supabase";
import { nameError, phoneError, fieldErrorStyle } from "@/lib/validate";
import { useCart, type CartLine } from "@/lib/cart";
import GarmentImage from "@/components/GarmentImage";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";
import TryOnCta, { offersTryOn, type TryOnState } from "@/components/TryOnCta";
import Icon from "@/components/Icon";
import Dialog from "@/components/Dialog";
import type { Garment, Shop, StorefrontConfig, SlotImage } from "@/lib/types";

/* Shared storefront building blocks — used by both the collection page
   (/s/[slug]) and the product page (/s/[slug]/[garment]) so cards, the
   wishlist heart, and the cart drawer behave identically everywhere.

   The customisable sections (announce bar, hero, featured, promo) live here
   too, because they now have a second reader: the dashboard's storefront
   editor renders these same components for its live preview, so what the
   vendor sees while editing IS the production markup, not a copy of it. */

export type CartApi = ReturnType<typeof useCart>;

/* ---------- save-for-later heart ---------- */

export function HeartButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button className="ph-btn" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      aria-label={saved ? "Remove from saved" : "Save for later"} aria-pressed={saved}
      style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, borderRadius: "var(--radius-pill)", background: "rgba(255,255,255,.9)", color: saved ? "var(--violet)" : "var(--stone)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
      <Icon name={saved ? "heart-filled" : "heart"} />
    </button>
  );
}

/* ---------- product card (links to the product page) ---------- */

export function ShopCard({ g, slug, saved, onToggleSave, onAdd, priority = false, tryOn, shop }: {
  g: Garment; slug: string; saved: boolean; onToggleSave: () => void; onAdd: () => void;
  priority?: boolean; // above-the-fold cards skip lazy-loading
  /* Optional so existing callers keep working; omitted means "offer try-on",
     which is the historical behaviour for every apparel shop. */
  tryOn?: TryOnState;
  shop?: Pick<Shop, "type"> | null;
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
    /* No card-wide opacity: dimming the whole tile to .6 pushed the name and
       the price under the contrast floor, which is the information a shopper
       needs in order to ask the shop about a sold-out piece. The photo greys,
       the words stay readable. */
    <div className="fade-up" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="shop-tile">
        <Link href={href} style={{ position: "absolute", inset: 0, display: "block" }}>
          {/* contain, not cover — see .shop-tile. The frame is fixed; the
              piece is fitted into it whole rather than cropped to fill it. */}
          <GarmentImage src={g.image} alt={g.name} objectFit="contain"
            sizes="(max-width: 640px) 50vw, 210px"
            grayscale={!g.inStock} priority={priority} />
          {!g.inStock && (
            <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--ink)", color: "var(--paper)", fontSize: 11.5, fontWeight: 600, padding: "4px 12px", borderRadius: "var(--radius-pill)" }}>
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
                style={{ background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14, padding: "10px 0", borderRadius: "var(--radius-pill)", width: "100%", textAlign: "center", textDecoration: "none" }}>
                choose size
              </Link>
            ) : (
              <button className="ph-btn" onClick={quickAdd}
                style={{ background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14, padding: "10px 0", borderRadius: "var(--radius-pill)", width: "100%" }}>
                {added ? <><Icon name="check" /> added</> : <><Icon name="bag" /> add to bag</>}
              </button>
            )
          ) : (
            /* --stone on --line is a grey-on-grey pill. This says the same
               thing as a plain disabled control without pretending to be a
               button the shopper could have pressed. */
            <div aria-disabled style={{ background: "var(--paper-deep)", color: "var(--stone)", border: "1px dashed var(--line-strong)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14, padding: "10px 0", borderRadius: "var(--radius-pill)", width: "100%", textAlign: "center" }}>
              sold out
            </div>
          )}
          {/* "details" is gone: the card image, the title and (when a size is
              needed) the CTA all already link to the same product page, so it
              was a fourth link to a place the shopper could reach three other
              ways — and it competed with the one link that goes somewhere
              else. */}
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
            <TryOnCta shop={shop ?? { type: "apparel" }} state={tryOn ?? { enabled: true, left: 1 }}
              href={`/k/${slug}?g=${encodeURIComponent(g.id)}`}
              style={{ textDecoration: "underline", textUnderlineOffset: 4, fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>
              see it on you →
            </TryOnCta>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- cart drawer + checkout (WhatsApp + leads, env-toggleable) ----------
   Two steps, like a real checkout: the bag is only the bag (items, total,
   "checkout"), and name + phone are asked on a second screen once the shopper
   has committed. Shoppers who are just browsing never see a form. */

type Kind = "order" | "enquiry";

/* Shared by every line of one bag so the vendor's inbox shows them as a single
   order. Short enough to read out over the phone. */
function newOrderRef(): string {
  return "PQ-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

export function CartDrawer({ shop, cart, catalog, defaultName, defaultPhone, loggedIn, onClose, onKeepShopping }: {
  shop: Shop; cart: CartApi; catalog: Garment[];
  defaultName?: string; defaultPhone?: string; loggedIn?: boolean;
  onClose: () => void; onKeepShopping: () => void;
}) {
  const [name, setName] = useState(defaultName || "");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [step, setStep] = useState<"cart" | "details" | "done">("cart");
  const [sending, setSending] = useState<null | Kind>(null);
  const [sentKind, setSentKind] = useState<Kind>("order");
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); // opened the saved details for a change
  const nameRef = useRef<HTMLInputElement>(null);
  const detailsFormId = useId();

  useEffect(() => { if (defaultName && !name) setName(defaultName); }, [defaultName]);
  useEffect(() => { if (defaultPhone && !phone) setPhone(defaultPhone); }, [defaultPhone]);

  // the bag emptying under the details step (last line removed) sends us back
  useEffect(() => { if (step === "details" && cart.lines.length === 0) setStep("cart"); }, [step, cart.lines.length]);

  const toDetails = () => {
    setStep("details");
    setTimeout(() => nameRef.current?.focus(), 60); // after the slide-in
  };

  /* A signed-in shopper with a complete profile has already given us these
     once. Two pre-filled inputs read as work to do; the same values as a card
     to confirm read as done — so show the card, and keep editing one tap away.
     Compared against the profile rather than merely "signed in": a shopper who
     typed something else here meant it, and gets the fields back. */
  const hasSaved = !!loggedIn && !!(defaultName || "").trim() && !!(defaultPhone || "").trim();
  const usingSaved = hasSaved && name === defaultName && phone === defaultPhone;
  const confirmSaved = usingSaved && !editing;

  const useSavedDetails = () => {
    setName(defaultName || "");
    setPhone(defaultPhone || "");
    setErrors({});
    setEditing(false);
  };

  const canWa = CHECKOUT.whatsapp && !!waLink(shop.whatsapp, "x");
  const canLead = CHECKOUT.leads;

  const validate = (): boolean => {
    const next = { name: nameError(name) ?? undefined, phone: phoneError(phone) ?? undefined };
    setErrors(next);
    return !next.name && !next.phone;
  };

  const orderMessage = (): string => {
    const lines = cart.lines
      .map((l) => `• ${l.qty}× ${l.name}${l.size ? ` — size ${l.size}` : ""} — ${npr(l.price * l.qty)}`)
      .join("\n");
    return (
      `Namaste! I'd like to order from ${shop.name || "your shop"} (via peeq):\n\n` +
      `${lines}\n\nTotal: ${npr(cart.total)}\n\nName: ${name.trim()}\nPhone: ${phone.trim()}`
    );
  };

  /* "place order" drops the bag straight into the shop's inbox; "enquire on
     WhatsApp" does the same and opens the chat, so the shopper can ask before
     committing. Either way the shop keeps the order — nothing depends on the
     shopper actually pressing send in WhatsApp. */
  const send = async (kind: Kind) => {
    if (!validate() || sending) return;
    setSendError(null);

    /* WhatsApp opens here, inside the click's own task: after an await the
       browser stops counting it as a user gesture and blocks the tab. With the
       leads inbox switched off for a deployment, WhatsApp is the only channel
       there is, so a plain order has to travel that way too. */
    const viaWa = canWa && (kind === "enquiry" || !canLead);
    if (viaWa) {
      const link = waLink(shop.whatsapp, orderMessage());
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    }

    setSending(kind);
    const ref = newOrderRef();
    const lines = cart.lines
      .map((l) => ({ garment: catalog.find((x) => x.id === l.garmentId), size: l.size, qty: l.qty }))
      .filter((l): l is { garment: Garment; size: string; qty: number } => !!l.garment);

    if (canLead && lines.length) {
      try {
        await submitOrder(shop, lines, {
          name: name.trim(), phone: phone.trim(), orderRef: ref, kind,
        });
      } catch (e) {
        /* An enquiry is already on its way in the open WhatsApp tab, so only
           a plain order has nothing to fall back on — keep the bag and say so. */
        if (kind === "order") {
          setSendError(e instanceof Error ? e.message : "Could not send — please try again.");
          setSending(null);
          return;
        }
      }
    }
    /* Whatever they actually typed is the truth for next time — a shopper who
       corrects their number at checkout shouldn't have to correct it again. */
    if (loggedIn) saveContact({ name: name.trim(), phone: phone.trim() }).catch(() => {});

    cart.clear();
    setSending(null);
    setSentKind(viaWa ? "enquiry" : "order"); // the done screen explains the channel used
    setSentRef(canLead && lines.length ? ref : null);
    setStep("done");
  };

  /* Anything typed into the details step is work a stray backdrop tap used to
     throw away without asking — a name and a phone number, mid-checkout. */
  const dirty = step === "details" && !confirmSaved && (name.trim() !== "" || phone.trim() !== "");

  return (
    <Dialog variant="drawer" onClose={onClose} hideHeader dirty={dirty}
      dirtyMessage="You've typed your details but haven't placed the order. Close the bag anyway?"
      ariaLabel={step === "done" ? "Order sent" : step === "details" ? "Your details" : "Your bag"}
      panelStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "16px 20px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {step === "details" && !sending && (
              <button className="ph-btn" onClick={() => setStep("cart")} aria-label="Back to bag"
                style={{ fontSize: 18, color: "var(--stone)", padding: "2px 4px", lineHeight: 1 }}>←</button>
            )}
            {/* "order sent" while the body explains WhatsApp is still waiting
                for you to press send was two different claims on one screen.
                The header now agrees with whichever thing actually happened. */}
            <span className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
              {step === "done"
                ? (sentKind === "enquiry" ? "almost there" : "order sent")
                : step === "details" ? "your details" : `your bag (${cart.count})`}
            </span>
          </div>
          <button className="ph-btn" onClick={onClose} aria-label="Close" style={{ fontSize: 18, color: "var(--stone)", padding: 6 }}><Icon name="close" /></button>
        </div>

        {step === "cart" && cart.lines.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--stone)" }}>
            <StepDot active label="1" /> <span style={{ color: "var(--ink)", fontWeight: 600 }}>Bag</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <StepDot label="2" /> <span>Your details</span>
          </div>
        )}
        {step === "details" && cart.lines.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--stone)" }}>
            <StepDot done label="1" /> <span>Bag</span>
            <span style={{ flex: 1, height: 1, background: "var(--violet)" }} />
            <StepDot active label="2" /> <span style={{ color: "var(--ink)", fontWeight: 600 }}>Your details</span>
          </div>
        )}

        {step === "done" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 28, overflowY: "auto" }}>
            <div style={{ color: "var(--ok)" }}><Icon name="bag" size={44} /></div>
            <div className="ph-display" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>
              {sentKind === "enquiry" ? "one more tap in WhatsApp" : "the shop has your order"}
            </div>
            <p style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.6, maxWidth: 300, margin: 0 }}>
              {sentKind === "enquiry"
                ? "Send the opened WhatsApp message."
                : "The shop will call you."}
            </p>
            {sentRef && (
              <div style={{ fontSize: 12, color: "var(--stone)" }}>
                order <b style={{ fontFamily: "ui-monospace, monospace", color: "var(--ink)" }}>{sentRef}</b>
              </div>
            )}
            {loggedIn && (
              <Link href="/account" style={{ fontSize: 12.5, color: "var(--violet)", fontWeight: 600, textUnderlineOffset: 3 }}>
                see it in your orders
              </Link>
            )}
            <button className="ph-btn btn-violet" onClick={onKeepShopping} data-autofocus style={{ marginTop: 4 }}>keep shopping</button>
          </div>
        ) : cart.lines.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 28 }}>
            <div style={{ color: "var(--stone)" }}><Icon name="bag" size={40} /></div>
            <p style={{ color: "var(--stone)", fontSize: 14, margin: 0 }}>Your bag is empty.</p>
            {/* "browse the collection" from an empty bag closes the drawer and
                leaves you wherever you were, which on the product page is not
                the collection. onKeepShopping is the caller's job — it now
                actually navigates there. */}
            <button className="ph-btn btn-violet" onClick={onKeepShopping} data-autofocus>browse the collection</button>
          </div>
        ) : step === "cart" ? (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {cart.lines.map((l) => (
                <CartRow key={l.garmentId + l.size} line={l}
                  onQty={(q) => cart.setQty(l.garmentId, l.size, q)}
                  onRemove={() => cart.remove(l.garmentId, l.size)} />
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "12px 20px 14px", background: "var(--card)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: "var(--stone)" }}>Total</div>
                  <div className="ph-display" style={{ fontSize: 19, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{npr(cart.total)}</div>
                </div>
                <button className="ph-btn" onClick={toDetails}
                  style={{ background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14.5, padding: "9px 22px", borderRadius: "var(--radius-pill)", flexShrink: 0 }}>
                  checkout →
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "var(--stone)" }}>
                <button className="ph-btn" onClick={onKeepShopping} style={{ color: "var(--stone)", fontSize: 12, padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  keep shopping
                </button>
                <span style={{ textAlign: "right" }}>No online payment</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-card)", padding: "12px 14px", background: "var(--card)", marginBottom: 18 }}>
                {cart.lines.map((l) => (
                  <div key={l.garmentId + l.size} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--stone)", fontWeight: 600, flexShrink: 0 }}>{l.qty}×</span>
                    <span style={{ color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.name}{l.size ? ` · ${l.size}` : ""}
                    </span>
                    <span style={{ color: "var(--stone)", flexShrink: 0 }}>{npr(l.price * l.qty)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--stone)" }}>Total</span>
                  <span className="ph-display" style={{ fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{npr(cart.total)}</span>
                </div>
                <button className="ph-btn" onClick={() => setStep("cart")}
                  style={{ marginTop: 8, fontSize: 12, color: "var(--violet)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
                  edit bag
                </button>
              </div>

              {/* before the fields, not after: signing in prefills them, and the
                  prefill deliberately never overwrites what a shopper typed */}
              {loggedIn !== undefined && !confirmSaved && (
                <div style={{ marginBottom: 18 }}>
                  <CheckoutSignIn signedIn={loggedIn} />
                </div>
              )}

              {confirmSaved ? (
                <>
                  <div className="ph-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Confirm your details</div>
                  <div style={{ border: "1px solid var(--violet)", borderRadius: "var(--radius-lg)", padding: "12px 14px", background: "var(--card)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ color: "var(--violet)", marginTop: 2 }}><Icon name="person" /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 14, color: "var(--ink)", marginTop: 1 }}>{phone}</div>
                      <div style={{ fontSize: 11.5, color: "var(--stone)", marginTop: 4 }}>from your peeq account · saved to your orders</div>
                    </div>
                    <button className="ph-btn" onClick={() => { setEditing(true); setTimeout(() => nameRef.current?.focus(), 30); }}
                      style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--violet)", border: "1px solid var(--violet)", borderRadius: "var(--radius-pill)", padding: "6px 14px" }}>
                      change
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                    <div className="ph-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Where should the shop reach you?</div>
                    {/* they signed in mid-checkout, or edited away from the profile */}
                    {hasSaved && !usingSaved && (
                      <button className="ph-btn" onClick={useSavedDetails}
                        style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}>
                        use my details
                      </button>
                    )}
                  </div>

                  {/* A real <form> with a real submit button (down in the
                      footer). It wasn't one: Enter in the phone field placed
                      the order outright with no confirmation, Enter in the
                      name field did nothing, and no browser autofill or
                      password manager recognised it as a checkout. */}
                  <form id={detailsFormId} onSubmit={(e) => { e.preventDefault(); send("order"); }} noValidate
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Your name</span>
                      <input ref={nameRef} value={name} maxLength={80} placeholder="e.g. Sunita Shrestha" autoComplete="name"
                        aria-invalid={!!errors.name} aria-describedby={errors.name ? "co-name-err" : undefined}
                        onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }}
                        style={{ padding: "12px 15px", borderRadius: "var(--radius-field)", border: "1px solid " + (errors.name ? "var(--danger)" : "var(--line)"), background: "var(--card)", color: "var(--ink)", fontSize: 15 }} />
                      {errors.name && <div id="co-name-err" style={fieldErrorStyle}>{errors.name}</div>}
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Phone number</span>
                      <input value={phone} maxLength={30} inputMode="tel" placeholder="98XXXXXXXX" autoComplete="tel"
                        aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "co-phone-err" : undefined}
                        onChange={(e) => { setPhone(e.target.value.replace(/[^0-9+ ]/g, "")); if (errors.phone) setErrors((x) => ({ ...x, phone: undefined })); }}
                        style={{ padding: "12px 15px", borderRadius: "var(--radius-field)", border: "1px solid " + (errors.phone ? "var(--danger)" : "var(--line)"), background: "var(--card)", color: "var(--ink)", fontSize: 15 }} />
                      {errors.phone && <div id="co-phone-err" style={fieldErrorStyle}>{errors.phone}</div>}
                    </label>
                  </form>
                </>
              )}

            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "12px 20px 14px", background: "var(--card)" }}>
              {sendError && (
                <div role="alert" style={{ ...fieldErrorStyle, textAlign: "center", marginBottom: 8, fontWeight: 600 }}>{sendError}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ph-btn" type="submit" form={detailsFormId} disabled={!!sending} onClick={() => send("order")}
                  style={{ flex: 1, background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14, padding: "10px 0", borderRadius: "var(--radius-pill)", opacity: sending ? 0.6 : 1 }}>
                  {sending === "order" ? "sending…" : "place order"}
                </button>
                {canWa && (
                  <button className="ph-btn" disabled={!!sending} onClick={() => send("enquiry")}
                    style={{ flex: 1, background: "transparent", color: "var(--whatsapp)", border: "1px solid var(--whatsapp)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 14, padding: "10px 0", borderRadius: "var(--radius-pill)", opacity: sending ? 0.6 : 1 }}>
                    {sending === "enquiry" ? "opening…" : "enquire on WhatsApp"}
                  </button>
                )}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--stone)", textAlign: "center", margin: "8px 0 0", lineHeight: 1.4 }}>
                No online payment · your details go only to {shop.name || "the shop"}
              </p>
            </div>
          </>
        )}
      </>
    </Dialog>
  );
}

/* ---------- optional sign-in, inline in the checkout drawer ----------
   Signing in is never a gate: it keeps the order in the shopper's history and
   saves them typing next time, and skipping it costs them nothing. Doing it
   here rather than on /account matters — a shopper sent away mid-checkout
   comes back to an empty form, and often doesn't come back at all. */

function CheckoutSignIn({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  /* Two channels, like the full auth page: "you already have an account" is
     information and rendered as such, not as an error in --danger — and
     neither was rendered in --stone, which is where every message in this box
     used to end up regardless of what it meant. */
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const emailId = useId();
  const pwId = useId();

  /* Local mode has no accounts at all, so offering one would be a dead end. */
  if (!isSupabaseConfigured()) return null;

  if (signedIn) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--stone)", justifyContent: "center" }}>
        <span style={{ color: "var(--violet)" }}><Icon name="check" /></span>
        This order will be saved to your account.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setMessage("Enter a valid email address."); return; }
    if (password.length < 6) { setMessage("Password must be at least 6 characters."); return; }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await signUpWithEmail(trimmed, password);
        /* Supabase reports an existing email either as an error or, with
           confirmations on, as a user with no identities — both mean the same
           thing to the shopper: you already have an account, sign in. */
        const taken = error
          ? /already registered|already exists/i.test(error.message)
          : !!data.user && !data.session && data.user.identities?.length === 0;
        if (taken) { setMode("signin"); setNotice("You already have an account — sign in."); return; }
        if (error) throw error;
        if (!data.session) { setMode("signin"); setNotice("Check your email to confirm, then sign in."); return; }
      } else {
        const { error } = await signInWithEmail(trimmed, password);
        if (error) throw error;
      }
      /* Stamp the role so a shopper never gets a shop auto-provisioned. The
         parent's useAccount() picks the session up and prefills name + phone. */
      await ensureRole("shopper");
      setOpen(false);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "";
      setMessage(
        /invalid login credentials|invalid_grant/i.test(raw)
          ? "That email and password don't match."
          : /rate limit|too many/i.test(raw)
          ? "Too many attempts — wait a minute and try again."
          : "Could not sign in just now — please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setMessage("Enter your email above first."); return; }
    setResetting(true);
    setMessage("");
    await sendPasswordReset(trimmed);
    setResetting(false);
    setNotice("If an account exists for that email, we've sent it a link to set a new password.");
  };

  const field: React.CSSProperties = {
    padding: "9px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)",
    background: "var(--card)", color: "var(--ink)", fontSize: 14, width: "100%",
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: 4 };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: "10px 12px", background: "var(--card)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12.5, color: "var(--stone)", lineHeight: 1.4 }}>
          <b style={{ color: "var(--ink)" }}>Save this order to your account</b><br />
          Keep your order history and skip typing next time.
        </div>
        {/* "not when expanded" said "not now", which reads as dismissing the
            offer — it only collapses the panel. It says what it does. */}
        <button className="ph-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "var(--violet)", border: "1px solid var(--violet)", borderRadius: "var(--radius-pill)", padding: "6px 14px" }}>
          {open ? "hide" : "sign in"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <div>
            <label htmlFor={emailId} style={label}>Email</label>
            <input id={emailId} style={field} type="email" value={email} maxLength={120} placeholder="you@email.com" autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); setMessage(""); }} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <label htmlFor={pwId} style={label}>Password</label>
              {mode === "signin" && (
                <button type="button" className="ph-btn" onClick={forgot} disabled={resetting}
                  style={{ fontSize: 11.5, fontWeight: 600, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0, marginBottom: 4 }}>
                  {resetting ? "sending…" : "forgot?"}
                </button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input id={pwId} style={{ ...field, paddingRight: 42 }} type={reveal ? "text" : "password"} value={password} maxLength={72}
                placeholder={mode === "signup" ? "at least 6 characters" : "your password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onChange={(e) => { setPassword(e.target.value); setMessage(""); }} />
              <button type="button" className="ph-btn" onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide password" : "Show password"} aria-pressed={reveal}
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", padding: 7, color: "var(--stone)", fontSize: 15 }}>
                <Icon name="eye" />
              </button>
            </div>
          </div>
          {notice && <div style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}>{notice}</div>}
          {message && <div role="alert" style={{ ...fieldErrorStyle, fontWeight: 600 }}>{message}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="ph-btn" type="submit" disabled={busy}
              style={{ background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontSize: 13, padding: "8px 18px", borderRadius: "var(--radius-pill)", opacity: busy ? 0.6 : 1 }}>
              {busy ? "one moment…" : mode === "signin" ? "sign in" : "create account"}
            </button>
            <button className="ph-btn" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setNotice(""); }}
              style={{ fontSize: 12, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              {mode === "signin" ? "New here? Create one" : "Already have one? Sign in"}
            </button>
          </div>
        
        </form>
      )}
    </div>
  );
}

/* bag → your details progress marker in the drawer header */
function StepDot({ label, active = false, done = false }: { label: string; active?: boolean; done?: boolean }) {
  const filled = active || done;
  return (
    <span aria-hidden style={{ width: 18, height: 18, borderRadius: "var(--radius-pill)", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, background: filled ? "var(--violet)" : "transparent", color: filled ? "var(--on-accent)" : "var(--stone)", border: filled ? "none" : "1px solid var(--line)" }}>
      {done ? <Icon name="check" size={11} /> : label}
    </span>
  );
}

/* ---------- customisable page sections ----------
   Everything below is pure over (config, catalog, resolved slots): no cart,
   no account, no fetches. That's what lets the editor preview render the
   real sections against a draft config without dragging the page's state
   machinery into the dashboard. */

/** What the configured image slots resolve to, ready to render. */
export interface ResolvedSlots {
  heroSlides: HeroSlide[];
  featured: Garment[];
  promo: { image: string; alt: string; href: string } | null;
}

/* Config → pixels. An empty hero/featured/promo config falls back to the
   automatic slices, and the auto bands deliberately take DIFFERENT windows of
   the catalog: the hero, the featured row and the promo used to take the same
   slice off the front, so the first four pieces appeared three times on one
   page and a shop with six items looked like it had two. They overlap only
   when the shop genuinely doesn't have enough stock to fill them — where
   repetition is honest rather than an accident.

   A pick pointing at a deleted garment resolves to nothing rather than a
   broken tile, and a slot list that resolves to nothing falls back to auto —
   a vendor who curated five pieces and then sold and deleted all five has a
   storefront again, not a blank hero. */
export function resolveStorefrontSlots(
  cfg: StorefrontConfig,
  catalog: Garment[],
  slug: string
): ResolvedSlots {
  const byId = new Map(catalog.map((g) => [g.id, g]));
  const inStock = catalog.filter((g) => g.inStock);
  const productHref = (g: Garment) => `/s/${slug}/${encodeURIComponent(g.id)}`;

  const garmentSlide = (g: Garment): HeroSlide => ({
    id: g.id, image: g.image, name: g.name, href: productHref(g), price: g.price,
  });
  const slotSlide = (slot: SlotImage, i: number): HeroSlide | null => {
    if (slot.kind === "upload") {
      /* a labelled slot (a stitched fit picked in the editor) captions its
         slide; a plain banner stays silent */
      return { id: "upload-" + i, image: slot.url, name: slot.label ?? "", href: "#collection", price: null };
    }
    const g = byId.get(slot.garmentId);
    return g ? garmentSlide(g) : null;
  };

  const pickedSlides = cfg.hero.images
    .map(slotSlide).filter((s): s is HeroSlide => !!s);
  const heroSlides = pickedSlides.length > 0
    ? pickedSlides
    : inStock.slice(0, 5).map(garmentSlide);

  const pickedFeatured = cfg.featured.picks
    .map((id) => byId.get(id)).filter((g): g is Garment => !!g);
  const featured = pickedFeatured.length > 0
    ? pickedFeatured
    : inStock.length > 5 ? inStock.slice(5, 9) : inStock.slice(0, 4);

  /* the auto promo photo: something neither band above has shown, when there
     is one — otherwise the piece least recently seen */
  const autoPromoPiece =
    inStock.length > 9 ? inStock[9]
    : inStock.length > 5 ? inStock[inStock.length - 1]
    : featured[1] ?? inStock[0] ?? null;

  let promo: ResolvedSlots["promo"] = null;
  if (cfg.promo.image?.kind === "upload") {
    promo = { image: cfg.promo.image.url, alt: "", href: "#collection" };
  } else {
    const picked = cfg.promo.image?.kind === "garment" ? byId.get(cfg.promo.image.garmentId) : undefined;
    const piece = picked ?? autoPromoPiece;
    if (piece) promo = { image: piece.image, alt: piece.name, href: productHref(piece) };
  }

  return { heroSlides, featured, promo };
}

export function AnnounceBar({ text }: { text: string }) {
  return (
    <div style={{ background: "var(--butter)", color: "var(--on-light)", textAlign: "center", fontSize: 13, fontWeight: 500, padding: "9px 12px" }}>
      {text}
    </div>
  );
}

/* Which shell the sections wear. One value for the whole page — the layout the
   vendor picked — passed down rather than read from context, so the editor can
   render a draft layout beside the saved one without a provider in between.
   Unknown/absent means boutique, which is the page peeq has always rendered. */
export type SectionLayout = "boutique" | "lookbook" | "bazaar";

export function HeroSection({ shop, kicker, headline, body, slides, tryOn, tryonHref, layout = "boutique" }: {
  shop: Shop;
  kicker: string;
  headline: string; // "\n" is a line break — rendered pre-line
  body: string;
  slides: HeroSlide[];
  tryOn: TryOnState;
  tryonHref: string;
  layout?: SectionLayout;
}) {
  /* ── lookbook: the photo IS the top of the page ──
     The copy sits on the photo, so none of it can take a theme token: --ink is
     near-white in the dark theme and --violet is a near-black green on paper,
     and both would vanish against a photograph. Everything here is fixed light
     over the scrim in .hero-bleed, the same stance .hero-bar takes. */
  if (layout === "lookbook") {
    return (
      <section className="hero-bleed">
        {slides.length > 0 ? (
          <HeroCarousel slides={slides} className="hero-bleed-visual" caption={false} />
        ) : (
          <div className="hero-bleed-visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hero/hero-a.jpg" alt="Someone seeing a piece on themselves with peeq"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}
        <div className="hero-bleed-copy">
          <div className="kicker" style={{ color: "var(--butter)" }}>{kicker}</div>
          <h1 className="ph-display" style={{ fontSize: "clamp(32px, 5.4vw, 56px)", lineHeight: 1.08, color: "#fff", margin: 0, whiteSpace: "pre-line", textShadow: "0 2px 18px rgba(16,11,8,.45)" }}>
            {headline}
          </h1>
          <p style={{ color: "rgba(255,255,255,.88)", fontSize: 15.5, lineHeight: 1.65, margin: 0, maxWidth: 460 }}>
            {body}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="#collection" className="btn-solid" style={{ background: "#fff", color: "#1A1714" }}>shop the collection</a>
            <TryOnCta shop={shop} state={tryOn} href={tryonHref} className="btn-outline"
              style={{ borderColor: "rgba(255,255,255,.8)", color: "#fff" }} />
          </div>
        </div>
      </section>
    );
  }

  /* ── bazaar: the hero condenses to a line ──
     It doesn't disappear — the vendor's kicker, headline and paragraph all
     still say what they say. They just stop taking a screen to say it, because
     this layout's promise is that the rack starts above the fold. The hero
     pictures have nowhere to go here, which the editor warns about rather than
     silently dropping. */
  if (layout === "bazaar") {
    return (
      <section className="hero-condensed">
        <div className="kicker">{kicker}</div>
        <div className="hero-condensed-row">
          <h1 className="ph-display" style={{ fontSize: "clamp(21px, 3.4vw, 30px)", lineHeight: 1.15, color: "var(--ink)", margin: 0 }}>
            {/* one line, whatever the vendor's line breaks say — this heading
                shares a row with the paragraph */}
            {headline.replace(/\s*\n\s*/g, " ")}
          </h1>
          <p style={{ color: "var(--stone)", fontSize: 14, lineHeight: 1.55, margin: 0, flex: "1 1 260px", minWidth: 0 }}>
            {body}
          </p>
        </div>
        {offersTryOn(shop) && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
            <TryOnCta shop={shop} state={tryOn} href={tryonHref} className="linklike" />
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="hero-grid">
      <div className="hero-copy">
        <div className="kicker">{kicker}</div>
        <h1 className="ph-display" style={{ fontSize: "clamp(32px, 4.6vw, 50px)", lineHeight: 1.12, color: "var(--ink)", margin: 0, whiteSpace: "pre-line" }}>
          {headline}
        </h1>
        {/* no maxWidth of its own — .hero-copy already holds the measure, and
            a second, narrower cap made the paragraph wrap tighter than the
            heading above it */}
        <p style={{ color: "var(--stone)", fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>
          {body}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="#collection" className="btn-violet">shop the collection</a>
          <TryOnCta shop={shop} state={tryOn} href={tryonHref} className="btn-outline" />
        </div>
      </div>
      {/* A shop with nothing to show here used to render no hero at all, which
          left the copy alone in a half-empty row. It falls back to a stock
          try-on shot instead — the one thing that's true of every shop here,
          and it points at the kiosk rather than at a product. */}
      {slides.length > 0 ? (
        <HeroCarousel slides={slides} />
      ) : (
        <Link href={offersTryOn(shop) ? tryonHref : "#collection"} className="hero-visual"
          style={{ "--ar": "0.6667", background: "var(--paper-deep)", display: "block", position: "relative" } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero/hero-a.jpg" alt="Someone seeing a piece on themselves with peeq" className="img-blend"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </Link>
      )}
    </div>
  );
}

export function FeaturedSection({ heading, children, layout = "boutique" }: {
  heading: string;
  children: React.ReactNode;
  layout?: SectionLayout;
}) {
  /* A rail in the lookbook, a grid everywhere else. Same cards, same picks —
     on a phone a rail showing two and a half cards asks to be swiped, where a
     2×2 grid of the same four just asks to be scrolled past. */
  const rail = layout === "lookbook";
  return (
    <section className="section-pad">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
        <h2 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(20px, 3vw, 26px)", color: "var(--ink)", margin: 0 }}>{heading}</h2>
        <a className="linklike" href="#collection">view all →</a>
      </div>
      <div className={rail ? "shop-rail" : "shop-grid"}>
        {children}
      </div>
    </section>
  );
}

export function PromoSection({ shop, kicker, heading, body, promo, tryOn, tryonHref, layout = "boutique" }: {
  shop: Shop;
  kicker: string;
  heading: string;
  body: string;
  promo: ResolvedSlots["promo"];
  tryOn: TryOnState;
  tryonHref: string;
  layout?: SectionLayout;
}) {
  /* ── lookbook: one loud band in the shop's own accent ──
     Everything inside takes --on-accent rather than --ink, because the accent
     is the ground here: it's a deep fill on paper and a bright one in the dark
     theme, and --ink flips with the theme instead of with the band. */
  if (layout === "lookbook") {
    return (
      <section className="promo-band">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
          <div className="kicker">{kicker}</div>
          <h3 className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(24px, 3.6vw, 34px)", lineHeight: 1.18, margin: 0 }}>
            {heading}
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, opacity: 0.82 }}>{body}</p>
          <div><TryOnCta shop={shop} state={tryOn} href={tryonHref} className="btn-on-accent" /></div>
        </div>
        {promo && (
          <Link href={promo.href} className="promo-band-media">
            <GarmentImage src={promo.image} alt={promo.alt} sizes="(max-width: 820px) 100vw, 46vw" />
          </Link>
        )}
      </section>
    );
  }

  /* ── bazaar: a slim banner inside the grid flow ──
     A shopper who came to dig scrolls past a full-width pitch without reading
     it. One row, in the middle of the thing they ARE reading, gets seen. */
  if (layout === "bazaar") {
    return (
      <section style={{ padding: "6px 0 14px" }}>
        <div className="promo-banner">
          {promo && (
            <Link href={promo.href} className="promo-banner-media" aria-hidden tabIndex={-1}>
              <GarmentImage src={promo.image} alt="" sizes="62px" />
            </Link>
          )}
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div className="ph-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", lineHeight: 1.25 }}>{heading}</div>
            <div style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 2 }}>{kicker}</div>
          </div>
          <TryOnCta shop={shop} state={tryOn} href={tryonHref} className="ph-btn"
            style={{ background: "var(--violet)", color: "var(--on-accent)", fontWeight: 700, fontFamily: "var(--font-display), sans-serif", fontSize: 13.5, padding: "9px 20px", borderRadius: "var(--radius-pill)", flexShrink: 0, textDecoration: "none" }} />
        </div>
      </section>
    );
  }

  return (
    <section className="section-pad" style={{ background: "var(--paper-deep)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
        <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
          <div className="kicker">{kicker}</div>
          <h3 className="ph-display" style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.22, color: "var(--ink)", margin: 0 }}>
            {heading}
          </h3>
          <p style={{ color: "var(--stone)", fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>
            {body}
          </p>
          <div><TryOnCta shop={shop} state={tryOn} href={tryonHref} className="btn-violet" /></div>
        </div>
        {promo && (
          <Link href={promo.href} style={{ minHeight: 220, background: "var(--paper-deep)", display: "block", position: "relative" }}>
            <GarmentImage src={promo.image} alt={promo.alt} sizes="(max-width: 900px) 100vw, 50vw" />
          </Link>
        )}
      </div>
    </section>
  );
}

/** The body copy the hero falls back to — the default pitch depends on
    whether this shop can promise try-on at all. */
export function defaultHeroBody(shop: Shop): string {
  return offersTryOn(shop) ? STOREFRONT_DEFAULTS.heroBodyTryOn : STOREFRONT_DEFAULTS.heroBody;
}

function CartRow({ line, onQty, onRemove }: { line: CartLine; onQty: (q: number) => void; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
      <img src={line.image} alt="" style={{ width: 62, height: 82, objectFit: "cover", borderRadius: "var(--radius-md)", background: "var(--paper-deep)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.name}</div>
        {line.size && <div style={{ fontSize: 12.5, color: "var(--stone)", marginTop: 1 }}>Size {line.size}</div>}
        <div style={{ fontSize: 13, color: "var(--stone)", fontWeight: 500, marginTop: 2 }}>{npr(line.price)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 8 }}>
          {/* 40px, not 32: WCAG 2.5.8 asks for 24 and these sit a thumb-width
              apart from "remove", which used to be a 12px underlined link. */}
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
            <button className="ph-btn" onClick={() => onQty(line.qty - 1)} aria-label={"Decrease quantity of " + line.name} style={{ width: 40, height: 40, fontSize: 17, color: "var(--ink)" }}>−</button>
            <span aria-live="polite" style={{ minWidth: 26, textAlign: "center", fontSize: 14, fontWeight: 600 }}>{line.qty}</span>
            <button className="ph-btn" onClick={() => onQty(line.qty + 1)} aria-label={"Increase quantity of " + line.name} style={{ width: 40, height: 40, fontSize: 17, color: "var(--ink)" }}>+</button>
          </div>
          <button className="ph-btn" onClick={onRemove} aria-label={"Remove " + line.name + " from your bag"}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--stone)", padding: "10px 12px", minHeight: 40, textDecoration: "underline", textUnderlineOffset: 3 }}>remove</button>
        </div>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flexShrink: 0 }}>{npr(line.price * line.qty)}</div>
    </div>
  );
}

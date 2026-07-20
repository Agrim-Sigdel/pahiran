"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { npr, waLink } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { runTryOn, getKioskSessionId, type TryOnFinish } from "@/lib/tryon";
import { logLocalTryOn, submitLead } from "@/lib/storage";
import { reportError } from "@/lib/logging";
import {
  getRememberedPhoto, rememberPhoto, forgetPhoto,
  saveLook, listLooks, setLookFavorite, deleteLook, clearAllLooks, clearDeviceSession,
  lookImageURL, shareLook, shareImage, type SavedLook,
} from "@/lib/looks";
import { getProfile, saveProfile, forgetProfile, type Profile } from "@/lib/profile";
import { useAccount, getContact, signOut } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { CartDrawer } from "@/components/storefront";
import { recommendSize, HEIGHT_MIN, HEIGHT_MAX, WEIGHT_MIN, WEIGHT_MAX, type Gender, type SizeRec } from "@/lib/sizing";
import { LangContext, STRINGS, useLangState, useT } from "@/lib/i18n";
import type { Garment, Shop } from "@/lib/types";
import Icon from "@/components/Icon";

/* Kiosk — light, touch-first shopper flow:
   attract (saved-photo fast path) → capture (consent inline) → try on.
   Serves /k/[slug] on shoppers' phones; ?g=<garmentId> (hanger QR /
   storefront "peeq it") jumps straight to that piece.

   peeq UI rules applied here: the photo is the interface (stage adopts the
   photo's own aspect ratio — nothing is cropped), violet only where a tap
   does something, the blink is the loading state, everything touchable is
   round, primary actions live in the bottom third. */

const barBtn: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "var(--ink)",
  border: "1px solid var(--line)", borderRadius: 999, background: "var(--card)",
};

/* natural aspect ratio of an image src — drives the stage size so the
   photo is never cropped by a fixed-ratio box */
function useImageAspect(src: string | null): number | null {
  const [ar, setAr] = useState<number | null>(null);
  useEffect(() => {
    if (!src) { setAr(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setAr(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return ar;
}

/* the ee — blinks while the app is "looking" (replaces spinners) */
function EeMark({ size, looking, color }: { size: number; looking?: boolean; color?: string }) {
  return (
    <span className={"ee-mark " + (looking ? "ee-looking" : "ee-blink")}
      style={{ fontSize: size, color: color || "var(--violet)" }}>
      <span>ee</span>
    </span>
  );
}

/* how long a shared tablet may sit untouched before it wipes the session,
   and how much warning the shopper gets before that happens */
const IDLE_MS = 90_000;
const IDLE_GRACE_MS = 15_000;

interface KioskProps {
  shop: Shop;
  catalog: Garment[];
  exit: () => void;
  initialGarmentId?: string | null;
  /* Shared-device mode: this tablet is used by one shopper after another, so
     nothing personal may survive a session. Turns off remember-my-photo, the
     saved-looks gallery and contact prefill, wipes everything on reset, and
     auto-resets when the tablet is left idle. Off on a shopper's own phone,
     where remembering is the whole point. */
  shared?: boolean;
}

export default function Kiosk({ shop, catalog, exit, initialGarmentId, shared = false }: KioskProps) {
  const [step, setStep] = useState<"attract" | "capture" | "tryon">("attract");
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<Garment | null>(null);
  const [catFilter, setCatFilter] = useState("All");
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [looksCount, setLooksCount] = useState(0);
  const [showLooks, setShowLooks] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [lang, toggleLang] = useLangState();
  const t = STRINGS[lang];
  const { user, configured } = useAccount();
  const loggedIn = !!user && configured;
  // same per-slug bag as the storefront — a look that lands can convert on the spot
  const cart = useCart(shop.slug || "");
  const clearCart = cart.clear; // stable useCallback — see reset()'s deps
  const canShop = !!shop.slug;
  const cats = ["All", ...Array.from(new Set(catalog.map((g) => g.category)))];
  const rail = catFilter === "All" ? catalog : catalog.filter((g) => g.category === catFilter);
  const initialGarment = initialGarmentId ? catalog.find((g) => g.id === initialGarmentId) ?? null : null;

  useEffect(() => {
    if (shared) return; // a shared tablet never surfaces a previous shopper's photo or looks
    getRememberedPhoto().then(setSavedPhoto);
    listLooks().then((l) => setLooksCount(l.length));
  }, [shared]);

  // prefill checkout for signed-in shoppers, same as the storefront drawer
  useEffect(() => {
    if (loggedIn && !shared) getContact().then((c) => c && setContact(c));
  }, [loggedIn, shared]);

  /* End of one shopper's session.

     On a personal phone this just returns to the attract screen — the saved
     photo and looks are that shopper's own and should survive.

     On a shared tablet it must erase every trace of the person who just
     walked away: their face (IndexedDB + the in-memory copy), their body
     measurements, their saved looks, their bag, and the name/phone that
     would otherwise prefill into the next shopper's lead form. Anything left
     behind is the previous shopper's personal data shown to a stranger. */
  const reset = useCallback(() => {
    setPhoto(null);
    setSelected(null);
    setStep("attract");
    if (!shared) return;
    setCatFilter("All");
    setShowLooks(false);
    setCartOpen(false);
    setContact({ name: "", phone: "" });
    setSavedPhoto(null);
    setLooksCount(0);
    forgetProfile();
    clearCart();
    /* Sign out first, then wipe device storage — and only device storage.
       A shopper who signed in on the shop tablet must be logged out before
       they walk away, but their cloud looks are theirs and stay put. */
    void (async () => {
      if (loggedIn) await signOut().catch(() => {});
      await clearDeviceSession().catch(() => {});
    })();
    // depends on cart.clear, not cart: useCart returns a fresh object every
    // render, so depending on cart would change reset's identity every render
    // and re-arm the idle timers forever — they'd never actually fire.
  }, [shared, clearCart, loggedIn]);

  /* Idle auto-reset (shared tablets only).

     A shopper who walks away mid-session leaves their photo on screen for
     whoever picks the tablet up next. After IDLE_MS without a touch we warn,
     then wipe. The attract screen has nothing personal on it, so it's exempt
     — otherwise the tablet would loop a countdown all day. */
  const [idleWarning, setIdleWarning] = useState(false);
  const idleActive = shared && step !== "attract";

  useEffect(() => {
    if (!idleActive) { setIdleWarning(false); return; }
    let warn: ReturnType<typeof setTimeout>;
    let wipe: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(warn);
      clearTimeout(wipe);
      setIdleWarning(false);
      warn = setTimeout(() => setIdleWarning(true), IDLE_MS - IDLE_GRACE_MS);
      wipe = setTimeout(() => { setIdleWarning(false); reset(); }, IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(warn);
      clearTimeout(wipe);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [idleActive, reset]);

  const contactWa = waLink(
    shop.whatsapp,
    `Namaste! I have a question about ${shop.name || "your shop"}. (via peeq)`
  );

  const takePhoto = (p: string, remember: boolean) => {
    if (remember) { rememberPhoto(p); setSavedPhoto(p); }
    setPhoto(p);
    setStep("tryon");
  };

  return (
    <LangContext.Provider value={lang}>
    <div style={{ position: "fixed", inset: 0, background: "var(--paper)", color: "var(--ink)", display: "flex", flexDirection: "column", zIndex: 40 }}>
      {/* top bar — single row; labels collapse to icons on phones */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", gap: 8, background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
          <EeMark size={17} />
          <span className="ph-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{shop.name || "peeq"}</span>
          {shop.area && <span className="hide-sm" style={{ color: "var(--stone)", fontSize: 12 }}>{shop.area}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {/* language toggle: visible on every screen, never buried */}
          <button className="ph-btn" onClick={toggleLang} style={{ ...barBtn, color: "var(--violet)", borderColor: "var(--violet)" }}>{t.switchLang}</button>
          {contactWa && (
            <a className="ph-btn" href={contactWa} target="_blank" rel="noopener noreferrer"
              aria-label={t.contact}
              style={{ ...barBtn, color: "var(--whatsapp)", borderColor: "var(--whatsapp)", textDecoration: "none" }}>
              <Icon name="phone" /><span className="hide-sm"> {t.contact}</span>
            </a>
          )}
          {canShop && cart.count > 0 && (
            <button className="ph-btn" onClick={() => setCartOpen(true)} aria-label={t.viewBag(cart.count)}
              style={{ ...barBtn, background: "var(--violet)", color: "#fff", border: "none" }}>
              <Icon name="bag" /> ({cart.count})
            </button>
          )}
          {looksCount > 0 && !shared && (
            <button className="ph-btn" onClick={() => setShowLooks(true)} aria-label={t.myLooksLabel}
              style={{ ...barBtn, background: "var(--butter)", border: "none" }}>
              <Icon name="heart-filled" /> <span className="hide-sm">{t.myLooksLabel} </span>({looksCount})
            </button>
          )}
          {step !== "attract" && (
            <button className="ph-btn" onClick={reset} aria-label={t.startOver} title={t.startOver}
              style={{ ...barBtn, border: "none", color: "var(--stone)" }}>
              <Icon name="reset" /><span className="hide-sm"> {t.startOver}</span>
            </button>
          )}
          {/* leaving the kiosk ends the session too — on a shared tablet that
              must wipe, not just navigate away */}
          <button className="ph-btn" onClick={() => { reset(); exit(); }} aria-label={t.exitKiosk} title={t.exitKiosk}
            style={{ ...barBtn, border: "none", color: "var(--stone)", padding: "8px 10px" }}>
            <Icon name="close" />
          </button>
        </div>
      </div>

      {idleWarning && (
        <div role="status" aria-live="polite"
          style={{ position: "fixed", left: "50%", top: 18, transform: "translateX(-50%)", zIndex: 90, background: "var(--ink)", color: "var(--paper)", borderRadius: 999, padding: "11px 20px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-soft)" }}>
          {t.stillThere}
          <button className="ph-btn" onClick={() => setIdleWarning(false)}
            style={{ background: "var(--butter)", color: "var(--ink)", fontWeight: 700, borderRadius: 999, padding: "7px 16px", fontSize: 13.5 }}>
            {t.stillThereYes}
          </button>
        </div>
      )}
      {showLooks && <LooksGallery onClose={() => setShowLooks(false)} onCountChange={setLooksCount} />}
      {cartOpen && canShop && (
        <CartDrawer shop={shop} cart={cart} catalog={catalog}
          defaultName={contact.name} defaultPhone={contact.phone} loggedIn={loggedIn}
          onClose={() => setCartOpen(false)} onKeepShopping={() => setCartOpen(false)} />
      )}

      {step === "attract" && (
        <AttractScreen count={catalog.length} highlight={initialGarment}
          start={() => setStep("capture")}
          savedPhoto={savedPhoto}
          useSaved={() => { setPhoto(savedPhoto); setStep("tryon"); }}
          forgetSaved={() => { forgetPhoto(); setSavedPhoto(null); }}
          loggedIn={loggedIn} showAccount={configured && !shared} />
      )}
      {step === "capture" && <CaptureScreen onPhoto={takePhoto} loggedIn={loggedIn} shared={shared} />}
      {step === "tryon" && photo && (
        <TryOnScreen photo={photo} shop={shop} rail={rail} cats={cats} catFilter={catFilter} setCatFilter={setCatFilter}
          selected={selected} setSelected={setSelected} retakePhoto={() => setStep("capture")}
          initialGarment={initialGarment} cart={canShop ? cart : null}
          onLookSaved={() => setLooksCount((n) => n + 1)} onOpenBag={() => setCartOpen(true)} shared={shared} />
      )}
    </div>
    </LangContext.Provider>
  );
}

function AttractScreen({ count, highlight, start, savedPhoto, useSaved, forgetSaved, loggedIn, showAccount }: {
  count: number; highlight: Garment | null; start: () => void;
  savedPhoto: string | null; useSaved: () => void; forgetSaved: () => void;
  loggedIn: boolean; showAccount: boolean;
}) {
  const t = useT();
  return (
    <div className="peek" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "28px 24px", overflowY: "auto" }}>
      <EeMark size={54} />
      <div className="kicker" style={{ margin: "18px 0 10px" }}>{t.virtualTrialRoom}</div>
      <div className="ph-display" style={{ fontSize: "clamp(30px, 6.5vw, 44px)", lineHeight: 1.12, color: "var(--ink)" }}>
        {t.headline1}<br />{t.headline2}
      </div>
      {highlight ? (
        <div className="peek" style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 26px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: "10px 18px 10px 10px" }}>
          <img src={highlight.image} alt={highlight.name} style={{ width: 50, height: 66, objectFit: "cover", borderRadius: 12 }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{highlight.name}</div>
            <div style={{ color: "var(--stone)", fontWeight: 500, fontSize: 14 }}>{npr(highlight.price)}</div>
          </div>
        </div>
      ) : (
        <p style={{ color: "var(--stone)", fontSize: 15.5, maxWidth: 400, margin: "16px 0 28px", lineHeight: 1.7 }}>
          {t.attractSub(count)}
        </p>
      )}
      <button className="ph-btn btn-violet" onClick={start} style={{ padding: "16px 44px", fontSize: 18 }}>
        {highlight ? t.seeItOnYou : t.tapToBegin}
      </button>
      {savedPhoto && (
        <>
          <div style={{ height: 14 }} />
          <button className="ph-btn" onClick={useSaved}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 10px 10px", fontSize: 14, border: "1px solid var(--line)", borderRadius: 999, background: "var(--card)", color: "var(--ink)", fontWeight: 600 }}>
            <img src={savedPhoto} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
            {t.continueSaved}
          </button>
          <button className="ph-btn" onClick={forgetSaved}
            style={{ color: "var(--stone)", fontSize: 12.5, marginTop: 14, textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.forgetSavedPhoto}
          </button>
        </>
      )}
      {showAccount && (
        <a href="/account" style={{ marginTop: 22, fontSize: 13, color: "var(--violet)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
          {loggedIn ? <><Icon name="heart-filled" /> your saved looks</> : "sign in to save your looks"}
        </a>
      )}
    </div>
  );
}

/* ---------- capture: upload-first, consent lives here ----------
   Opens on an upload prompt (no surprise camera-permission dialog); the
   camera only starts — and only asks for permission — when the shopper
   explicitly chooses it. The viewfinder box adopts the camera's real
   aspect ratio and snap() captures the full frame. */
function CaptureScreen({ onPhoto, loggedIn, shared = false }: { onPhoto: (dataUrl: string, remember: boolean) => void; loggedIn: boolean; shared?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [camState, setCamState] = useState<"starting" | "live" | "denied">("starting");
  const [camAr, setCamAr] = useState<number | null>(null);
  // opt-in, never opt-out: defaulting this on wrote each shopper's face to the
  // device. On a shared tablet the option does not exist at all.
  const [remember, setRemember] = useState(false);
  const t = useT();

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    setCamState("starting");
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
            setCamAr(videoRef.current.videoWidth / videoRef.current.videoHeight);
          }
        }
        setCamState("live");
      } catch { if (!cancelled) setCamState("denied"); }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((tr) => tr.stop()); streamRef.current = null; };
  }, [mode]);

  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0); ctx.scale(-1, 1); // un-mirror
    ctx.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    onPhoto(c.toDataURL("image/jpeg", 0.85), remember);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try { onPhoto(await fileToCompressedDataURL(file, 1000, 0.85), remember); }
    catch { alert(t.couldNotReadPhoto); }
  };

  return (
    <div className="peek" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "14px 20px 30px" }}>
      <div className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(19px, 3vw, 24px)", textAlign: "center", color: "var(--ink)" }}>
        {mode === "upload" ? t.uploadTitle : t.standBack}
      </div>
      <div style={{ marginTop: 5, fontSize: 13, color: "var(--stone)" }}>
        {t.waistUpNote}
      </div>

      {mode === "upload" ? (
        /* upload-first: the whole box is the file picker — no camera
           permission is requested unless the shopper asks for the camera */
        <div
          onClick={() => fileRef.current?.click()}
          className="k-cam"
          style={{
            "--ar": "3/4",
            borderRadius: 20, border: "2px dashed var(--violet)", background: "var(--card)",
            display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center",
            flexShrink: 0, margin: "14px 0 16px", padding: 24, cursor: "pointer", textAlign: "center",
          } as React.CSSProperties}>
          <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden><Icon name="person" size={40} /></span>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--stone)", maxWidth: 260 }}>{t.uploadHint}</div>
          <span className="ph-btn btn-violet" style={{ padding: "12px 26px", fontSize: 15 }}>{t.uploadCta}</span>
        </div>
      ) : (
        <div
          onClick={camState === "denied" ? () => fileRef.current?.click() : undefined}
          className="k-cam"
          style={{
            ...(camAr ? ({ "--ar": String(camAr) } as React.CSSProperties) : {}),
            borderRadius: 20, overflow: "hidden", background: "var(--ink)", position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            margin: "14px 0 16px", cursor: camState === "denied" ? "pointer" : "default",
          }}>
          {camState !== "denied" ? (
            /* box matches the stream's aspect ratio, so nothing is cropped */
            <video ref={videoRef} playsInline muted
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                if (el.videoWidth && el.videoHeight) setCamAr(el.videoWidth / el.videoHeight);
              }}
              style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scaleX(-1)" }} />
          ) : (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,.65)", padding: 24, fontSize: 14, lineHeight: 1.6 }}>
              {t.cameraUnavailable}<br />
              <span style={{ color: "var(--butter)", fontWeight: 600 }}>{t.tapAnywhere}</span><br />{t.uploadInstead}
            </div>
          )}
          {camState === "starting" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.55)", fontSize: 13 }}>
              <EeMark size={34} looking color="rgba(255,255,255,.8)" />
              {t.startingCamera}
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth: 340, textAlign: "left", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: "14px 18px", fontSize: 13, lineHeight: 1.6, color: "var(--stone)" }}>
        <b style={{ color: "var(--ink)" }}>{t.consentTitle}</b> {t.consentBody}{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)", textUnderlineOffset: 2 }}>
          {t.privacyLink}
        </a>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", margin: "16px 0 12px" }}>
        {mode === "upload" ? (
          <button className="ph-btn btn-outline" onClick={() => setMode("camera")} style={{ padding: "12px 24px", fontSize: 15 }}>
            {t.useCameraInstead}
          </button>
        ) : (
          <>
            {camState === "live" && (
              <button className="ph-btn btn-violet" onClick={snap} style={{ padding: "14px 34px", fontSize: 16 }}>
                {t.agreeTakePhoto}
              </button>
            )}
            <button className="ph-btn btn-outline" onClick={() => fileRef.current?.click()} style={{ padding: "12px 24px", fontSize: 15 }}>
              {t.agreeUpload}
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </div>
      {/* remembering a face is a personal-device feature — offering it on a
          shop tablet would store one shopper's photo for the next one */}
      {!shared && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--stone)", cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: "var(--violet)", width: 16, height: 16 }} />
          {t.rememberPhoto}
        </label>
      )}
      <div style={{ color: "var(--stone)", fontSize: 12, marginTop: 8 }}>
        {!shared && remember ? t.rememberedNote : t.notSavedNote}
        {!shared && loggedIn && remember && " Synced privately to your peeq account — only you can see it."}
      </div>
    </div>
  );
}

/* ---------- generating overlay: the app is "looking" — the ee blinks
   over the dimmed photo. No spinners, no scan lines. ---------- */
function GeneratingOverlay({ garment, finish = "quick" }: { garment: Garment | null; finish?: TryOnFinish }) {
  const t = useT();
  const [msg, setMsg] = useState(0);
  // Asymptotic progress — quick at first, eases toward (never reaching) done,
  // so it stays honest whether the result lands in 2s (cache) or 40s.
  // Studio finish eases much slower: it genuinely takes about a minute.
  const [progress, setProgress] = useState(4);
  const tau = finish === "studio" ? 30 : 11;
  useEffect(() => {
    const timer = setInterval(() => setMsg((m) => (m + 1) % t.genMessages.length), 3200);
    return () => clearInterval(timer);
  }, [t.genMessages.length]);
  useEffect(() => {
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setProgress(Math.max(4, Math.min(96, Math.round(100 * (1 - Math.exp(-s / tau))))));
    }, 300);
    return () => clearInterval(timer);
  }, [tau]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EeMark size={64} looking color="#fff" />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 18px 16px", background: "linear-gradient(transparent, rgba(26,23,20,.9) 55%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
        {garment && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.16)", borderRadius: 999, padding: "5px 14px 5px 5px" }}>
            <img src={garment.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</span>
          </div>
        )}
        <div key={msg} className="peek ph-display" style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>{t.genMessages[msg % t.genMessages.length]}</div>
        <div style={{ width: "72%", maxWidth: 300, height: 5, borderRadius: 5, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", borderRadius: 5, background: "var(--violet)", transition: "width .3s linear" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.55)", fontSize: 12 }}>{progress}% · {finish === "studio" ? t.genFooterStudio : t.genFooter}</div>
      </div>
    </div>
  );
}

/* ---------- "My looks": on-device gallery of saved try-ons ---------- */
function LooksGallery({ onClose, onCountChange }: { onClose: () => void; onCountChange: (n: number) => void }) {
  const t = useT();
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const urls = useRef<Map<string, string>>(new Map());

  const refresh = async () => {
    const l = await listLooks();
    setLooks(l);
    onCountChange(l.length);
  };
  useEffect(() => {
    refresh();
    const map = urls.current;
    return () => { map.forEach((u) => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imgSrc = (l: SavedLook) => {
    if (!urls.current.has(l.id)) urls.current.set(l.id, lookImageURL(l));
    return urls.current.get(l.id)!;
  };

  const sorted = looks ? [...looks].sort((a, b) => Number(b.favorite) - Number(a.favorite)) : [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--paper)", zIndex: 55, display: "flex", flexDirection: "column", color: "var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10, background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
        <div>
          <span className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{t.myLooksTitle}</span>
          <span style={{ fontSize: 12, color: "var(--stone)", marginLeft: 10 }}>{t.myLooksSub}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {looks && looks.length > 0 && (
            <button className="ph-btn"
              onClick={async () => {
                if (confirm(t.confirmDeleteAll)) {
                  await clearAllLooks();
                  forgetProfile();
                  refresh();
                }
              }}
              style={{ color: "var(--stone)", fontSize: 12, padding: "9px 12px" }}>
              {t.deleteAll}
            </button>
          )}
          <button className="ph-btn" onClick={onClose} style={barBtn}>
            <Icon name="close" /> {t.close}
          </button>
        </div>
      </div>

      {looks && looks.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", color: "var(--stone)", padding: 24, textAlign: "center" }}>
          <EeMark size={40} color="var(--stone)" />
          {t.nothingSaved}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14, alignContent: "start" }}>
          {sorted.map((l) => (
            <div key={l.id} className="peek" style={{ background: "var(--card)", borderRadius: 18, overflow: "hidden", border: "1px solid " + (l.favorite ? "var(--violet)" : "var(--line)") }}>
              <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)" }}>
                <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button className="ph-btn"
                  onClick={async () => { await setLookFavorite(l.id, !l.favorite); refresh(); }}
                  style={{ position: "absolute", top: 8, right: 8, background: "var(--card)", color: l.favorite ? "var(--violet)" : "var(--stone)", fontSize: 15, padding: "5px 9px", borderRadius: 999 }}>
                  <Icon name={l.favorite ? "heart-filled" : "heart"} />
                </button>
              </div>
              <div style={{ padding: "10px 12px 12px", fontSize: 12.5 }}>
                <b>{l.garmentName}</b>
                <div style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(l.price)}</div>
                {l.shopName && <div style={{ fontSize: 10.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="ph-btn" onClick={() => shareLook(l).catch(() => {})}
                    style={{ flex: 1, border: "1.5px solid var(--ink)", color: "var(--ink)", fontSize: 12, padding: "6px 0", fontWeight: 600, borderRadius: 999 }}>
                    {t.share}
                  </button>
                  <button className="ph-btn"
                    onClick={async () => { await deleteLook(l.id); refresh(); }}
                    style={{ color: "var(--stone)", fontSize: 11.5, padding: "6px 8px" }}>
                    {t.del}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- "I want this" → vendor leads inbox ---------- */
function InterestedModal({ shop, garment, recommended, shared, onClose }: { shop: Shop; garment: Garment; recommended?: string; shared?: boolean; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState(recommended || garment.sizes[0] || "");
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");

  // prefill from the shopper's account (no-op when logged out / local mode).
  // Never on a shared tablet — that would put the previous shopper's name and
  // phone into this shopper's form, and submit a lead under their number.
  useEffect(() => {
    if (shared) return;
    getContact().then((c) => {
      if (!c) return;
      if (c.name) setName((n) => n || c.name);
      if (c.phone) setPhone((p) => p || c.phone);
    });
  }, [shared]);
  const wa = waLink(
    shop.whatsapp,
    `Namaste! I tried on "${garment.name}"${size ? " (size " + size + ")" : ""} at ${shop.name || "your shop"} with peeq and I want it.`
  );

  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validate = (): boolean => {
    const digits = phone.replace(/\D/g, "");
    const next = {
      name: name.trim().length < 2 ? t.errName : undefined,
      phone: digits.length < 7 || digits.length > 15 ? t.errPhone : undefined,
    };
    setErrors(next);
    return !next.name && !next.phone;
  };

  const send = async () => {
    if (!validate()) return;
    setState("sending");
    try {
      await submitLead(shop, garment, { name: name.trim(), phone: phone.trim(), size });
      setState("done");
    } catch {
      setState("error");
    }
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)",
    background: "#fff", color: "var(--ink)", fontSize: 15,
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60, padding: 16 }}>
      {/* bottom sheet — arrives with the peek, actions in the thumb zone */}
      <div onClick={(e) => e.stopPropagation()} className="peek"
        style={{ background: "var(--card)", borderRadius: "var(--radius-card)", width: 380, maxWidth: "100%", padding: "26px 24px", textAlign: "center", marginBottom: 8 }}>
        {state === "done" ? (
          <>
            <div className="ph-display" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{t.shopKnows}</div>
            <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5 }}>
              {t.shopKnowsDesc(garment.name, size)}
            </p>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="ph-btn btn-wa"
                style={{ display: "block", marginBottom: 10 }}>
                {t.chatWhatsApp}
              </a>
            )}
            <button className="ph-btn btn-outline" onClick={onClose} style={{ width: "100%" }}>
              {t.keepBrowsing}
            </button>
          </>
        ) : (
          <>
            <div className="ph-display" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{t.tellShop}</div>
            <p style={{ color: "var(--stone)", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5 }}>
              {t.leadNote(garment.name, npr(garment.price))}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {garment.sizes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  {recommended && garment.sizes.includes(recommended) && (
                    <div style={{ fontSize: 11.5, color: "var(--violet)", fontWeight: 600 }}>
                      {t.recommendedForYou}: {recommended}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    {garment.sizes.map((s) => {
                      const isRec = recommended === s;
                      return (
                        <button key={s} className="ph-btn" onClick={() => setSize(s)}
                          style={{
                            padding: "8px 16px", fontSize: 13, borderRadius: 999, fontWeight: 600,
                            background: size === s ? "var(--violet)" : "var(--paper)",
                            color: size === s ? "#fff" : "var(--stone)",
                            border: (size === s ? "1px solid var(--violet)"
                              : isRec ? "1.5px dashed var(--violet)" : "1px solid var(--line)"),
                          }}>
                          {s}{isRec ? <> <Icon name="star" /></> : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <input style={{ ...input, borderColor: errors.name ? "var(--danger)" : "var(--line)" }}
                placeholder={t.yourName} value={name} maxLength={80} aria-invalid={!!errors.name}
                onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }} />
              {errors.name && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: -4 }}>{errors.name}</div>}
              <input style={{ ...input, borderColor: errors.phone ? "var(--danger)" : "var(--line)" }}
                placeholder={t.phoneNumber} value={phone} maxLength={30} inputMode="tel" aria-invalid={!!errors.phone}
                onChange={(e) => { setPhone(e.target.value.replace(/[^0-9+ ]/g, "")); if (errors.phone) setErrors((x) => ({ ...x, phone: undefined })); }} />
              {errors.phone && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: -4 }}>{errors.phone}</div>}
            </div>
            {state === "error" && (
              <div style={{ fontSize: 12.5, color: "#C0554D", marginTop: 10 }}>
                {t.sendFailed}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="ph-btn" onClick={onClose}
                style={{ flex: 1, border: "1px solid var(--line)", color: "var(--ink)", padding: 13, fontSize: 14, borderRadius: 999, fontWeight: 600 }}>
                {t.cancel}
              </button>
              <button className="ph-btn" disabled={state === "sending"} onClick={send}
                style={{ flex: 2, background: "var(--ink)", color: "var(--paper)", padding: 13, fontSize: 14, borderRadius: 999, fontWeight: 700, fontFamily: "'Baloo 2', cursive", opacity: state === "sending" ? 0.6 : 1 }}>
                {state === "sending" ? t.sending : t.sendToShop}
              </button>
            </div>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="ph-btn btn-wa"
                style={{ display: "block", marginTop: 10 }}>
                {t.chatWhatsApp}
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- "find my size": height/weight → a size hint ----------
   Never feeds the try-on image (the models take body shape from the photo);
   it only helps the shopper pick a size and pre-fills the lead form. */
function SizeBadge({ rec, onEdit }: { rec: SizeRec; onEdit: () => void }) {
  const t = useT();
  const note = rec.nearest ? t.sizeNearestNote(rec.size) : rec.confidence === "rough" ? t.sizeRoughNote : "";
  return (
    <button className="ph-btn" onClick={onEdit}
      aria-label={t.findMySize}
      style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--violet)", color: "var(--violet)", padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 999, background: "var(--card)" }}>
      <span><Icon name="ruler" /> {rec.free ? t.sizeFree : `${t.yourSize}: ${rec.size}`}</span>
      {note && <span style={{ color: "var(--stone)", fontWeight: 500, fontSize: 11 }}>· {note}</span>}
      <span style={{ color: "var(--stone)", fontSize: 11 }}><Icon name="edit" /></span>
    </button>
  );
}

function FindMySizeSheet({ initial, onClose, onSaved, onForget }: {
  initial: Profile | null;
  onClose: () => void;
  onSaved: (p: Profile) => void;
  onForget: () => void;
}) {
  const t = useT();
  const [height, setHeight] = useState(initial?.heightCm ? String(initial.heightCm) : "");
  const [weight, setWeight] = useState(initial?.weightKg ? String(initial.weightKg) : "");
  const [gender, setGender] = useState<Gender | undefined>(initial?.gender);

  const h = Number(height);
  const w = Number(weight);
  const heightOk = Number.isFinite(h) && h >= HEIGHT_MIN && h <= HEIGHT_MAX;
  const weightOk = weight.trim() === "" || (Number.isFinite(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX);
  const canSave = heightOk && weightOk;

  const save = () => {
    if (!canSave) return;
    onSaved(saveProfile({
      heightCm: Math.round(h),
      weightKg: weight.trim() !== "" ? Math.round(w) : undefined,
      gender,
    }));
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "12px 15px", borderRadius: 14, border: "1px solid var(--line)",
    background: "#fff", color: "var(--ink)", fontSize: 15,
  };
  const genderChip = (g: Gender, label: string) => (
    <button key={g} className="ph-btn" onClick={() => setGender((cur) => (cur === g ? undefined : g))}
      style={{
        flex: 1, padding: "9px 0", fontSize: 13, borderRadius: 999, fontWeight: 600,
        background: gender === g ? "var(--violet)" : "var(--paper)",
        color: gender === g ? "#fff" : "var(--stone)",
        border: "1px solid " + (gender === g ? "var(--violet)" : "var(--line)"),
      }}>
      {label}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="peek"
        style={{ background: "var(--card)", borderRadius: "var(--radius-card)", width: 380, maxWidth: "100%", padding: "26px 24px", textAlign: "center", marginBottom: 8 }}>
        <div className="ph-display" style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}><Icon name="ruler" /> {t.mySizeTitle}</div>
        <p style={{ color: "var(--stone)", fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.5 }}>{t.mySizePrivacy}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <label style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 600 }}>
            {t.heightCmLabel}
            <input style={{ ...input, marginTop: 5 }} value={height} inputMode="numeric" maxLength={3}
              onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))} placeholder="165" />
          </label>
          <label style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 600 }}>
            {t.weightKgLabel}
            <input style={{ ...input, marginTop: 5 }} value={weight} inputMode="numeric" maxLength={3}
              onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))} placeholder="60" />
          </label>
          <div style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 600 }}>
            {t.forWhomLabel}
            <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
              {genderChip("f", t.genderWomen)}
              {genderChip("m", t.genderMen)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ph-btn" onClick={onClose}
            style={{ flex: 1, border: "1px solid var(--line)", color: "var(--ink)", padding: 13, fontSize: 14, borderRadius: 999, fontWeight: 600 }}>
            {t.skipSize}
          </button>
          <button className="ph-btn" disabled={!canSave} onClick={save}
            style={{ flex: 2, background: "var(--violet)", color: "#fff", padding: 13, fontSize: 14, borderRadius: 999, fontWeight: 700, fontFamily: "'Baloo 2', cursive", opacity: canSave ? 1 : 0.6 }}>
            {t.showMySize}
          </button>
        </div>
        {initial && (
          <button className="ph-btn" onClick={onForget}
            style={{ color: "var(--stone)", fontSize: 12, marginTop: 12, textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.forgetMySize}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- try-on screen: photo stage + garment rail ---------- */
interface TryOnScreenProps {
  photo: string;
  shop: Shop;
  rail: Garment[];
  cats: string[];
  catFilter: string;
  setCatFilter: (c: string) => void;
  selected: Garment | null;
  setSelected: (g: Garment | null) => void;
  retakePhoto: () => void;
  initialGarment: Garment | null;
  cart: ReturnType<typeof useCart> | null; // null = no public storefront (no slug) — hide add-to-bag
  onLookSaved: () => void;
  onOpenBag: () => void;
  shared: boolean;
}

function TryOnScreen({ photo, shop, rail, cats, catFilter, setCatFilter, selected, setSelected, retakePhoto, initialGarment, cart, onLookSaved, onOpenBag, shared }: TryOnScreenProps) {
  const [phase, setPhase] = useState<"idle" | "generating" | "result" | "preview">("idle");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [interested, setInterested] = useState(false);
  const [bagState, setBagState] = useState<"idle" | "pick" | "added">("idle");
  const [lookState, setLookState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareState, setShareState] = useState<"idle" | "sharing">("idle");
  const [showOriginal, setShowOriginal] = useState(false); // hold-to-compare
  const [history, setHistory] = useState<{ garment: Garment; url: string }[]>([]); // this session's generated looks
  const savedIds = useRef<Set<string>>(new Set()); // garments already saved to My Looks this session
  const [overlay, setOverlay] = useState({ x: 0.5, y: 0.52, scale: 0.75, opacity: 0.92 });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ rect: DOMRect } | null>(null);
  const requestSeq = useRef(0); // ignore stale responses if shopper taps another garment mid-generation
  const autoStarted = useRef(false);
  const photoAr = useImageAspect(photo); // stage adopts the photo's own ratio — no cropping
  const [finish, setFinish] = useState<TryOnFinish>("quick");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSize, setShowSize] = useState(false);
  const t = useT();

  /* deep link (hanger QR / storefront "peeq it") = shop just this one piece:
     no rack, no category chips, no filmstrip — only the garment they scanned */
  const locked = !!initialGarment;

  useEffect(() => { setProfile(getProfile()); }, []);
  // size hint from the shopper's own measurements — never touches the try-on image
  const rec: SizeRec | null = selected && profile ? recommendSize(profile, selected) : null;
  const recSize = rec && !rec.free ? rec.size : undefined;

  /* back to the rack. Bumps requestSeq so an in-flight generation can't land
     on the stage after the shopper has already walked away from it. History is
     kept — the filmstrip is how they get a look back without re-generating. */
  const browseRack = useCallback(() => {
    requestSeq.current++;
    setSelected(null);
    setResultImage(null);
    setNotice("");
    setShowOriginal(false);
    setPhase("idle");
  }, [setSelected]);

  const startTryOn = useCallback(async (garment: Garment, finishOverride?: TryOnFinish) => {
    const useFinish = finishOverride ?? finish;
    const seq = ++requestSeq.current;
    setSelected(garment);
    setNotice("");
    setResultImage(null);
    setLookState(savedIds.current.has(garment.id) ? "saved" : "idle");
    setBagState("idle");
    setShowOriginal(false);
    setPhase("generating");
    setOverlay({ x: 0.5, y: 0.52, scale: 0.75, opacity: 0.92 });
    try {
      const url = await runTryOn(photo, garment.image, garment.category, {
        shopId: shop.id, garmentId: garment.id,
      }, useFinish);
      if (seq !== requestSeq.current) return;
      logLocalTryOn(garment.id, getKioskSessionId()); // no-op in Supabase mode (server logs it)
      setResultImage(url);
      setHistory((h) => [{ garment, url }, ...h.filter((x) => x.garment.id !== garment.id)].slice(0, 12));
      setPhase("result");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.error("Try-on failed, falling back to manual preview:", e);
      reportError("kiosk", "try-on fell back to manual preview: " + ((e as Error)?.message || e), {
        shopId: shop.id, garmentId: garment.id,
      });
      setNotice(t.previewNotice);
      setPhase("preview");
    }
  }, [setSelected, photo, shop.id, t.previewNotice, finish]);

  /* hanger QR / storefront deep link: start as soon as we have a photo */
  useEffect(() => {
    if (initialGarment && !autoStarted.current) {
      autoStarted.current = true;
      startTryOn(initialGarment);
    }
  }, [initialGarment, startTryOn]);

  /* filmstrip tap: an already-generated look comes back instantly, no re-generation */
  const showFromHistory = (h: { garment: Garment; url: string }) => {
    requestSeq.current++; // drop any in-flight generation's response
    setSelected(h.garment);
    setResultImage(h.url);
    setNotice("");
    setLookState(savedIds.current.has(h.garment.id) ? "saved" : "idle");
    setBagState("idle");
    setShowOriginal(false);
    setPhase("result");
  };

  /* straight from the mirror into the bag — same per-slug cart the storefront
     checks out from, so the try-on high converts without re-finding the piece */
  const addToBag = (size: string) => {
    if (!cart || !selected) return;
    cart.add(selected, size);
    setBagState("added");
    setTimeout(() => setBagState("idle"), 2200);
  };

  /* drag the garment overlay (manual preview fallback) */
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    dragRef.current = { rect };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { rect } = dragRef.current;
    setOverlay((o) => ({ ...o, x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "0 0 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 16px 0" }}>
        {/* stage — sized to the photo itself, so the shopper is never cropped */}
        {/* touchAction only locks during drag-preview — otherwise swiping on the photo must scroll the page */}
        <div ref={stageRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="k-stage"
          style={{
            ...(photoAr ? ({ "--ar": String(photoAr) } as React.CSSProperties) : {}),
            borderRadius: 20, overflow: "hidden", position: "relative", background: "var(--ink)",
            boxShadow: "var(--shadow-soft)", touchAction: phase === "preview" ? "none" : "auto", flexShrink: 0,
          }}>
          <img
            src={photo} alt="You"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", filter: phase === "generating" ? "brightness(.5)" : "none", transition: "filter .3s" }} />

          {/* result sits on top of the original so hold-to-compare is a crossfade */}
          {phase === "result" && resultImage && (
            <img src={resultImage} alt={"You wearing " + (selected?.name || "the garment")} draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: showOriginal ? 0 : 1, transition: "opacity .22s ease", pointerEvents: "none" }} />
          )}
          {phase === "result" && resultImage && (
            <button className="ph-btn"
              onPointerDown={(e) => { e.preventDefault(); setShowOriginal(true); }}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              onPointerCancel={() => setShowOriginal(false)}
              onContextMenu={(e) => e.preventDefault()}
              style={{ position: "absolute", top: 10, left: 10, background: "rgba(26,23,20,.6)", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "9px 15px", borderRadius: 999, userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}>
              {showOriginal ? t.originalPhoto : t.holdToCompare}
            </button>
          )}

          {phase === "preview" && selected && (
            <img src={selected.image} alt={selected.name} onPointerDown={onPointerDown}
              style={{
                position: "absolute",
                left: overlay.x * 100 + "%", top: overlay.y * 100 + "%",
                transform: "translate(-50%, -50%)",
                width: overlay.scale * 100 + "%",
                opacity: overlay.opacity,
                cursor: "grab", userSelect: "none",
                filter: "drop-shadow(0 6px 18px rgba(0,0,0,.45))",
              }} draggable={false} />
          )}

          {phase === "generating" && <GeneratingOverlay garment={selected} finish={finish} />}

          {phase === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16, background: "linear-gradient(transparent 60%, rgba(26,23,20,.85))" }}>
              <div style={{ color: "#fff", fontSize: 14.5 }}>{t.pickAPiece}</div>
            </div>
          )}
        </div>

        {/* finish picker — always visible; switching with a garment on stage
            re-runs it in the new finish (cache makes flip-backs instant) */}
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 400 }}>
          {([
            { id: "quick" as const, name: t.finishQuick, sub: t.finishQuickSub, icon: "bolt" as const },
            { id: "studio" as const, name: t.finishStudio, sub: t.finishStudioSub, icon: "sparkle" as const },
          ]).map((f) => (
            <button key={f.id} className="ph-btn"
              onClick={() => {
                if (f.id === finish) return;
                setFinish(f.id);
                if (selected && phase !== "idle") startTryOn(selected, f.id);
              }}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 14, textAlign: "left",
                border: finish === f.id ? "2px solid var(--violet)" : "1px solid var(--line)",
                background: finish === f.id ? "var(--card)" : "transparent",
              }}>
              <div style={{ fontFamily: "'Baloo 2', cursive", fontWeight: 700, fontSize: 14, color: finish === f.id ? "var(--violet)" : "var(--ink)" }}>
                <Icon name={f.icon} /> {f.name}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--stone)", marginTop: 1 }}>{f.sub}</div>
            </button>
          ))}
        </div>

        {/* result bar — price + actions, sticky-bar style in the thumb zone */}
        {phase === "result" && selected && (
          <div className="peek" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: "12px 16px", fontSize: 14, width: "100%", maxWidth: 400 }}>
            <span>
              <b>{selected.name}</b> <span style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(selected.price)}</span>
              {selected.sizes.length > 0 && (
                <span style={{ color: "var(--stone)", marginLeft: 8, fontSize: 12.5 }}>
                  {t.sizes} {selected.sizes.join(" · ")}
                </span>
              )}
            </span>
            {selected.sizes.length > 0 && (
              rec
                ? <SizeBadge rec={rec} onEdit={() => setShowSize(true)} />
                : <button className="ph-btn" onClick={() => setShowSize(true)}
                    style={{ border: "1px dashed var(--violet)", color: "var(--violet)", padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 999, background: "transparent" }}>
                    <Icon name="ruler" /> {t.findMySize}
                  </button>
            )}
            {cart && selected.inStock && (
              <button className="ph-btn"
                onClick={() => {
                  if (bagState === "added") return;
                  if (selected.sizes.length > 1) setBagState(bagState === "pick" ? "idle" : "pick");
                  else addToBag(selected.sizes[0] || "");
                }}
                style={{ background: bagState === "added" ? "var(--forest)" : "var(--violet)", color: "#fff", padding: "11px 24px", fontSize: 15, fontWeight: 700, fontFamily: "'Baloo 2', cursive", borderRadius: 999 }}>
                <Icon name={bagState === "added" ? "check" : "bag"} /> {bagState === "added" ? t.addedToBag : t.addToBag}
              </button>
            )}
            {cart && bagState === "pick" && selected.sizes.length > 1 && (
              <div className="peek" style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 600 }}>{t.chooseSize}</span>
                {selected.sizes.map((s) => {
                  const isRec = recSize === s;
                  return (
                    <button key={s} className="ph-btn" onClick={() => addToBag(s)}
                      style={{
                        padding: "8px 16px", fontSize: 13, borderRadius: 999, fontWeight: 600,
                        background: "var(--paper)", color: "var(--ink)",
                        border: isRec ? "1.5px dashed var(--violet)" : "1px solid var(--line)",
                      }}>
                      {s}{isRec ? <> <Icon name="star" /></> : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <button className="ph-btn" onClick={() => setInterested(true)}
              style={{ background: "var(--ink)", color: "var(--paper)", padding: "11px 24px", fontSize: 15, fontWeight: 700, fontFamily: "'Baloo 2', cursive", borderRadius: 999 }}>
              {t.iWantThis}
            </button>
            <button className="ph-btn" disabled={shareState === "sharing"}
              onClick={async () => {
                if (!resultImage) return;
                setShareState("sharing");
                try { await shareImage(resultImage, selected.name, shop.name); } catch {}
                setShareState("idle");
              }}
              style={{ border: "1px solid var(--line)", color: "var(--ink)", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, borderRadius: 999, background: "transparent", opacity: shareState === "sharing" ? 0.6 : 1 }}>
              {shareState === "sharing" ? t.sharing : t.share}
            </button>
            <button className="ph-btn" disabled={lookState !== "idle"}
              onClick={async () => {
                if (!resultImage) return;
                setLookState("saving");
                const saved = await saveLook({
                  garmentId: selected.id, garmentName: selected.name,
                  price: selected.price, shopName: shop.name, imageUrl: resultImage,
                });
                if (saved) { setLookState("saved"); savedIds.current.add(selected.id); onLookSaved(); }
                else setLookState("idle");
              }}
              style={{ border: "1px solid " + (lookState === "saved" ? "var(--violet)" : "var(--line)"), color: lookState === "saved" ? "var(--violet)" : "var(--ink)", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, borderRadius: 999, background: "transparent" }}>
              <Icon name={lookState === "saved" ? "heart-filled" : "heart"} /> {lookState === "saved" ? t.savedLook : lookState === "saving" ? t.savingLook : t.saveLook}
            </button>
            {cart && cart.count > 0 && (
              <button className="ph-btn" onClick={onOpenBag}
                style={{ width: "100%", textAlign: "center", fontSize: 13.5, fontWeight: 600, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3, background: "transparent" }}>
                {t.viewBag(cart.count)}
              </button>
            )}
            <span style={{ fontSize: 11.5, color: "var(--stone)", width: "100%", textAlign: "center" }}>{t.aiResultNote}</span>
          </div>
        )}

        {interested && selected && (
          <InterestedModal shop={shop} garment={selected} recommended={recSize} shared={shared} onClose={() => setInterested(false)} />
        )}

        {showSize && (
          <FindMySizeSheet
            initial={profile}
            onClose={() => setShowSize(false)}
            onSaved={(p) => { setProfile(p); setShowSize(false); }}
            onForget={() => { forgetProfile(); setProfile(null); setShowSize(false); }}
          />
        )}

        {notice && phase === "preview" && (
          <div style={{ fontSize: 12.5, color: "var(--ink)", background: "var(--butter)", padding: "7px 16px", borderRadius: 999 }}>
            {notice}
          </div>
        )}

        {/* preview controls */}
        {phase === "preview" && selected && (
          <div className="peek" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: "10px 16px", fontSize: 14, width: "100%", maxWidth: 400 }}>
            <span>
              <b>{selected.name}</b> <span style={{ color: "var(--stone)", fontWeight: 500 }}>{npr(selected.price)}</span>
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--stone)" }}>
              {t.sizeSlider}
              <input type="range" min="0.3" max="1.4" step="0.01" value={overlay.scale}
                onChange={(e) => setOverlay((o) => ({ ...o, scale: +e.target.value }))} style={{ accentColor: "var(--violet)" }} />
            </label>
            <span style={{ fontSize: 11.5, color: "var(--stone)" }}>{t.dragToPosition}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          {/* the rack is hidden while a piece is on stage, so this is the only
              way back to it — without it a shopper is stuck on one garment */}
          {!locked && phase !== "idle" && (
            <button className="ph-btn" onClick={browseRack}
              style={{ color: "var(--violet)", fontSize: 12.5, fontWeight: 600, padding: "2px 8px", textDecoration: "underline", textUnderlineOffset: 3 }}>
              {t.browseRack}
            </button>
          )}
          <button className="ph-btn" onClick={retakePhoto}
            style={{ color: "var(--stone)", fontSize: 12.5, padding: "2px 8px", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.retakePhoto}
          </button>
        </div>
      </div>

      {/* session filmstrip — flip between already-generated looks instantly */}
      {!locked && history.length > 0 && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontSize: 12, letterSpacing: ".1em", color: "var(--stone)", fontWeight: 600, marginBottom: 7 }}>
            {t.thisSession}
          </div>
          <div className="garment-rail" style={{ display: "flex", gap: 9, overflowX: "auto" }}>
            {history.map((h) => {
              const active = phase === "result" && selected?.id === h.garment.id;
              return (
                <button key={h.garment.id} className="ph-btn" onClick={() => showFromHistory(h)}
                  aria-label={"You wearing " + h.garment.name}
                  style={{ flexShrink: 0, width: 62, padding: 0, borderRadius: 14, overflow: "hidden", background: "var(--paper-deep)", border: "2px solid " + (active ? "var(--violet)" : "var(--line)") }}>
                  <img src={h.url} alt="" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* browse the rack — only while nothing is on stage. Once a piece is
          selected the shopper looks at themselves wearing it, not at the rack;
          t.browseRack above brings this back. Also hidden on a deep link,
          where only the scanned piece ever shows. */}
      {!locked && phase === "idle" && (
        <>
          {/* category chips */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px 0" }} className="garment-rail">
            {cats.map((c) => (
              <button key={c} className={"efc-chip " + (catFilter === c ? "on" : "off")} onClick={() => setCatFilter(c)}>
                {c}
              </button>
            ))}
          </div>

          {/* garment rail */}
          <div className="garment-rail" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "14px 16px 6px" }}>
            {rail.map((g) => (
              <button key={g.id} onClick={() => startTryOn(g)} className="ph-btn"
                style={{
                  flexShrink: 0, width: 108, padding: 0, borderRadius: 16, overflow: "hidden", textAlign: "left",
                  background: "var(--card)", border: "2px solid " + (selected?.id === g.id ? "var(--violet)" : "var(--line)"),
                }}>
                <div style={{ aspectRatio: "3/4", background: "var(--paper-deep)" }}>
                  <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div style={{ padding: "7px 9px 9px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--stone)", fontWeight: 500, marginTop: 2 }}>{npr(g.price)}</div>
                  {g.sizes.length > 0 && (
                    <div style={{ fontSize: 9.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sizes.join(" ")}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

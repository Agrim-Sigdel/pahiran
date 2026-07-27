"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { npr, waLink } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { runTryOn, getKioskSessionId } from "@/lib/tryon";
import { logLocalTryOn } from "@/lib/storage";
import { reportError } from "@/lib/logging";
import {
  getRememberedPhoto, rememberPhoto, forgetPhoto,
  saveLook, listLooks, shareImage, downloadImage,
} from "@/lib/looks";
import { getProfile, forgetProfile, type Profile } from "@/lib/profile";
import { useAccount, getContact } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { CartDrawer } from "@/components/storefront";
import { recommendSize, type SizeRec } from "@/lib/sizing";
import { LangContext, STRINGS, useLangState, useT } from "@/lib/i18n";
import type { Wearable, Shop } from "@/lib/types";
import Icon from "@/components/Icon";
import EeMark from "@/components/EeMark";
import { useImageAspect } from "@/lib/use-image-aspect";
import {
  barBtn, LooksGallery, InterestedModal, SizeBadge, FindMySizeSheet, type KioskProps,
} from "@/components/kiosk/parts";
import { useIdleReset, wipeDeviceSession } from "@/components/kiosk/session";

/* Kiosk — light, touch-first shopper flow:
   attract (saved-photo fast path) → capture (consent inline) → try on.
   Serves /k/[slug] on shoppers' phones; ?g=<garmentId> (hanger QR /
   storefront "peeq it") jumps straight to that piece.

   peeq UI rules applied here: the photo is the interface (stage adopts the
   photo's own aspect ratio — nothing is cropped), violet only where a tap
   does something, the blink is the loading state, everything touchable is
   round, primary actions live in the bottom third. */

export default function Kiosk({ shop, catalog, exit, initialGarmentId, shared = false }: KioskProps) {
  const [step, setStep] = useState<"attract" | "capture" | "tryon">("attract");
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<Wearable | null>(null);
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
    clearCart();
    void wipeDeviceSession(loggedIn);
    // depends on cart.clear, not cart: useCart returns a fresh object every
    // render, so depending on cart would change reset's identity every render
    // and re-arm the idle timers forever — they'd never actually fire.
  }, [shared, clearCart, loggedIn]);

  /* The attract screen has nothing personal on it, so it's exempt from the
     idle countdown — otherwise the tablet would loop one all day. */
  const [idleWarning, dismissIdle] = useIdleReset(shared && step !== "attract", reset);

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
          <button className="ph-btn" onClick={toggleLang} style={{ ...barBtn, color: "var(--violet)", borderColor: "var(--violet)" }}>
            <Icon name="globe" /><span className="hide-sm"> {t.switchLang}</span>
          </button>
          {contactWa && (
            <a className="ph-btn" href={contactWa} target="_blank" rel="noopener noreferrer"
              aria-label={t.contact}
              style={{ ...barBtn, color: "var(--whatsapp)", borderColor: "var(--whatsapp)", textDecoration: "none" }}>
              <Icon name="phone" /><span className="hide-sm"> {t.contact}</span>
            </a>
          )}
          {canShop && cart.count > 0 && (
            <button className="ph-btn" onClick={() => setCartOpen(true)} aria-label={t.viewBag(cart.count)}
              style={{ ...barBtn, background: "var(--violet)", color: "var(--on-accent)", border: "none" }}>
              <Icon name="bag" /> ({cart.count})
            </button>
          )}
          {looksCount > 0 && !shared && (
            <button className="ph-btn" onClick={() => setShowLooks(true)} aria-label={t.myLooksLabel}
              style={{ ...barBtn, background: "var(--butter)", color: "var(--on-light)", border: "none" }}>
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
          <button className="ph-btn" onClick={dismissIdle}
            style={{ background: "var(--butter)", color: "var(--on-light)", fontWeight: 700, borderRadius: 999, padding: "7px 16px", fontSize: 13.5 }}>
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
  count: number; highlight: Wearable | null; start: () => void;
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
            borderRadius: 20, overflow: "hidden", background: "var(--slab)", position: "relative",
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
function GeneratingOverlay({ garment }: { garment: Wearable | null }) {
  const t = useT();
  const [msg, setMsg] = useState(0);
  /* Asymptotic progress — quick at first, easing toward a finish it never
     claims, so it stays honest whether the result lands in 2s (cache) or in
     two minutes.

     tau was 30s with a 96% ceiling, which saturated at about a minute and a
     half and then sat perfectly still. A bar that stops moving reads as a
     crash, so shoppers gave up on results that were still coming. 45s reaching
     99 keeps it visibly creeping across the whole realistic range: ~74% at a
     minute, 93% at two, 98% at three. The last percent belongs to the result
     actually arriving. */
  const [progress, setProgress] = useState(4);
  const [slow, setSlow] = useState(false);
  const tau = 45;
  /* Past this, say so outright. A studio finish on a multi-piece outfit really
     does take this long, and silence is what makes a wait feel like a failure. */
  const SLOW_AFTER = 70;

  /* Stops on the last line instead of wrapping. Looping back to "Peeq gardai…"
     after a minute reads as having started over. */
  useEffect(() => {
    const timer = setInterval(
      () => setMsg((m) => Math.min(m + 1, t.genMessages.length - 1)),
      3200
    );
    return () => clearInterval(timer);
  }, [t.genMessages.length]);

  useEffect(() => {
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setProgress(Math.max(4, Math.min(99, Math.round(100 * (1 - Math.exp(-s / tau))))));
      setSlow(s > SLOW_AFTER);
    }, 300);
    return () => clearInterval(timer);
  }, [tau]);

  /* Column layout, not two absolute layers: the ee centers in whatever space
     is left ABOVE the text block, so on a short mobile stage they can never
     overlap. All sizes clamp with the viewport. */
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EeMark size="clamp(38px, 12vw, 64px)" looking color="#fff" />
      </div>
      <div style={{ padding: "26px 14px 14px", background: "linear-gradient(transparent, rgba(26,23,20,.9) 45%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, textAlign: "center" }}>
        {garment && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.16)", borderRadius: 999, padding: "5px 14px 5px 5px", maxWidth: "88%" }}>
            <img src={garment.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</span>
          </div>
        )}
        <div key={msg} className="peek ph-display" style={{ fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.35, fontWeight: 600, color: "#fff", maxWidth: 340, padding: "0 6px" }}>{t.genMessages[msg % t.genMessages.length]}</div>
        <div style={{ width: "72%", maxWidth: 300, height: 5, borderRadius: 5, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", borderRadius: 5, background: "var(--violet)", transition: "width .3s linear" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.55)", fontSize: 11.5, lineHeight: 1.5, maxWidth: 320, padding: "0 8px" }}>
          {progress}% · {slow ? t.genSlow : t.genFooter}
        </div>
      </div>
    </div>
  );
}

/* ---------- try-on screen: photo stage + garment rail ---------- */
interface TryOnScreenProps {
  photo: string;
  shop: Shop;
  rail: Wearable[];
  cats: string[];
  catFilter: string;
  setCatFilter: (c: string) => void;
  selected: Wearable | null;
  setSelected: (g: Wearable | null) => void;
  retakePhoto: () => void;
  initialGarment: Wearable | null;
  cart: ReturnType<typeof useCart> | null; // null = no public storefront (no slug) — hide add-to-bag
  onLookSaved: () => void;
  onOpenBag: () => void;
  shared: boolean;
}

function TryOnScreen({ photo, shop, rail, cats, catFilter, setCatFilter, selected, setSelected, retakePhoto, initialGarment, cart, onLookSaved, onOpenBag, shared }: TryOnScreenProps) {
  const [phase, setPhase] = useState<"idle" | "generating" | "result" | "failed">("idle");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [interested, setInterested] = useState(false);
  const [bagState, setBagState] = useState<"idle" | "pick" | "added">("idle");
  const [lookState, setLookState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareState, setShareState] = useState<"idle" | "sharing">("idle");
  const [downloading, setDownloading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false); // hold-to-compare
  const [history, setHistory] = useState<{ garment: Wearable; url: string }[]>([]); // this session's generated looks
  const savedIds = useRef<Set<string>>(new Set()); // garments already saved to My Looks this session
  const stageRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0); // ignore stale responses if shopper taps another garment mid-generation
  const autoStarted = useRef(false);
  const photoAr = useImageAspect(photo); // stage adopts the photo's own ratio — no cropping
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

  const startTryOn = useCallback(async (garment: Wearable) => {
    const seq = ++requestSeq.current;
    setSelected(garment);
    setNotice("");
    setResultImage(null);
    setLookState(savedIds.current.has(garment.id) ? "saved" : "idle");
    setBagState("idle");
    setShowOriginal(false);
    setPhase("generating");
    try {
      const url = await runTryOn(photo, garment.image, garment.category, {
        shopId: shop.id,
        /* A rendered fabric x cut goes up as a compositionId; the server
           resolves it from its own table and refuses an unpublished one. */
        garmentId: garment.compositionId ? null : garment.id,
        compositionId: garment.compositionId ?? null,
      });
      if (seq !== requestSeq.current) return;
      logLocalTryOn(garment.id, getKioskSessionId()); // no-op in Supabase mode (server logs it)
      setResultImage(url);
      setHistory((h) => [{ garment, url }, ...h.filter((x) => x.garment.id !== garment.id)].slice(0, 12));
      setPhase("result");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      /* Say it failed. This used to fall back to pasting the flat garment
         photo over the shopper's picture — which read as a bad try-on rather
         than none, and shoppers judged the piece on it. The server refunds the
         credit on failure, so retrying costs nothing. */
      console.error("Try-on failed:", e);
      reportError("kiosk", "try-on failed: " + ((e as Error)?.message || e), {
        shopId: shop.id, garmentId: garment.id,
      });
      /* The server's own message when it explains something the shopper can
         act on (an unusable photo, a shop out of try-ons); the generic line
         when it's an outage they can only wait out. */
      setNotice((e as Error)?.message || "");
      setPhase("failed");
    }
  }, [setSelected, photo, shop.id]);

  /* hanger QR / storefront deep link: start as soon as we have a photo */
  useEffect(() => {
    if (initialGarment && !autoStarted.current) {
      autoStarted.current = true;
      startTryOn(initialGarment);
    }
  }, [initialGarment, startTryOn]);

  /* filmstrip tap: an already-generated look comes back instantly, no re-generation */
  const showFromHistory = (h: { garment: Wearable; url: string }) => {
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "0 0 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 16px 0" }}>
        {/* stage — sized to the photo itself, so the shopper is never cropped */}
        <div ref={stageRef} className="k-stage"
          style={{
            ...(photoAr ? ({ "--ar": String(photoAr) } as React.CSSProperties) : {}),
            borderRadius: 20, overflow: "hidden", position: "relative", background: "var(--slab)",
            boxShadow: "var(--shadow-soft)", flexShrink: 0,
          }}>
          <img
            src={photo} alt="You"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", filter: phase === "generating" ? "brightness(.5)" : "none", transition: "filter .3s" }} />

          {/* result sits on top of the original so hold-to-compare is a crossfade */}
          {phase === "result" && resultImage && (
            <img src={resultImage} alt={"You wearing " + (selected?.name || "the garment")} draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: showOriginal ? 0 : 1, transition: "opacity .22s ease", pointerEvents: "none" }} />
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

          {/* Over the shopper's own photo, so it's clear what didn't happen to
              it — and the piece they picked is never shown pasted on top. */}
          {phase === "failed" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "rgba(26,23,20,.72)" }}>
              <div className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "#fff" }}>{t.tryonFailedTitle}</div>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.82)", lineHeight: 1.6, maxWidth: 300, margin: 0 }}>
                {notice || t.tryonFailedBody}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {selected && (
                  <button className="ph-btn btn-violet" onClick={() => startTryOn(selected)} style={{ padding: "10px 22px", fontSize: 14 }}>
                    <Icon name="reset" /> {t.tryAgain}
                  </button>
                )}
                <button className="ph-btn" onClick={() => { setNotice(""); setSelected(null); setPhase("idle"); }}
                  style={{ padding: "10px 18px", fontSize: 13.5, color: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: 999 }}>
                  {t.browseRack}
                </button>
              </div>
            </div>
          )}

          {phase === "generating" && <GeneratingOverlay garment={selected} />}

          {phase === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16, background: "linear-gradient(transparent 60%, rgba(26,23,20,.85))" }}>
              <div style={{ color: "#fff", fontSize: 14.5 }}>{t.pickAPiece}</div>
            </div>
          )}
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
                style={{ background: bagState === "added" ? "var(--ok)" : "var(--violet)", color: "var(--on-accent)", padding: "11px 24px", fontSize: 15, fontWeight: 700, fontFamily: "'Baloo 2', cursive", borderRadius: 999 }}>
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
              <Icon name="phone" /> {t.iWantThis}
            </button>
            <button className="ph-btn" disabled={shareState === "sharing"}
              onClick={async () => {
                if (!resultImage) return;
                setShareState("sharing");
                try { await shareImage(resultImage, selected.name, shop.name); } catch {}
                setShareState("idle");
              }}
              style={{ border: "1px solid var(--line)", color: "var(--ink)", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, borderRadius: 999, background: "transparent", opacity: shareState === "sharing" ? 0.6 : 1 }}>
              <Icon name="share" /><span className="hide-sm"> {shareState === "sharing" ? t.sharing : t.share}</span>
            </button>
            <button className="ph-btn" disabled={downloading}
              onClick={async () => {
                if (!resultImage) return;
                setDownloading(true);
                try { await downloadImage(resultImage, selected.name); } catch {}
                setDownloading(false);
              }}
              style={{ border: "1px solid var(--line)", color: "var(--ink)", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, borderRadius: 999, background: "transparent", opacity: downloading ? 0.6 : 1 }}>
              <Icon name="download" /><span className="hide-sm"> {t.saveImage}</span>
            </button>
            <button className="ph-btn" disabled={lookState !== "idle"}
              onClick={async () => {
                if (!resultImage) return;
                setLookState("saving");
                const saved = await saveLook({
                  garmentId: selected.id, compositionId: selected.compositionId ?? null,
                  garmentName: selected.name,
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
                <div style={{ aspectRatio: "3/4", background: "var(--paper-deep)", position: "relative" }}>
                  <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {/* No camera has seen this piece — it's a render of cloth in a
                      cut the shop will stitch. Saying so on the tile matters
                      more than on the result, because this is where the
                      shopper decides what they're looking at. */}
                  {g.stitchedToOrder && (
                    <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(26,23,20,.78)", color: "#fff", fontSize: 8.5, fontWeight: 600, letterSpacing: ".07em", padding: "3px 6px", borderRadius: 2 }}>
                      {t.madeToOrder}
                    </span>
                  )}
                </div>
                <div style={{ padding: "7px 9px 9px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--stone)", fontWeight: 500, marginTop: 2 }}>{npr(g.price)}</div>
                  {g.sizes.length > 0 ? (
                    <div style={{ fontSize: 9.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sizes.join(" ")}</div>
                  ) : g.stitchedToOrder ? (
                    <div style={{ fontSize: 9.5, color: "var(--stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.yourMeasurements}</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

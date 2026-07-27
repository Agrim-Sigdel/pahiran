"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { npr, waLink } from "@/lib/constants";
import { fileToCompressedDataURL, preloadImage } from "@/lib/images";
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
import {
  LooksGallery, InterestedModal, SizeBadge, FindMySizeSheet, type KioskProps,
} from "@/components/kiosk/parts";
import { useIdleReset, wipeDeviceSession } from "@/components/kiosk/session";

/* Kiosk v2 — the fitting room.

   Same three beats as v1 (attract → capture → try on) and exactly the same
   privacy behaviour, which is shared through components/kiosk/*. What changes
   is how the try-on itself feels, in three places:

   1. Nothing is cropped, ever. v1 sized the stage to the shopper's photo and
      drew the render into it with object-fit: cover. The studio render is
      always 1024x1536, so any photo that wasn't 2:3 lost the render's head or
      feet — the one thing the shopper came to look at. Here the stage is a
      free box, every layer is *contained* in it, and the leftover space is
      filled with a blur of the image itself.
   2. Nothing is revealed before it can be seen. v1 swapped to the result the
      moment the URL came back; the browser then still had to fetch and decode
      a signed-URL render, so the blink stopped over a dim photo and the look
      appeared a beat later, after the loading state had already said it was
      done. Here the image is decoded first, the bar runs to 100%, and the
      overlay hands over on a picture that is ready to paint.
   3. The rack never leaves. In v1 choosing a piece hid the rack and getting
      back was a text link; here the rail is always there — beside the stage
      in landscape, under it on a phone — and every piece already tried wears
      the shopper's own render as its tile. Trying the next thing, or going
      back to the one that suited them, is one tap and no re-generation.

   Light or dark follows the device's own setting. The room's colours all
   come from the --k2-* variables in globals.css, so neither theme is
   written here. */

/* How long the finished render is held at "ready" before it takes the stage.
   Long enough to read as an arrival rather than a pop, short enough that
   nobody is waiting on it. */
const REVEAL_HOLD_MS = 420;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function KioskV2({ shop, catalog, exit, initialGarmentId, shared = false }: KioskProps) {
  const [step, setStep] = useState<"attract" | "capture" | "tryon">("attract");
  const [photo, setPhoto] = useState<string | null>(null);
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

  /* End of one shopper's session. On a personal phone this only returns to
     the attract screen — the saved photo and looks are that shopper's own. On
     a shared tablet every trace of the person who just walked away goes with
     it (see components/kiosk/session). */
  const reset = useCallback(() => {
    setPhoto(null);
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
    <div className="k2-root">
      {/* one slim bar, translucent over the room — everything else is photo */}
      <div className="k2-bar">
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <EeMark size={17} color="var(--k2-accent)" />
          <span className="ph-display" style={{ fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shop.name || "peeq"}
          </span>
          {shop.area && <span className="hide-sm" style={{ color: "var(--k2-quiet)", fontSize: 12 }}>{shop.area}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {/* language toggle: visible on every screen, never buried */}
          <button className="ph-btn k2-pill" onClick={toggleLang}>
            <Icon name="globe" /><span className="hide-sm"> {t.switchLang}</span>
          </button>
          {contactWa && (
            <a className="ph-btn k2-pill wa" href={contactWa} target="_blank" rel="noopener noreferrer" aria-label={t.contact}>
              <Icon name="phone" /><span className="hide-sm">{t.contact}</span>
            </a>
          )}
          {canShop && cart.count > 0 && (
            <button className="ph-btn k2-pill accent" onClick={() => setCartOpen(true)} aria-label={t.viewBag(cart.count)}>
              <Icon name="bag" /> ({cart.count})
            </button>
          )}
          {looksCount > 0 && !shared && (
            <button className="ph-btn k2-pill" onClick={() => setShowLooks(true)} aria-label={t.myLooksLabel}>
              <Icon name="heart-filled" /><span className="hide-sm"> {t.myLooksLabel}</span> ({looksCount})
            </button>
          )}
          {step !== "attract" && (
            <button className="ph-btn k2-pill ghost" onClick={reset} aria-label={t.startOver} title={t.startOver}>
              <Icon name="reset" /><span className="hide-sm"> {t.startOver}</span>
            </button>
          )}
          {/* leaving the kiosk ends the session too — on a shared tablet that
              must wipe, not just navigate away */}
          <button className="ph-btn k2-pill ghost" onClick={() => { reset(); exit(); }} aria-label={t.exitKiosk} title={t.exitKiosk}>
            <Icon name="close" />
          </button>
        </div>
      </div>

      {idleWarning && (
        <div role="status" aria-live="polite"
          style={{ position: "fixed", left: "50%", top: 62, transform: "translateX(-50%)", zIndex: 90, background: "var(--butter)", color: "var(--on-light)", borderRadius: 999, padding: "11px 20px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 26px rgba(0,0,0,.45)" }}>
          {t.stillThere}
          <button className="ph-btn" onClick={dismissIdle}
            style={{ background: "#1A1714", color: "#FAF6F0", fontWeight: 700, borderRadius: 999, padding: "7px 16px", fontSize: 13.5 }}>
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
        <AttractV2 catalog={catalog} highlight={initialGarment}
          start={() => setStep("capture")}
          savedPhoto={savedPhoto}
          useSaved={() => { setPhoto(savedPhoto); setStep("tryon"); }}
          forgetSaved={() => { forgetPhoto(); setSavedPhoto(null); }}
          loggedIn={loggedIn} showAccount={configured && !shared} />
      )}
      {step === "capture" && <CaptureV2 onPhoto={takePhoto} loggedIn={loggedIn} shared={shared} />}
      {step === "tryon" && photo && (
        <MirrorV2 photo={photo} shop={shop} rail={rail} cats={cats} catFilter={catFilter} setCatFilter={setCatFilter}
          retakePhoto={() => setStep("capture")} initialGarment={initialGarment}
          cart={canShop ? cart : null} onLookSaved={() => setLooksCount((n) => n + 1)}
          onOpenBag={() => setCartOpen(true)} shared={shared} />
      )}
    </div>
    </LangContext.Provider>
  );
}

/* ---------- attract: the shop's own rack, drifting ---------- */
function AttractV2({ catalog, highlight, start, savedPhoto, useSaved, forgetSaved, loggedIn, showAccount }: {
  catalog: Wearable[]; highlight: Wearable | null; start: () => void;
  savedPhoto: string | null; useSaved: () => void; forgetSaved: () => void;
  loggedIn: boolean; showAccount: boolean;
}) {
  const t = useT();
  const strip = catalog.slice(0, 14);
  return (
    <div className="k2-body" style={{ position: "relative" }}>
      {/* what's actually inside this shop, before we ask anyone for a photo */}
      <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", overflow: "hidden", opacity: 0.3 }}>
        <div className="k2-drift">
          {[...strip, ...strip].map((g, i) => (
            <img key={g.id + "-" + i} src={g.image} alt=""
              style={{ width: 132, aspectRatio: "3/4", objectFit: "cover", borderRadius: 14, flexShrink: 0 }} />
          ))}
        </div>
      </div>
      <div className="k2-attract-scrim" />

      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "28px 24px" }}>
        <EeMark size={52} looking color="var(--k2-accent)" />
        <div className="kicker" style={{ margin: "18px 0 10px", color: "var(--violet)" }}>{t.virtualTrialRoom}</div>
        <div className="ph-display" style={{ fontSize: "clamp(30px, 6.5vw, 46px)", lineHeight: 1.12 }}>
          {t.headline1}<br />{t.headline2}
        </div>
        {highlight ? (
          <div className="peek" style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 26px", background: "var(--k2-glass)", border: "1px solid var(--k2-hair)", borderRadius: 18, padding: "10px 18px 10px 10px" }}>
            <img src={highlight.image} alt={highlight.name} style={{ width: 50, height: 66, objectFit: "cover", borderRadius: 12 }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{highlight.name}</div>
              <div style={{ color: "var(--k2-quiet)", fontWeight: 500, fontSize: 14 }}>{npr(highlight.price)}</div>
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--k2-quiet)", fontSize: 15.5, maxWidth: 400, margin: "16px 0 28px", lineHeight: 1.7 }}>
            {t.attractSub(catalog.length)}
          </p>
        )}
        <button className="ph-btn" onClick={start}
          style={{ background: "var(--k2-accent)", color: "var(--k2-accent-ink)", fontFamily: "'Baloo 2', cursive", fontWeight: 700, padding: "16px 46px", fontSize: 18, borderRadius: 999 }}>
          {highlight ? t.seeItOnYou : t.tapToBegin}
        </button>
        {savedPhoto && (
          <>
            <div style={{ height: 14 }} />
            <button className="ph-btn k2-pill" onClick={useSaved} style={{ padding: "8px 18px 8px 8px", fontSize: 14 }}>
              <img src={savedPhoto} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
              {t.continueSaved}
            </button>
            <button className="ph-btn" onClick={forgetSaved}
              style={{ color: "var(--k2-quiet)", fontSize: 12.5, marginTop: 14, textDecoration: "underline", textUnderlineOffset: 3 }}>
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
    </div>
  );
}

/* ---------- capture: upload-first, consent inline ----------
   Unchanged in substance from v1, and deliberately so: it opens on an upload
   prompt so no camera-permission dialog appears until the shopper asks for
   the camera, and remember-my-photo is opt-in and absent on shared tablets.
   What v2 adds is a framing guide on the live camera — most bad renders come
   from a cropped or too-close source photo. */
function CaptureV2({ onPhoto, loggedIn, shared = false }: { onPhoto: (dataUrl: string, remember: boolean) => void; loggedIn: boolean; shared?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [camState, setCamState] = useState<"starting" | "live" | "denied">("starting");
  const [camAr, setCamAr] = useState<number | null>(null); // box matches the stream, so the viewfinder isn't cropped either
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
    <div className="k2-body">
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 20px 28px", gap: 12 }}>
        <div className="ph-display" style={{ fontWeight: 600, fontSize: "clamp(19px, 3vw, 24px)", textAlign: "center" }}>
          {mode === "upload" ? t.uploadTitle : t.standBack}
        </div>
        <div style={{ fontSize: 13, color: "var(--k2-quiet)", marginTop: -6 }}>{t.waistUpNote}</div>

        {mode === "upload" ? (
          /* upload-first: the whole box is the file picker — no camera
             permission is requested unless the shopper asks for the camera */
          <div onClick={() => fileRef.current?.click()} className="k-cam"
            style={{
              "--ar": "3/4", borderRadius: 20, border: "2px dashed var(--violet)", background: "var(--k2-glass)",
              display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center",
              flexShrink: 0, padding: 24, cursor: "pointer", textAlign: "center",
            } as React.CSSProperties}>
            <Icon name="person" size={40} />
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--k2-quiet)", maxWidth: 260 }}>{t.uploadHint}</div>
            <span className="ph-btn" style={{ background: "var(--k2-accent)", color: "var(--k2-accent-ink)", fontFamily: "'Baloo 2', cursive", fontWeight: 700, padding: "12px 26px", fontSize: 15, borderRadius: 999 }}>
              {t.uploadCta}
            </span>
          </div>
        ) : (
          <div onClick={camState === "denied" ? () => fileRef.current?.click() : undefined} className="k-cam"
            style={{
              ...(camAr ? ({ "--ar": String(camAr) } as React.CSSProperties) : {}),
              borderRadius: 20, overflow: "hidden", background: "var(--slab)", position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              cursor: camState === "denied" ? "pointer" : "default",
            }}>
            {camState !== "denied" ? (
              <>
                {/* contained, never cropped — the shopper sees exactly the
                    frame that will be sent */}
                <video ref={videoRef} playsInline muted
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    if (el.videoWidth && el.videoHeight) setCamAr(el.videoWidth / el.videoHeight);
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scaleX(-1)" }} />
                {/* framing guide: a render is only as good as the photo, and
                    the commonest bad photo is a close-up selfie */}
                {camState === "live" && (
                  <svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid meet" aria-hidden
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.5 }}>
                    <g fill="none" stroke="var(--butter)" strokeWidth="0.7" strokeDasharray="3 3" strokeLinecap="round">
                      <circle cx="50" cy="34" r="12" />
                      <path d="M27 84c0-13 10-24 23-24s23 11 23 24" />
                      <path d="M31 84v42M69 84v42" />
                    </g>
                  </svg>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", color: "var(--k2-quiet)", padding: 24, fontSize: 14, lineHeight: 1.6 }}>
                {t.cameraUnavailable}<br />
                <span style={{ color: "var(--violet)", fontWeight: 600 }}>{t.tapAnywhere}</span><br />{t.uploadInstead}
              </div>
            )}
            {camState === "starting" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", color: "var(--k2-quiet)", fontSize: 13 }}>
                <EeMark size={34} looking color="rgba(255,255,255,.8)" />
                {t.startingCamera}
              </div>
            )}
          </div>
        )}

        <div style={{ maxWidth: 360, textAlign: "left", background: "var(--k2-glass)", border: "1px solid var(--k2-hair)", borderRadius: 18, padding: "13px 17px", fontSize: 13, lineHeight: 1.6, color: "var(--k2-quiet)" }}>
          <b style={{ color: "var(--ink)" }}>{t.consentTitle}</b> {t.consentBody}{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--violet)", textUnderlineOffset: 2 }}>
            {t.privacyLink}
          </a>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {mode === "upload" ? (
            <button className="ph-btn k2-pill" onClick={() => setMode("camera")} style={{ padding: "12px 24px", fontSize: 15 }}>
              <Icon name="camera" /> {t.useCameraInstead}
            </button>
          ) : (
            <>
              {camState === "live" && (
                <button className="ph-btn" onClick={snap}
                  style={{ background: "var(--k2-accent)", color: "var(--k2-accent-ink)", fontFamily: "'Baloo 2', cursive", fontWeight: 700, padding: "14px 32px", fontSize: 16, borderRadius: 999 }}>
                  {t.agreeTakePhoto}
                </button>
              )}
              <button className="ph-btn k2-pill" onClick={() => fileRef.current?.click()} style={{ padding: "12px 24px", fontSize: 15 }}>
                {t.agreeUpload}
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files?.[0])} />
        </div>

        {/* remembering a face is a personal-device feature — offering it on a
            shop tablet would store one shopper's photo for the next one */}
        {!shared && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--k2-quiet)", cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: "var(--violet)", width: 16, height: 16 }} />
            {t.rememberPhoto}
          </label>
        )}
        <div style={{ color: "var(--k2-quiet)", fontSize: 12, textAlign: "center", maxWidth: 380 }}>
          {!shared && remember ? t.rememberedNote : t.notSavedNote}
          {!shared && loggedIn && remember && " Synced privately to your peeq account — only you can see it."}
        </div>
      </div>
    </div>
  );
}

/* ---------- the generating overlay ----------
   The ee blinks over the dimmed photo, as everywhere else in peeq. The one
   change from v1: `ready` — the render has landed AND decoded, so the bar can
   honestly finish. Without it the bar sits at 99% through the download. */
function RevealOverlay({ garment, ready }: { garment: Wearable | null; ready: boolean }) {
  const t = useT();
  const [msg, setMsg] = useState(0);
  /* Asymptotic progress — quick at first, easing toward a finish it never
     claims, so it stays honest whether the result lands in 2s (cache) or in
     two minutes. 45s reaching 99 keeps it visibly creeping across the whole
     realistic range: ~74% at a minute, 93% at two, 98% at three. */
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
    if (ready) return; // frozen at 100 by the render below; stop fighting it
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setProgress(Math.max(4, Math.min(99, Math.round(100 * (1 - Math.exp(-s / tau))))));
      setSlow(s > SLOW_AFTER);
    }, 300);
    return () => clearInterval(timer);
  }, [tau, ready]);

  const pct = ready ? 100 : progress;

  /* Column layout, not two absolute layers: the ee centers in whatever space
     is left ABOVE the text block, so on a short stage they can never overlap. */
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EeMark size="clamp(38px, 12vw, 64px)" looking color="#fff" />
      </div>
      <div style={{ padding: "26px 14px 16px", background: "linear-gradient(transparent, rgba(13,11,10,.92) 45%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, textAlign: "center" }}>
        {garment && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.16)", borderRadius: 999, padding: "5px 14px 5px 5px", maxWidth: "88%" }}>
            <img src={garment.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</span>
          </div>
        )}
        <div key={ready ? "ready" : msg} className="peek ph-display" style={{ fontSize: "clamp(15px, 4.4vw, 18px)", lineHeight: 1.35, fontWeight: 600, color: ready ? "var(--butter)" : "#fff", maxWidth: 340, padding: "0 6px" }}>
          {ready ? t.genReady : t.genMessages[msg % t.genMessages.length]}
        </div>
        <div style={{ width: "72%", maxWidth: 300, height: 5, borderRadius: 5, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct + "%", borderRadius: 5, background: ready ? "var(--butter)" : "#fff", transition: "width .3s linear, background .3s ease" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.55)", fontSize: 11.5, lineHeight: 1.5, maxWidth: 320, padding: "0 8px" }}>
          {pct}%{ready ? "" : " · " + (slow ? t.genSlow : t.genFooter)}
        </div>
      </div>
    </div>
  );
}

/* ---------- ask before spending a try-on ----------
   Every generation costs the shop a credit and the shopper a minute of
   waiting, and the rack's tiles sit a thumb-width apart. Nothing reaches
   /api/tryon until someone has said yes to this piece by name. A look
   already generated against this photo never gets here — it comes straight
   back from the session, no second call. */
function ConfirmTryOn({ garment, onCancel, onConfirm }: { garment: Wearable; onCancel: () => void; onConfirm: () => void }) {
  const t = useT();
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="peek"
        style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", width: 380, maxWidth: "100%", padding: "22px 22px 20px", marginBottom: 8, color: "var(--ink)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left" }}>
          <img src={garment.image} alt="" style={{ width: 62, height: 82, objectFit: "cover", borderRadius: 12, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="ph-display" style={{ fontSize: 21, fontWeight: 600 }}>{t.confirmTryTitle}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</div>
            <div style={{ fontSize: 13, color: "var(--k2-quiet)" }}>
              {npr(garment.price)}{garment.stitchedToOrder ? " · " + t.madeToOrder.toLowerCase() : ""}
            </div>
          </div>
        </div>
        <p style={{ color: "var(--k2-quiet)", fontSize: 13, lineHeight: 1.55, margin: "14px 0 0" }}>
          {t.confirmTryBody(garment.name)}
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ph-btn k2-pill" onClick={onCancel} style={{ flex: 1, justifyContent: "center", padding: 13, fontSize: 14 }}>
            {t.cancel}
          </button>
          <button className="ph-btn k2-pill accent" onClick={onConfirm}
            style={{ flex: 2, justifyContent: "center", padding: 13, fontSize: 15, fontFamily: "'Baloo 2', cursive" }}>
            {t.confirmTryYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- "i want this": one screen to act on a look ----------
   Both ways of wanting something in one place — put it in the bag and check
   out later, or hand the shop your number so they hold it. Size is picked
   once here and used by whichever the shopper chooses, so the recommendation
   from find-my-size actually lands on the thing they walk away with. */
function WantThisSheet({ garment, look, rec, canBag, bagged, saved, onAddToBag, onTellShop, onSaveLook, onClose }: {
  garment: Wearable;
  look: string | null;
  rec: SizeRec | null;
  canBag: boolean;
  bagged: boolean;
  saved: boolean;
  onAddToBag: (size: string) => void;
  onTellShop: (size: string) => void;
  onSaveLook: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const recSize = rec && !rec.free ? rec.size : undefined;
  // opens on the recommended size when there is one — the whole point of
  // having asked for their height
  const [size, setSize] = useState(
    recSize && garment.sizes.includes(recSize) ? recSize : garment.sizes[0] || ""
  );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "var(--scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="peek"
        style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", width: 400, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: "20px 22px 22px", marginBottom: 8, color: "var(--ink)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left" }}>
          {/* the render, not the flat-lay: this is the thing they liked */}
          <img src={look || garment.image} alt="" style={{ width: 66, height: 88, objectFit: "cover", borderRadius: 12, flexShrink: 0, background: "var(--paper-deep)" }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ph-display" style={{ fontSize: 20, fontWeight: 600 }}>{t.iWantThis}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</div>
            <div style={{ fontSize: 13, color: "var(--stone)" }}>
              {npr(garment.price)}{garment.stitchedToOrder ? " · " + t.madeToOrder.toLowerCase() : ""}
            </div>
          </div>
        </div>

        {garment.sizes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12.5, color: "var(--stone)", fontWeight: 600, marginBottom: 7 }}>
              {t.chooseSize}
              {recSize && garment.sizes.includes(recSize) && (
                <span style={{ color: "var(--violet)", marginLeft: 8 }}>{t.recommendedForYou}: {recSize}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {garment.sizes.map((s) => {
                const on = size === s;
                const isRec = recSize === s;
                return (
                  <button key={s} className="ph-btn" onClick={() => setSize(s)}
                    style={{
                      padding: "9px 18px", fontSize: 13.5, borderRadius: 999, fontWeight: 600,
                      background: on ? "var(--violet)" : "var(--paper)",
                      color: on ? "var(--on-accent)" : "var(--stone)",
                      border: on ? "1px solid var(--violet)" : isRec ? "1.5px dashed var(--violet)" : "1px solid var(--line)",
                    }}>
                    {s}{isRec ? <> <Icon name="star" /></> : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>
          {canBag && (
            <button className="ph-btn" onClick={() => onAddToBag(size)} disabled={bagged}
              style={{ background: bagged ? "var(--ok)" : "var(--violet)", color: "var(--on-accent)", padding: 14, fontSize: 15, borderRadius: 999, fontWeight: 700, fontFamily: "'Baloo 2', cursive" }}>
              <Icon name={bagged ? "check" : "bag"} /> {bagged ? t.addedToBag : t.addToBag}
            </button>
          )}
          {/* works with no storefront and no bag — a shop with no slug still
              gets the lead, which is the whole point of the kiosk */}
          <button className="ph-btn" onClick={() => onTellShop(size)}
            style={{ background: canBag ? "transparent" : "var(--ink)", color: canBag ? "var(--ink)" : "var(--paper)", border: canBag ? "1.5px solid var(--ink)" : "none", padding: 13, fontSize: 14.5, borderRadius: 999, fontWeight: 700, fontFamily: "'Baloo 2', cursive" }}>
            <Icon name="phone" /> {t.tellShop}
          </button>
          <button className="ph-btn" onClick={onSaveLook} disabled={saved}
            style={{ color: saved ? "var(--violet)" : "var(--stone)", fontSize: 13, padding: "8px 0", fontWeight: 600 }}>
            <Icon name={saved ? "heart-filled" : "heart"} /> {saved ? t.savedLook : t.saveLook}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the mirror: stage + a rack that never leaves ---------- */
interface MirrorProps {
  photo: string;
  shop: Shop;
  rail: Wearable[];
  cats: string[];
  catFilter: string;
  setCatFilter: (c: string) => void;
  retakePhoto: () => void;
  initialGarment: Wearable | null;
  cart: ReturnType<typeof useCart> | null; // null = no public storefront (no slug) — hide add-to-bag
  onLookSaved: () => void;
  onOpenBag: () => void;
  shared: boolean;
}

function MirrorV2({ photo, shop, rail, cats, catFilter, setCatFilter, retakePhoto, initialGarment, cart, onLookSaved, onOpenBag, shared }: MirrorProps) {
  const [phase, setPhase] = useState<"idle" | "generating" | "result" | "failed">("idle");
  const [ready, setReady] = useState(false); // decoded and about to take the stage
  const [selected, setSelected] = useState<Wearable | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  /* every look generated against THIS photo, by garment id. Doubles as the
     rail's memory: a tried piece wears its render and comes back instantly. */
  const [results, setResults] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [interested, setInterested] = useState(false);
  const [bagState, setBagState] = useState<"idle" | "pick" | "added">("idle");
  const [lookState, setLookState] = useState<"idle" | "saving" | "saved">("idle");
  const [shareState, setShareState] = useState<"idle" | "sharing">("idle");
  const [downloading, setDownloading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false); // hold-to-compare
  const [confirming, setConfirming] = useState<Wearable | null>(null); // piece awaiting "yes, peeq it"
  const [wantOpen, setWantOpen] = useState(false); // the act-on-this-look sheet
  const [leadSize, setLeadSize] = useState(""); // size chosen in the sheet, carried into the lead form
  const savedIds = useRef<Set<string>>(new Set()); // garments already saved to My Looks this session
  const stageRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0); // ignore stale responses if the shopper taps another piece mid-generation
  const autoStarted = useRef(false);
  const alive = useRef(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSize, setShowSize] = useState(false);
  const t = useT();

  /* deep link (hanger QR / storefront "peeq it") = shop just this one piece:
     no rack, no category chips — only the garment they scanned */
  const locked = !!initialGarment;

  useEffect(() => { setProfile(getProfile()); }, []);
  /* Must set true on the way IN, not just false on the way out. React's dev
     StrictMode mounts, cleans up, then mounts again — a cleanup-only version
     of this latches false on that first teardown and never recovers, so every
     try-on afterwards lands, is judged stale, and is silently dropped with
     the overlay still up. */
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // size hint from the shopper's own measurements — never touches the try-on image
  const rec: SizeRec | null = selected && profile ? recommendSize(profile, selected) : null;
  const recSize = rec && !rec.free ? rec.size : undefined;

  const startTryOn = useCallback(async (garment: Wearable) => {
    const seq = ++requestSeq.current;
    const stale = () => seq !== requestSeq.current || !alive.current;
    setSelected(garment);
    setNotice("");
    setResultImage(null);
    setReady(false);
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
      if (stale()) return;
      logLocalTryOn(garment.id, getKioskSessionId()); // no-op in Supabase mode (server logs it)

      /* Decode before revealing. `url` is a signed link the browser has not
         fetched yet — handing it to an <img> now would end the blink over a
         still-dim photo and pop the look in afterwards. */
      await preloadImage(url);
      if (stale()) return;
      setReady(true); // bar runs to 100%, "la, herum ta!"
      await sleep(REVEAL_HOLD_MS);
      if (stale()) return;

      setResults((r) => ({ ...r, [garment.id]: url }));
      setResultImage(url);
      setPhase("result");
      setReady(false);
    } catch (e) {
      if (stale()) return;
      /* Say it failed. This used to fall back to pasting the flat garment
         photo over the shopper's picture — which read as a bad try-on rather
         than none, and shoppers judged the piece on it. The server refunds the
         credit on failure, so retrying costs nothing. */
      console.error("Try-on failed:", e);
      reportError("kiosk-v2", "try-on failed: " + ((e as Error)?.message || e), {
        shopId: shop.id, garmentId: garment.id,
      });
      /* The server's own message when it explains something the shopper can
         act on (an unusable photo, a shop out of try-ons); the generic line
         when it's an outage they can only wait out. */
      setNotice((e as Error)?.message || "");
      setReady(false);
      setPhase("failed");
    }
  }, [photo, shop.id]);

  /* hanger QR / storefront deep link: start as soon as we have a photo */
  useEffect(() => {
    if (initialGarment && !autoStarted.current) {
      autoStarted.current = true;
      startTryOn(initialGarment);
    }
  }, [initialGarment, startTryOn]);

  /* Tapping the rail. A piece already tried against this photo comes straight
     back — same look, no second generation, no second credit. Anything that
     would actually generate goes through the confirm sheet first, so a
     mis-tap on a neighbouring tile costs nothing. */
  const pick = (garment: Wearable) => {
    const cached = results[garment.id];
    if (!cached) { setConfirming(garment); return; }
    requestSeq.current++; // drop any in-flight generation's response
    setSelected(garment);
    setResultImage(cached);
    setNotice("");
    setReady(false);
    setLookState(savedIds.current.has(garment.id) ? "saved" : "idle");
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

  /* save the look. Shared by the heart in the bar and the one in the sheet,
     so "saved" means the same thing in both and can't get out of step. */
  const saveThisLook = async () => {
    if (!resultImage || !selected || lookState !== "idle") return;
    setLookState("saving");
    const saved = await saveLook({
      garmentId: selected.id, compositionId: selected.compositionId ?? null,
      garmentName: selected.name,
      price: selected.price, shopName: shop.name, imageUrl: resultImage,
    });
    if (saved) { setLookState("saved"); savedIds.current.add(selected.id); onLookSaved(); }
    else setLookState("idle");
  };

  const resultVisible = phase === "result" && !!resultImage && !showOriginal;
  const canBag = !!cart && !!selected?.inStock;
  const chip: React.CSSProperties = { padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 999 };

  return (
    <div className="k2-body k2-mirror">
      {/* stage — a free box. Every layer is contained in it, so no photo and
          no render is ever cropped, whatever shape either of them is. */}
      <div ref={stageRef} className="k2-stage">
        {/* pinned to whatever is on stage, not to what compare is showing —
            swapping this src mid-hold would flash the backdrop */}
        <img className="k2-blur" src={phase === "result" && resultImage ? resultImage : photo} alt="" aria-hidden />

        <img className="k2-shot" src={photo} alt="You" draggable={false}
          style={{ opacity: resultVisible ? 0 : 1, filter: phase === "generating" ? "brightness(.42)" : "none" }} />

        {/* the look, crossfading with the photo underneath — which is also
            what hold-to-compare rides on */}
        {resultImage && (
          <div className="k2-reveal" key={resultImage}>
            <img className="k2-shot" src={resultImage} draggable={false}
              alt={"You wearing " + (selected?.name || "the garment")}
              style={{ opacity: resultVisible ? 1 : 0 }} />
          </div>
        )}

        {/* Over the shopper's own photo, so it's clear what didn't happen to
            it — and the piece they picked is never shown pasted on top. */}
        {phase === "failed" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, background: "rgba(13,11,10,.72)", backdropFilter: "blur(6px)" }}>
            <div className="ph-display" style={{ fontSize: 20, fontWeight: 600, color: "#fff" }}>{t.tryonFailedTitle}</div>
            <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.82)", lineHeight: 1.6, maxWidth: 300, margin: 0 }}>
              {notice || t.tryonFailedBody}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {selected && (
                <button className="ph-btn k2-pill accent" onClick={() => startTryOn(selected)}
                  style={{ padding: "10px 22px", fontSize: 14, fontFamily: "'Baloo 2', cursive" }}>
                  <Icon name="reset" /> {t.tryAgain}
                </button>
              )}
              <button className="ph-btn k2-pill" onClick={() => { setNotice(""); setSelected(null); setPhase("idle"); }}
                style={{ padding: "10px 18px", fontSize: 13.5, color: "#fff", borderColor: "rgba(255,255,255,.4)" }}>
                {t.browseRack}
              </button>
            </div>
          </div>
        )}

        {phase === "generating" && <RevealOverlay garment={selected} ready={ready} />}

        {phase === "result" && resultImage && (
          <button className="ph-btn"
            onPointerDown={(e) => { e.preventDefault(); setShowOriginal(true); }}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
            onPointerCancel={() => setShowOriginal(false)}
            onContextMenu={(e) => e.preventDefault()}
            style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(13,11,10,.66)", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "9px 15px", borderRadius: 999, userSelect: "none", WebkitUserSelect: "none", touchAction: "none", backdropFilter: "blur(8px)" }}>
            <Icon name="swap" /> {showOriginal ? t.originalPhoto : t.holdToCompare}
          </button>
        )}

        {phase === "idle" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 18, background: "linear-gradient(transparent 58%, rgba(13,11,10,.86))", pointerEvents: "none" }}>
            <div style={{ color: "#fff", fontSize: 14.5, fontWeight: 500 }}>{t.pickAny}</div>
          </div>
        )}
      </div>

      {/* dock — actions, then the rack that never leaves */}
      <div className="k2-dock">
        {phase === "result" && selected && (
          <div className="k2-actions peek">
            <div className="k2-actions-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ph-display" style={{ fontSize: 16.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--k2-quiet)" }}>
                  {npr(selected.price)}
                  {selected.sizes.length > 0 && <> · {t.sizes} {selected.sizes.join(" ")}</>}
                </div>
              </div>
              <button className="ph-btn k2-pill" disabled={lookState !== "idle"} aria-label={t.saveLook}
                onClick={saveThisLook}
                style={{ padding: "10px 13px", color: lookState === "saved" ? "var(--violet)" : undefined }}>
                <Icon name={lookState === "saved" ? "heart-filled" : "heart"} />
              </button>
              {/* One way to act on a look, not a row of competing chips. Size,
                  bag and tell-the-shop all live behind this — the shopper has
                  just decided they like something, and that decision deserves
                  a screen rather than a chip they have to hunt for. */}
              <button className="ph-btn k2-pill accent" onClick={() => setWantOpen(true)}
                style={{ padding: "11px 22px", fontSize: 14.5, fontFamily: "'Baloo 2', cursive", ...(bagState === "added" ? { background: "var(--ok)", borderColor: "var(--ok)", color: "var(--on-accent)" } : null) }}>
                {bagState === "added"
                  ? <><Icon name="check" /> {t.addedToBag}</>
                  : <><Icon name="bag" /> {t.iWantThis}</>}
              </button>
            </div>

            <div className="k2-chiprow">
              {selected.sizes.length > 0 && (
                rec
                  ? <SizeBadge rec={rec} dark onEdit={() => setShowSize(true)} />
                  : <button className="ph-btn k2-pill" onClick={() => setShowSize(true)}
                      style={{ ...chip, borderStyle: "dashed", color: "var(--violet)" }}>
                      <Icon name="ruler" /><span className="hide-sm"> {t.findMySize}</span>
                    </button>
              )}
              <button className="ph-btn k2-pill" disabled={shareState === "sharing"} aria-label={t.share}
                onClick={async () => {
                  if (!resultImage) return;
                  setShareState("sharing");
                  try { await shareImage(resultImage, selected.name, shop.name); } catch {}
                  setShareState("idle");
                }}
                style={{ ...chip, opacity: shareState === "sharing" ? 0.6 : 1 }}>
                <Icon name="share" /><span className="hide-sm"> {shareState === "sharing" ? t.sharing : t.share}</span>
              </button>
              <button className="ph-btn k2-pill" disabled={downloading} aria-label={t.saveImage}
                onClick={async () => {
                  if (!resultImage) return;
                  setDownloading(true);
                  try { await downloadImage(resultImage, selected.name); } catch {}
                  setDownloading(false);
                }}
                style={{ ...chip, opacity: downloading ? 0.6 : 1 }}>
                <Icon name="download" /><span className="hide-sm"> {t.saveImage}</span>
              </button>
              {cart && cart.count > 0 && (
                <button className="ph-btn" onClick={onOpenBag}
                  style={{ ...chip, color: "var(--violet)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                  {t.viewBag(cart.count)}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--k2-quiet)" }}>{t.aiResultNote}</div>
          </div>
        )}

        {!locked && (
          <>
            {cats.length > 2 && (
              <div className="k2-chiprow" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
                {cats.map((c) => (
                  <button key={c} className="ph-btn k2-pill" onClick={() => setCatFilter(c)}
                    style={{ ...chip, flexShrink: 0, ...(catFilter === c ? { background: "var(--k2-accent)", borderColor: "var(--k2-accent)", color: "var(--k2-accent-ink)" } : null) }}>
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* the rack. Pieces already tried wear the shopper's own render, so
                this row doubles as the session's lookbook. */}
            <div className="k2-rail">
              {rail.map((g) => {
                const worn = results[g.id];
                return (
                  <button key={g.id} className={"ph-btn k2-tile" + (selected?.id === g.id ? " on" : "")}
                    onClick={() => pick(g)}
                    aria-label={worn ? "You wearing " + g.name : g.name}>
                    <img src={worn || g.image} alt="" />
                    {worn && <img className="worn" src={g.image} alt="" />}
                    {/* No camera has seen this piece — it's a render of cloth in
                        a cut the shop will stitch. Saying so on the tile matters
                        more than on the result: this is where the shopper
                        decides what they're looking at. */}
                    {g.stitchedToOrder && <span className="mto">{t.madeToOrder}</span>}
                    <span className="nm">{g.name}</span>
                    <span className="pr">{npr(g.price)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "center", gap: 16, paddingTop: 2 }}>
          <button className="ph-btn" onClick={retakePhoto}
            style={{ color: "var(--k2-quiet)", fontSize: 12.5, padding: "2px 8px", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.retakePhoto}
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmTryOn garment={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => { const g = confirming; setConfirming(null); startTryOn(g); }} />
      )}
      {wantOpen && selected && (
        <WantThisSheet
          garment={selected} look={resultImage} rec={rec}
          canBag={canBag} bagged={bagState === "added"} saved={lookState === "saved"}
          onAddToBag={(s) => { addToBag(s); }}
          /* hand the sheet's chosen size to the lead form rather than making
             them pick it a second time */
          onTellShop={(s) => { setLeadSize(s); setWantOpen(false); setInterested(true); }}
          onSaveLook={saveThisLook}
          onClose={() => setWantOpen(false)} />
      )}
      {interested && selected && (
        <InterestedModal shop={shop} garment={selected} recommended={leadSize || recSize} shared={shared}
          onClose={() => setInterested(false)} />
      )}
      {showSize && (
        <FindMySizeSheet
          initial={profile}
          onClose={() => setShowSize(false)}
          onSaved={(p) => { setProfile(p); setShowSize(false); }}
          onForget={() => { forgetProfile(); setProfile(null); setShowSize(false); }}
        />
      )}
    </div>
  );
}

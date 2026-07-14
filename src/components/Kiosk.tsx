"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { npr, waLink } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { runTryOn, getKioskSessionId } from "@/lib/tryon";
import { logLocalTryOn, submitLead } from "@/lib/storage";
import { reportError } from "@/lib/logging";
import {
  getRememberedPhoto, rememberPhoto, forgetPhoto,
  saveLook, listLooks, setLookFavorite, deleteLook, clearAllLooks,
  lookImageURL, shareLook, shareImage, type SavedLook,
} from "@/lib/looks";
import { LangContext, STRINGS, useLangState, useT } from "@/lib/i18n";
import type { Garment, Shop } from "@/lib/types";

/* Kiosk — light, touch-first shopper flow:
   attract (saved-photo fast path) → capture (consent inline) → try on.
   Serves /k/[slug] on shoppers' phones; ?g=<garmentId> (hanger QR /
   storefront "Try on") jumps straight to that piece. */

interface KioskProps {
  shop: Shop;
  catalog: Garment[];
  exit: () => void;
  initialGarmentId?: string | null;
}

const barBtn: React.CSSProperties = {
  padding: "8px 13px", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase",
  fontWeight: 500, color: "var(--forest-deep)", border: "1px solid var(--line)",
  borderRadius: "var(--radius-btn)", background: "var(--cream)",
};

export default function Kiosk({ shop, catalog, exit, initialGarmentId }: KioskProps) {
  const [step, setStep] = useState<"attract" | "capture" | "tryon">("attract");
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<Garment | null>(null);
  const [catFilter, setCatFilter] = useState("All");
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [looksCount, setLooksCount] = useState(0);
  const [showLooks, setShowLooks] = useState(false);
  const [lang, toggleLang] = useLangState();
  const t = STRINGS[lang];
  const cats = ["All", ...Array.from(new Set(catalog.map((g) => g.category)))];
  const rail = catFilter === "All" ? catalog : catalog.filter((g) => g.category === catFilter);
  const initialGarment = initialGarmentId ? catalog.find((g) => g.id === initialGarmentId) ?? null : null;

  useEffect(() => {
    getRememberedPhoto().then(setSavedPhoto);
    listLooks().then((l) => setLooksCount(l.length));
  }, []);

  const reset = () => { setPhoto(null); setSelected(null); setStep("attract"); };

  const contactWa = waLink(
    shop.whatsapp,
    `Namaste! I have a question about ${shop.name || "your shop"}. (via EasyFitCheck)`
  );

  const takePhoto = (p: string, remember: boolean) => {
    if (remember) { rememberPhoto(p); setSavedPhoto(p); }
    setPhoto(p);
    setStep("tryon");
  };

  return (
    <LangContext.Provider value={lang}>
    <div style={{ position: "fixed", inset: 0, background: "var(--sage)", color: "var(--ink)", display: "flex", flexDirection: "column", zIndex: 40 }}>
      {/* top bar — single row; labels collapse to icons on phones */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", gap: 8, background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span className="ph-display" style={{ fontSize: 18, color: "var(--forest-deep)" }}>{shop.name || "EasyFitCheck"}</span>
          {shop.area && <span className="hide-sm" style={{ color: "var(--mut)", fontSize: 12, marginLeft: 8 }}>{shop.area}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button className="ph-btn" onClick={toggleLang} style={barBtn}>{t.switchLang}</button>
          {contactWa && (
            <a className="ph-btn" href={contactWa} target="_blank" rel="noopener noreferrer"
              aria-label={t.contact}
              style={{ ...barBtn, color: "var(--whatsapp)", borderColor: "var(--whatsapp)", textDecoration: "none" }}>
              ✆<span className="hide-sm"> {t.contact}</span>
            </a>
          )}
          {looksCount > 0 && (
            <button className="ph-btn" onClick={() => setShowLooks(true)} aria-label={t.myLooksLabel}
              style={{ ...barBtn, color: "var(--camel)", borderColor: "var(--camel)" }}>
              ♥ <span className="hide-sm">{t.myLooksLabel} </span>({looksCount})
            </button>
          )}
          {step !== "attract" && (
            <button className="ph-btn" onClick={reset} aria-label={t.startOver} title={t.startOver}
              style={{ ...barBtn, border: "none", color: "var(--mut)" }}>
              ↺<span className="hide-sm"> {t.startOver}</span>
            </button>
          )}
          <button className="ph-btn" onClick={exit} aria-label={t.exitKiosk} title={t.exitKiosk}
            style={{ ...barBtn, border: "none", color: "var(--mut)", padding: "8px 10px" }}>
            ✕
          </button>
        </div>
      </div>

      {showLooks && <LooksGallery onClose={() => setShowLooks(false)} onCountChange={setLooksCount} />}

      {step === "attract" && (
        <AttractScreen count={catalog.length} highlight={initialGarment}
          start={() => setStep("capture")}
          savedPhoto={savedPhoto}
          useSaved={() => { setPhoto(savedPhoto); setStep("tryon"); }}
          forgetSaved={() => { forgetPhoto(); setSavedPhoto(null); }} />
      )}
      {step === "capture" && <CaptureScreen onPhoto={takePhoto} />}
      {step === "tryon" && photo && (
        <TryOnScreen photo={photo} shop={shop} rail={rail} cats={cats} catFilter={catFilter} setCatFilter={setCatFilter}
          selected={selected} setSelected={setSelected} retakePhoto={() => setStep("capture")}
          initialGarment={initialGarment}
          onLookSaved={() => setLooksCount((n) => n + 1)} />
      )}
    </div>
    </LangContext.Provider>
  );
}

function AttractScreen({ count, highlight, start, savedPhoto, useSaved, forgetSaved }: {
  count: number; highlight: Garment | null; start: () => void;
  savedPhoto: string | null; useSaved: () => void; forgetSaved: () => void;
}) {
  const t = useT();
  return (
    <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "28px 24px", overflowY: "auto" }}>
      <div className="kicker" style={{ marginBottom: 16 }}>{t.virtualTrialRoom}</div>
      <div className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.18, color: "var(--forest-deep)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        {t.headline1}<br />{t.headline2}
      </div>
      {highlight ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 26px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 18px 10px 10px" }}>
          <img src={highlight.image} alt={highlight.name} style={{ width: 50, height: 66, objectFit: "cover", borderRadius: 4 }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{highlight.name}</div>
            <div style={{ color: "var(--camel)", fontWeight: 500, fontSize: 14 }}>{npr(highlight.price)}</div>
          </div>
        </div>
      ) : (
        <p style={{ color: "var(--mut)", fontSize: 15, fontWeight: 300, maxWidth: 400, margin: "16px 0 28px", lineHeight: 1.7 }}>
          {t.attractSub(count)}
        </p>
      )}
      <button className="ph-btn btn-solid" onClick={start} style={{ padding: "17px 40px", fontSize: 14 }}>
        {highlight ? t.seeItOnYou : t.tapToBegin}
      </button>
      {savedPhoto && (
        <>
          <div style={{ height: 14 }} />
          <button className="ph-btn" onClick={useSaved}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 10px 10px", fontSize: 14, border: "1px solid var(--line)", borderRadius: 30, background: "var(--cream)", color: "var(--forest-deep)", fontWeight: 500 }}>
            <img src={savedPhoto} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
            {t.continueSaved}
          </button>
          <button className="ph-btn" onClick={forgetSaved}
            style={{ color: "var(--mut)", fontSize: 12, marginTop: 14, textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t.forgetSavedPhoto}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- capture: consent lives here, above the shutter ---------- */
function CaptureScreen({ onPhoto }: { onPhoto: (dataUrl: string, remember: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camState, setCamState] = useState<"starting" | "live" | "denied">("starting");
  const [remember, setRemember] = useState(false);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCamState("live");
      } catch { if (!cancelled) setCamState("denied"); }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((tr) => tr.stop()); };
  }, []);

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
    <div className="fade-up" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "14px 20px 30px" }}>
      <div className="ph-display" style={{ fontWeight: 400, fontSize: "clamp(19px, 3vw, 24px)", textAlign: "center", color: "var(--forest-deep)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        {t.standBack}
      </div>

      <div
        onClick={camState === "denied" ? () => fileRef.current?.click() : undefined}
        className="k-cam"
        style={{ borderRadius: 8, overflow: "hidden", background: "var(--forest-deep)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "14px 0 16px", cursor: camState === "denied" ? "pointer" : "default" }}>
        {camState !== "denied" ? (
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        ) : (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.65)", padding: 24, fontSize: 14, lineHeight: 1.6 }}>
            {t.cameraUnavailable}<br />
            <span style={{ color: "var(--camel)", fontWeight: 600 }}>{t.tapAnywhere}</span><br />{t.uploadInstead}
          </div>
        )}
        {camState === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.55)", fontSize: 13, letterSpacing: ".08em" }}>
            {t.startingCamera}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 340, textAlign: "left", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
        <b style={{ color: "var(--forest-deep)" }}>{t.consentTitle}</b> {t.consentBody}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", margin: "16px 0 12px" }}>
        {camState === "live" && (
          <button className="ph-btn btn-solid" onClick={snap} style={{ padding: "15px 32px", fontSize: 13 }}>
            {t.agreeTakePhoto}
          </button>
        )}
        <button className="ph-btn btn-outline" onClick={() => fileRef.current?.click()} style={{ padding: "14px 22px", fontSize: 12 }}>
          {t.agreeUpload}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--mut)", cursor: "pointer" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
          style={{ accentColor: "var(--forest)", width: 16, height: 16 }} />
        {t.rememberPhoto}
      </label>
      <div style={{ color: "var(--mut)", fontSize: 12, marginTop: 8 }}>
        {remember ? t.rememberedNote : t.notSavedNote}
      </div>
    </div>
  );
}

/* ---------- generating overlay: viewfinder + scanner sweep (sits on the photo) ---------- */
function GeneratingOverlay({ garment }: { garment: Garment | null }) {
  const t = useT();
  const [msg, setMsg] = useState(0);
  // Asymptotic progress — quick at first, eases toward (never reaching) done,
  // so it stays honest whether the result lands in 2s (cache) or 40s.
  const [progress, setProgress] = useState(4);
  useEffect(() => {
    const timer = setInterval(() => setMsg((m) => (m + 1) % t.genMessages.length), 3200);
    return () => clearInterval(timer);
  }, [t.genMessages.length]);
  useEffect(() => {
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setProgress(Math.max(4, Math.min(96, Math.round(100 * (1 - Math.exp(-s / 11))))));
    }, 300);
    return () => clearInterval(timer);
  }, []);

  const corner = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", width: 22, height: 22, borderColor: "rgba(253,252,246,.75)", borderStyle: "solid", borderWidth: 0, ...pos,
  });
  // sparkles start at opacity 0, so reduced-motion (animation: none) hides them
  const spark = (top: string, left: string, delay: string, size: number): React.CSSProperties => ({
    position: "absolute", top, left, width: size, height: size, borderRadius: "50%", opacity: 0,
    background: "radial-gradient(circle, #E5D3BC 0%, rgba(229,211,188,0) 70%)",
    animation: `twinkle 2.6s ease-in-out ${delay} infinite`,
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* viewfinder corners */}
      <div style={corner({ top: 10, left: 10, borderTopWidth: 2, borderLeftWidth: 2 })} />
      <div style={corner({ top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2 })} />
      <div style={corner({ bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2 })} />
      <div style={corner({ bottom: 10, right: 10, borderBottomWidth: 2, borderRightWidth: 2 })} />
      {/* scan line — default top hides it when animations are disabled */}
      <div style={{ position: "absolute", top: "-12%", left: "-6%", width: "112%", height: 3, borderRadius: 3, background: "linear-gradient(90deg, transparent, var(--camel) 30%, #E5D3BC 50%, var(--camel) 70%, transparent)", boxShadow: "0 0 18px 4px rgba(176,137,104,.55), 0 0 60px 18px rgba(176,137,104,.25)", animation: "scan 2.8s ease-in-out infinite alternate" }} />
      <div style={spark("20%", "16%", "0s", 10)} />
      <div style={spark("32%", "74%", ".9s", 8)} />
      <div style={spark("52%", "28%", "1.6s", 12)} />
      <div style={spark("14%", "56%", "2.1s", 7)} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 18px 16px", background: "linear-gradient(transparent, rgba(42,61,47,.9) 55%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
        {garment && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.14)", borderRadius: 30, padding: "5px 14px 5px 5px" }}>
            <img src={garment.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,.9)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</span>
          </div>
        )}
        <div key={msg} className="fade-up ph-display" style={{ fontSize: 18, color: "#fff" }}>{t.genMessages[msg % t.genMessages.length]}</div>
        <div style={{ width: "72%", maxWidth: 300, height: 4, borderRadius: 4, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", borderRadius: 4, background: "linear-gradient(90deg, var(--forest), var(--camel))", transition: "width .3s linear" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.5)", fontSize: 12 }}>{progress}% · {t.genFooter}</div>
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
    <div style={{ position: "fixed", inset: 0, background: "var(--sage)", zIndex: 55, display: "flex", flexDirection: "column", color: "var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", flexWrap: "wrap", gap: 10, background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
        <div>
          <span className="ph-display" style={{ fontSize: 20, color: "var(--forest-deep)" }}>{t.myLooksTitle}</span>
          <span style={{ fontSize: 12, color: "var(--mut)", marginLeft: 10 }}>{t.myLooksSub}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {looks && looks.length > 0 && (
            <button className="ph-btn"
              onClick={async () => {
                if (confirm(t.confirmDeleteAll)) {
                  await clearAllLooks();
                  refresh();
                }
              }}
              style={{ color: "var(--mut)", fontSize: 12, padding: "9px 12px" }}>
              {t.deleteAll}
            </button>
          )}
          <button className="ph-btn" onClick={onClose} style={barBtn}>
            {t.close}
          </button>
        </div>
      </div>

      {looks && looks.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mut)", padding: 24, textAlign: "center" }}>
          {t.nothingSaved}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14, alignContent: "start" }}>
          {sorted.map((l) => (
            <div key={l.id} className="fade-up" style={{ background: "var(--cream)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid " + (l.favorite ? "var(--camel)" : "var(--line)") }}>
              <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--sage-mist)" }}>
                <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button className="ph-btn"
                  onClick={async () => { await setLookFavorite(l.id, !l.favorite); refresh(); }}
                  style={{ position: "absolute", top: 8, right: 8, background: "var(--cream)", color: l.favorite ? "var(--camel)" : "var(--mut)", fontSize: 15, padding: "5px 9px", borderRadius: 14 }}>
                  {l.favorite ? "♥" : "♡"}
                </button>
              </div>
              <div style={{ padding: "10px 11px 11px", fontSize: 12 }}>
                <b>{l.garmentName}</b>
                <div style={{ color: "var(--camel)", fontWeight: 500 }}>{npr(l.price)}</div>
                {l.shopName && <div style={{ fontSize: 10.5, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="ph-btn" onClick={() => shareLook(l).catch(() => {})}
                    style={{ flex: 1, border: "1px solid var(--forest)", color: "var(--forest)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", padding: "7px 0", fontWeight: 500 }}>
                    {t.share}
                  </button>
                  <button className="ph-btn"
                    onClick={async () => { await deleteLook(l.id); refresh(); }}
                    style={{ color: "var(--mut)", fontSize: 11, padding: "7px 8px" }}>
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
function InterestedModal({ shop, garment, onClose }: { shop: Shop; garment: Garment; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState(garment.sizes[0] || "");
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");
  const wa = waLink(
    shop.whatsapp,
    `Namaste! I tried on "${garment.name}"${size ? " (size " + size + ")" : ""} at ${shop.name || "your shop"} with EasyFitCheck and I want it.`
  );

  const canSend = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7;

  const send = async () => {
    if (!canSend) return;
    setState("sending");
    try {
      await submitLead(shop, garment, { name: name.trim(), phone: phone.trim(), size });
      setState("done");
    } catch {
      setState("error");
    }
  };

  const input: React.CSSProperties = {
    width: "100%", padding: "12px 13px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)",
    background: "#fff", color: "var(--ink)", fontSize: 15,
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(42,61,47,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-modal)", width: 360, maxWidth: "100%", padding: "26px 24px", textAlign: "center" }}>
        {state === "done" ? (
          <>
            <div className="ph-display" style={{ fontSize: 24, color: "var(--forest-deep)", marginBottom: 4 }}>{t.shopKnows}</div>
            <p style={{ color: "var(--mut)", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
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
            <div className="ph-display" style={{ fontSize: 24, color: "var(--forest-deep)", marginBottom: 4 }}>{t.tellShop}</div>
            <p style={{ color: "var(--mut)", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
              {t.leadNote(garment.name, npr(garment.price))}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {garment.sizes.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  {garment.sizes.map((s) => (
                    <button key={s} className="ph-btn" onClick={() => setSize(s)}
                      style={{
                        padding: "8px 14px", fontSize: 12, borderRadius: "var(--radius-btn)", fontWeight: 500,
                        background: size === s ? "var(--forest)" : "var(--sage)",
                        color: size === s ? "var(--cream)" : "var(--mut)",
                        border: "1px solid " + (size === s ? "var(--forest)" : "var(--line)"),
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input style={input} placeholder={t.yourName} value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} />
              <input style={input} placeholder={t.phoneNumber} value={phone} maxLength={30} inputMode="tel"
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ""))} />
            </div>
            {state === "error" && (
              <div style={{ fontSize: 12, color: "var(--camel)", marginTop: 10 }}>
                {t.sendFailed}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="ph-btn" onClick={onClose}
                style={{ flex: 1, border: "1px solid var(--line)", color: "var(--forest-deep)", padding: 13, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
                {t.cancel}
              </button>
              <button className="ph-btn" disabled={!canSend || state === "sending"} onClick={send}
                style={{ flex: 2, background: "var(--forest)", color: "var(--cream)", padding: 13, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", borderRadius: "var(--radius-btn)", fontWeight: 500, opacity: !canSend || state === "sending" ? 0.6 : 1 }}>
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
  onLookSaved: () => void;
}

function TryOnScreen({ photo, shop, rail, cats, catFilter, setCatFilter, selected, setSelected, retakePhoto, initialGarment, onLookSaved }: TryOnScreenProps) {
  const [phase, setPhase] = useState<"idle" | "generating" | "result" | "preview">("idle");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [interested, setInterested] = useState(false);
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
  const t = useT();

  const startTryOn = useCallback(async (garment: Garment) => {
    const seq = ++requestSeq.current;
    setSelected(garment);
    setNotice("");
    setResultImage(null);
    setLookState(savedIds.current.has(garment.id) ? "saved" : "idle");
    setShowOriginal(false);
    setPhase("generating");
    setOverlay({ x: 0.5, y: 0.52, scale: 0.75, opacity: 0.92 });
    try {
      const url = await runTryOn(photo, garment.image, garment.category, {
        shopId: shop.id, garmentId: garment.id,
      });
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
  }, [setSelected, photo, shop.id, t.previewNotice]);

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
    setShowOriginal(false);
    setPhase("result");
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
        {/* stage */}
        {/* touchAction only locks during drag-preview — otherwise swiping on the photo must scroll the page */}
        <div ref={stageRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="k-stage"
          style={{ borderRadius: 8, overflow: "hidden", position: "relative", background: "var(--sage-mist)", boxShadow: "var(--shadow-soft)", touchAction: phase === "preview" ? "none" : "auto", flexShrink: 0 }}>
          <img
            src={photo} alt="You"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: phase === "generating" ? "brightness(.55)" : "none", transition: "filter .3s" }} />

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
              style={{ position: "absolute", top: 10, left: 10, background: "rgba(42,61,47,.65)", color: "var(--cream)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, padding: "9px 13px", borderRadius: 20, userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}>
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

          {phase === "generating" && <GeneratingOverlay garment={selected} />}

          {phase === "idle" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16, background: "linear-gradient(transparent 60%, rgba(42,61,47,.85))" }}>
              <div style={{ color: "var(--cream)", fontSize: 14 }}>{t.pickAPiece}</div>
            </div>
          )}
        </div>

        {/* AI result info bar */}
        {phase === "result" && selected && (
          <div className="fade-up" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px", fontSize: 14, width: "100%", maxWidth: 390 }}>
            <span>
              <b>{selected.name}</b> <span style={{ color: "var(--camel)", fontWeight: 500 }}>{npr(selected.price)}</span>
              {selected.sizes.length > 0 && (
                <span style={{ color: "var(--mut)", marginLeft: 8, fontSize: 12 }}>
                  {t.sizes} {selected.sizes.join(" · ")}
                </span>
              )}
            </span>
            <button className="ph-btn" onClick={() => setInterested(true)}
              style={{ background: "var(--forest)", color: "var(--cream)", padding: "11px 20px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, borderRadius: "var(--radius-btn)" }}>
              {t.iWantThis}
            </button>
            <button className="ph-btn" disabled={shareState === "sharing"}
              onClick={async () => {
                if (!resultImage) return;
                setShareState("sharing");
                try { await shareImage(resultImage, selected.name, shop.name); } catch {}
                setShareState("idle");
              }}
              style={{ border: "1px solid var(--line)", color: "var(--forest-deep)", padding: "10px 18px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, borderRadius: "var(--radius-btn)", background: "transparent", opacity: shareState === "sharing" ? 0.6 : 1 }}>
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
              style={{ border: "1px solid var(--forest)", color: lookState === "saved" ? "var(--camel)" : "var(--forest)", borderColor: lookState === "saved" ? "var(--camel)" : "var(--forest)", padding: "10px 18px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 500, borderRadius: "var(--radius-btn)", background: "transparent" }}>
              {lookState === "saved" ? t.savedLook : lookState === "saving" ? t.savingLook : t.saveLook}
            </button>
            <span style={{ fontSize: 11, color: "var(--mut)", width: "100%", textAlign: "center" }}>{t.aiResultNote}</span>
          </div>
        )}

        {interested && selected && (
          <InterestedModal shop={shop} garment={selected} onClose={() => setInterested(false)} />
        )}

        {notice && phase === "preview" && (
          <div style={{ fontSize: 12, color: "var(--camel)", background: "var(--cream)", border: "1px solid var(--line)", padding: "7px 14px", borderRadius: 6 }}>
            {notice}
          </div>
        )}

        {/* preview controls */}
        {phase === "preview" && selected && (
          <div className="fade-up" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 16px", fontSize: 14, width: "100%", maxWidth: 390 }}>
            <span>
              <b>{selected.name}</b> <span style={{ color: "var(--camel)", fontWeight: 500 }}>{npr(selected.price)}</span>
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--mut)" }}>
              {t.sizeSlider}
              <input type="range" min="0.3" max="1.4" step="0.01" value={overlay.scale}
                onChange={(e) => setOverlay((o) => ({ ...o, scale: +e.target.value }))} style={{ accentColor: "var(--forest)" }} />
            </label>
            <span style={{ fontSize: 11, color: "var(--mut)" }}>{t.dragToPosition}</span>
          </div>
        )}
        <button className="ph-btn" onClick={retakePhoto}
          style={{ color: "var(--mut)", fontSize: 12, padding: "2px 8px", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t.retakePhoto}
        </button>
      </div>

      {/* session filmstrip — flip between already-generated looks instantly */}
      {history.length > 0 && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--mut)", fontWeight: 500, marginBottom: 7 }}>
            {t.thisSession}
          </div>
          <div className="garment-rail" style={{ display: "flex", gap: 9, overflowX: "auto" }}>
            {history.map((h) => {
              const active = phase === "result" && selected?.id === h.garment.id;
              return (
                <button key={h.garment.id} className="ph-btn" onClick={() => showFromHistory(h)}
                  aria-label={"You wearing " + h.garment.name}
                  style={{ flexShrink: 0, width: 62, padding: 0, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--sage-mist)", border: "2px solid " + (active ? "var(--camel)" : "var(--line)") }}>
                  <img src={h.url} alt="" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* category chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px 0" }} className="garment-rail">
        {cats.map((c) => (
          <button key={c} className={"efc-chip " + (catFilter === c ? "on" : "off")} onClick={() => setCatFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      {/* garment rail — the rack */}
      <div className="garment-rail" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "14px 16px 6px" }}>
        {rail.map((g) => (
          <button key={g.id} onClick={() => startTryOn(g)} className="ph-btn"
            style={{
              flexShrink: 0, width: 104, padding: 0, borderRadius: "var(--radius-card)", overflow: "hidden", textAlign: "left",
              background: "var(--cream)", border: "2px solid " + (selected?.id === g.id ? "var(--camel)" : "var(--line)"),
            }}>
            <div style={{ aspectRatio: "3/4", background: "var(--sage-mist)" }}>
              <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ padding: "7px 8px 8px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              <div style={{ fontSize: 11, color: "var(--camel)", fontWeight: 500, marginTop: 2 }}>{npr(g.price)}</div>
              {g.sizes.length > 0 && (
                <div style={{ fontSize: 9, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sizes.join(" ")}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

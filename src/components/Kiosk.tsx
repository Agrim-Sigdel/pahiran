"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { npr } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { runTryOn, getKioskSessionId } from "@/lib/tryon";
import { logLocalTryOn, submitLead } from "@/lib/storage";
import { reportError } from "@/lib/logging";
import {
  getRememberedPhoto, rememberPhoto, forgetPhoto,
  saveLook, listLooks, setLookFavorite, deleteLook, clearAllLooks,
  lookImageURL, shareLook, type SavedLook,
} from "@/lib/looks";
import type { Garment, Shop } from "@/lib/types";

/* Kiosk — full-screen, dark, touch-first shopper flow:
   attract → consent → capture (camera or upload) → try on (AI via /api/tryon,
   manual positioning preview as fallback). Also serves /k/[slug] on shoppers'
   own phones; ?g=<garmentId> (from a hanger QR) jumps straight to that piece. */

interface KioskProps {
  shop: Shop;
  catalog: Garment[];
  exit: () => void;
  initialGarmentId?: string | null;
}

export default function Kiosk({ shop, catalog, exit, initialGarmentId }: KioskProps) {
  const [step, setStep] = useState<"attract" | "consent" | "capture" | "tryon">("attract");
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<Garment | null>(null);
  const [catFilter, setCatFilter] = useState("All");
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [looksCount, setLooksCount] = useState(0);
  const [showLooks, setShowLooks] = useState(false);
  const cats = ["All", ...Array.from(new Set(catalog.map((g) => g.category)))];
  const rail = catFilter === "All" ? catalog : catalog.filter((g) => g.category === catFilter);
  const initialGarment = initialGarmentId ? catalog.find((g) => g.id === initialGarmentId) ?? null : null;

  useEffect(() => {
    getRememberedPhoto().then(setSavedPhoto);
    listLooks().then((l) => setLooksCount(l.length));
  }, []);

  const reset = () => { setPhoto(null); setSelected(null); setStep("attract"); };

  const takePhoto = (p: string, remember: boolean) => {
    if (remember) { rememberPhoto(p); setSavedPhoto(p); }
    setPhoto(p);
    setStep("tryon");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(120% 100% at 50% 0%, #3A2140 0%, var(--ink) 55%)", color: "#fff", display: "flex", flexDirection: "column", zIndex: 40 }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px" }}>
        <div>
          <span className="ph-display" style={{ fontSize: 20 }}>{shop.name || "Pahiran"}</span>
          {shop.area && <span style={{ color: "rgba(255,255,255,.45)", fontSize: 13, marginLeft: 10 }}>{shop.area}</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {looksCount > 0 && (
            <button className="ph-btn" onClick={() => setShowLooks(true)}
              style={{ background: "rgba(255,255,255,.1)", color: "var(--marigold)", padding: "9px 16px", fontSize: 13 }}>
              ♥ My looks ({looksCount})
            </button>
          )}
          {step !== "attract" && (
            <button className="ph-btn" onClick={reset} style={{ background: "rgba(255,255,255,.1)", color: "#fff", padding: "9px 16px", fontSize: 13 }}>
              ↺ Start over
            </button>
          )}
          <button className="ph-btn" onClick={exit} style={{ background: "transparent", color: "rgba(255,255,255,.4)", padding: "9px 12px", fontSize: 13 }}>
            Exit kiosk
          </button>
        </div>
      </div>

      {showLooks && <LooksGallery onClose={() => setShowLooks(false)} onCountChange={setLooksCount} />}

      {step === "attract" && (
        <AttractScreen count={catalog.length} highlight={initialGarment} start={() => setStep("consent")} />
      )}
      {step === "consent" && (
        <ConsentScreen agree={() => setStep("capture")} back={reset}
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
  );
}

function AttractScreen({ count, highlight, start }: { count: number; highlight: Garment | null; start: () => void }) {
  return (
    <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 13, letterSpacing: ".28em", textTransform: "uppercase", color: "var(--marigold)", marginBottom: 18 }}>
        Virtual trial room
      </div>
      <div className="ph-display" style={{ fontSize: "clamp(34px, 6vw, 58px)", lineHeight: 1.15, maxWidth: 640 }}>
        Try it on —<br />without trying it on.
      </div>
      {highlight ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 30px", background: "rgba(255,255,255,.08)", borderRadius: 16, padding: "10px 18px 10px 10px" }}>
          <img src={highlight.image} alt={highlight.name} style={{ width: 52, height: 68, objectFit: "cover", borderRadius: 10 }} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{highlight.name}</div>
            <div style={{ color: "var(--marigold)", fontWeight: 700, fontSize: 14 }}>{npr(highlight.price)}</div>
          </div>
        </div>
      ) : (
        <p style={{ color: "rgba(255,255,255,.55)", fontSize: 17, maxWidth: 440, margin: "18px 0 34px" }}>
          Take one photo, then browse {count} piece{count !== 1 ? "s" : ""} from this shop and see them on you.
        </p>
      )}
      <button className="ph-btn" onClick={start}
        style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "20px 46px", fontSize: 20, borderRadius: 40, boxShadow: "0 10px 34px rgba(196,37,97,.45)" }}>
        {highlight ? "See it on you" : "Tap to begin"}
      </button>
    </div>
  );
}

/* ---------- consent: shown once before any photo is taken ---------- */
function ConsentScreen({ agree, back, savedPhoto, useSaved, forgetSaved }: {
  agree: () => void; back: () => void;
  savedPhoto: string | null; useSaved: () => void; forgetSaved: () => void;
}) {
  return (
    <div className="fade-up" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", overflowY: "auto" }}>
      <div style={{ fontSize: 30, marginBottom: 14 }}>🔒</div>
      <div className="ph-display" style={{ fontSize: "clamp(22px, 4vw, 30px)", marginBottom: 16 }}>Your photo, your call</div>
      <div style={{ maxWidth: 460, display: "flex", flexDirection: "column", gap: 10, textAlign: "left", background: "rgba(255,255,255,.06)", borderRadius: 18, padding: "18px 22px", fontSize: 14.5, color: "rgba(255,255,255,.75)", lineHeight: 1.55 }}>
        <div>• Your photo is used <strong style={{ color: "#fff" }}>only</strong> to show these clothes on you.</div>
        <div>• It is sent securely to our AI try-on service and processed there — the shop never keeps a copy.</div>
        <div>• Nothing is stored unless <strong style={{ color: "#fff" }}>you</strong> choose "Save look" or "Remember my photo" — and that stays on this device only, deletable anytime.</div>
        <div>• No account, no name, no phone number needed.</div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 26, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="ph-btn" onClick={back} style={{ background: "rgba(255,255,255,.1)", color: "#fff", padding: "15px 24px", fontSize: 15, borderRadius: 30 }}>
          Not now
        </button>
        {savedPhoto && (
          <button className="ph-btn" onClick={useSaved}
            style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.12)", color: "#fff", padding: "10px 22px 10px 10px", fontSize: 15, borderRadius: 30 }}>
            <img src={savedPhoto} alt="Your saved photo" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
            Use my last photo
          </button>
        )}
        <button className="ph-btn" onClick={agree}
          style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "15px 34px", fontSize: 16, borderRadius: 30, boxShadow: "0 8px 26px rgba(196,37,97,.4)" }}>
          I agree — take my photo
        </button>
      </div>
      {savedPhoto && (
        <button className="ph-btn" onClick={forgetSaved}
          style={{ background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 12, marginTop: 14, padding: "4px 8px" }}>
          Forget my saved photo
        </button>
      )}
    </div>
  );
}

/* ---------- photo capture: camera with upload fallback ---------- */
function CaptureScreen({ onPhoto }: { onPhoto: (dataUrl: string, remember: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camState, setCamState] = useState<"starting" | "live" | "denied">("starting");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCamState("live");
      } catch { if (!cancelled) setCamState("denied"); }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0); ctx.scale(-1, 1); // un-mirror
    ctx.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onPhoto(c.toDataURL("image/jpeg", 0.85), remember);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try { onPhoto(await fileToCompressedDataURL(file, 1000, 0.85), remember); }
    catch { alert("Could not read that photo."); }
  };

  return (
    <div className="fade-up" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "6px 20px 30px", gap: 18 }}>
      <div className="ph-display" style={{ fontSize: "clamp(19px, 3vw, 26px)", textAlign: "center" }}>Stand back so we can see you fully</div>

      <div
        onClick={camState === "denied" ? () => fileRef.current?.click() : undefined}
        style={{ height: "min(50vh, 520px)", maxWidth: "92vw", aspectRatio: "3/4", borderRadius: 24, overflow: "hidden", background: "#141018", border: "1px solid rgba(255,255,255,.12)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: camState === "denied" ? "pointer" : "default" }}>
        {camState !== "denied" ? (
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
        ) : (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.55)", padding: 24, fontSize: 15 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>📷</div>
            Camera isn't available here.<br />
            <span style={{ color: "var(--marigold)", fontWeight: 600 }}>Tap anywhere in this box</span><br />to upload a full-body photo instead.
          </div>
        )}
        {camState === "starting" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.5)", fontSize: 14 }}>
            Starting camera…
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {camState === "live" && (
          <button className="ph-btn" onClick={snap}
            style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "17px 38px", fontSize: 18, borderRadius: 34, boxShadow: "0 8px 26px rgba(196,37,97,.4)" }}>
            📸 Take photo
          </button>
        )}
        <button className="ph-btn" onClick={() => fileRef.current?.click()}
          style={{ background: "rgba(255,255,255,.12)", color: "#fff", padding: "17px 28px", fontSize: 16, borderRadius: 34 }}>
          Upload a photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files?.[0])} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,.65)", cursor: "pointer" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
          style={{ accentColor: "var(--rani)", width: 16, height: 16 }} />
        Remember my photo on this device for 7 days
      </label>
      <div style={{ color: "rgba(255,255,255,.35)", fontSize: 12 }}>
        {remember ? "Saved only on this device — delete it anytime from the consent screen." : "Your photo stays on this screen — it is never saved."}
      </div>
    </div>
  );
}

/* ---------- generating overlay: AI scanner sweep ---------- */
const GEN_MESSAGES = ["Reading your pose…", "Draping the fabric…", "Matching the light…", "Stitching the details…", "Final touches…"];
const SPARKLES = [
  { top: "14%", left: "18%", size: 16, delay: 0 },
  { top: "26%", left: "74%", size: 12, delay: 0.7 },
  { top: "48%", left: "10%", size: 11, delay: 1.3 },
  { top: "58%", left: "82%", size: 15, delay: 0.4 },
  { top: "74%", left: "30%", size: 12, delay: 1.8 },
  { top: "36%", left: "48%", size: 10, delay: 1.0 },
];

function GeneratingOverlay({ garment }: { garment: Garment | null }) {
  const [msg, setMsg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsg((m) => (m + 1) % GEN_MESSAGES.length), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* scan line — default top hides it when animations are disabled */}
      <div style={{ position: "absolute", top: "-12%", left: "-6%", width: "112%", height: 3, borderRadius: 3, background: "linear-gradient(90deg, transparent, var(--marigold) 30%, #FFE3AE 50%, var(--marigold) 70%, transparent)", boxShadow: "0 0 18px 4px rgba(242,169,59,.55), 0 0 60px 18px rgba(242,169,59,.25)", animation: "scan 2.8s ease-in-out infinite alternate" }} />
      {SPARKLES.map((s, i) => (
        <span key={i} style={{ position: "absolute", top: s.top, left: s.left, fontSize: s.size, opacity: 0, animation: `twinkle 2.2s ease-in-out ${s.delay}s infinite` }}>✨</span>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "40px 18px 16px", background: "linear-gradient(transparent, rgba(20,16,24,.9) 55%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
        {garment && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.1)", borderRadius: 30, padding: "5px 14px 5px 5px" }}>
            <img src={garment.image} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.85)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{garment.name}</span>
          </div>
        )}
        <div key={msg} className="fade-up ph-display" style={{ fontSize: 18, color: "#fff" }}>{GEN_MESSAGES[msg]}</div>
        <div style={{ width: "72%", maxWidth: 300, height: 4, borderRadius: 4, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
          <div style={{ height: "100%", minWidth: "8%", borderRadius: 4, background: "linear-gradient(90deg, var(--rani), var(--marigold))", animation: "fillUp 28s cubic-bezier(.16,.8,.35,1) forwards" }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.4)", fontSize: 12 }}>AI try-on · usually 15–30 seconds</div>
      </div>
    </div>
  );
}

/* ---------- "My looks": on-device gallery of saved try-ons ---------- */
function LooksGallery({ onClose, onCountChange }: { onClose: () => void; onCountChange: (n: number) => void }) {
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,16,24,.96)", zIndex: 55, display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", flexWrap: "wrap", gap: 10 }}>
        <div>
          <span className="ph-display" style={{ fontSize: 22 }}>My looks</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginLeft: 10 }}>
            saved only on this device · show staff your ♥ favourites
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {looks && looks.length > 0 && (
            <button className="ph-btn"
              onClick={async () => {
                if (confirm("Delete all saved looks and your remembered photo from this device?")) {
                  await clearAllLooks();
                  refresh();
                }
              }}
              style={{ background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 13, padding: "9px 12px" }}>
              Delete all
            </button>
          )}
          <button className="ph-btn" onClick={onClose} style={{ background: "rgba(255,255,255,.12)", color: "#fff", padding: "9px 18px", fontSize: 14 }}>
            ✕ Close
          </button>
        </div>
      </div>

      {looks && looks.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.5)", padding: 24, textAlign: "center" }}>
          Nothing saved yet — tap "♡ Save look" after a try-on to keep it here.
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 22px 30px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, alignContent: "start" }}>
          {sorted.map((l) => (
            <div key={l.id} className="fade-up" style={{ background: "rgba(255,255,255,.06)", borderRadius: 16, overflow: "hidden", border: l.favorite ? "2px solid var(--marigold)" : "2px solid transparent" }}>
              <div style={{ aspectRatio: "3/4", position: "relative", background: "#141018" }}>
                <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button className="ph-btn"
                  onClick={async () => { await setLookFavorite(l.id, !l.favorite); refresh(); }}
                  style={{ position: "absolute", top: 8, right: 8, background: "rgba(20,16,24,.65)", color: l.favorite ? "var(--marigold)" : "#fff", fontSize: 16, padding: "6px 10px", borderRadius: 18 }}>
                  {l.favorite ? "♥" : "♡"}
                </button>
              </div>
              <div style={{ padding: "9px 11px 11px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.garmentName}</div>
                <div style={{ fontSize: 12, color: "var(--marigold)", fontWeight: 700 }}>{npr(l.price)}</div>
                {l.shopName && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.shopName}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="ph-btn" onClick={() => shareLook(l).catch(() => {})}
                    style={{ flex: 1, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 12, padding: "7px 0" }}>
                    Share
                  </button>
                  <button className="ph-btn"
                    onClick={async () => { await deleteLook(l.id); refresh(); }}
                    style={{ background: "transparent", color: "rgba(255,255,255,.4)", fontSize: 12, padding: "7px 10px" }}>
                    Delete
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState(garment.sizes[0] || "");
  const [state, setState] = useState<"form" | "sending" | "done" | "error">("form");

  const send = async () => {
    setState("sending");
    try {
      await submitLead(shop, garment, { name: name.trim(), phone: phone.trim(), size });
      setState("done");
    } catch {
      setState("error");
    }
  };

  const input: React.CSSProperties = {
    padding: "12px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)",
    background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 15, width: "100%",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,16,24,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--plum)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 20, width: 380, maxWidth: "100%", padding: 24, textAlign: "center", color: "#fff" }}>
        {state === "done" ? (
          <>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
            <div className="ph-display" style={{ fontSize: 22, marginBottom: 8 }}>The shop knows!</div>
            <p style={{ color: "rgba(255,255,255,.65)", fontSize: 14, margin: "0 0 20px" }}>
              {garment.name}{size ? " · size " + size : ""} is saved to the shop's list.
              Show this screen to staff or keep browsing.
            </p>
            <button className="ph-btn" onClick={onClose}
              style={{ background: "var(--rani)", color: "#fff", padding: "13px 30px", fontSize: 15, borderRadius: 26 }}>
              Keep browsing
            </button>
          </>
        ) : (
          <>
            <div className="ph-display" style={{ fontSize: 22, marginBottom: 4 }}>Tell the shop</div>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: 13, margin: "0 0 16px" }}>
              {garment.name} · {npr(garment.price)} — name and number are optional.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {garment.sizes.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {garment.sizes.map((s) => (
                    <button key={s} className="ph-btn" onClick={() => setSize(s)}
                      style={{ padding: "8px 14px", fontSize: 13, borderRadius: 18, background: size === s ? "var(--marigold)" : "rgba(255,255,255,.1)", color: size === s ? "var(--ink)" : "rgba(255,255,255,.8)" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input style={input} placeholder="Your name (optional)" value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} />
              <input style={input} placeholder="Phone (optional)" value={phone} maxLength={30} inputMode="tel"
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            {state === "error" && (
              <div style={{ fontSize: 12, color: "var(--marigold)", marginTop: 10 }}>
                Could not send — please tell the staff directly.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="ph-btn" onClick={onClose}
                style={{ flex: 1, background: "rgba(255,255,255,.1)", color: "#fff", padding: "13px", fontSize: 14 }}>
                Cancel
              </button>
              <button className="ph-btn" disabled={state === "sending"} onClick={send}
                style={{ flex: 2, background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "13px", fontSize: 15, opacity: state === "sending" ? 0.6 : 1 }}>
                {state === "sending" ? "Sending…" : "🙋 I want this"}
              </button>
            </div>
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
  const [overlay, setOverlay] = useState({ x: 0.5, y: 0.52, scale: 0.75, opacity: 0.92 });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ rect: DOMRect } | null>(null);
  const requestSeq = useRef(0); // ignore stale responses if shopper taps another garment mid-generation
  const autoStarted = useRef(false);

  const startTryOn = useCallback(async (garment: Garment) => {
    const seq = ++requestSeq.current;
    setSelected(garment);
    setNotice("");
    setResultImage(null);
    setLookState("idle");
    setPhase("generating");
    setOverlay({ x: 0.5, y: 0.52, scale: 0.75, opacity: 0.92 });
    try {
      const url = await runTryOn(photo, garment.image, garment.category, {
        shopId: shop.id, garmentId: garment.id,
      });
      if (seq !== requestSeq.current) return;
      logLocalTryOn(garment.id, getKioskSessionId()); // no-op in Supabase mode (server logs it)
      setResultImage(url);
      setPhase("result");
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.error("Try-on failed, falling back to manual preview:", e);
      reportError("kiosk", "try-on fell back to manual preview: " + ((e as Error)?.message || e), {
        shopId: shop.id, garmentId: garment.id,
      });
      setNotice("AI try-on unavailable here — showing a positioning preview instead.");
      setPhase("preview");
    }
  }, [setSelected, photo, shop.id]);

  /* hanger QR deep link: start the scanned garment as soon as we have a photo */
  useEffect(() => {
    if (initialGarment && !autoStarted.current) {
      autoStarted.current = true;
      startTryOn(initialGarment);
    }
  }, [initialGarment, startTryOn]);

  /* drag the garment overlay */
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "0 16px 14px" }}>
      <div style={{ flex: 1, display: "flex", gap: 18, minHeight: 0, justifyContent: "center", flexWrap: "wrap", alignContent: "flex-start" }}>

        {/* stage */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div ref={stageRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            style={{ height: "min(52vh, 520px)", maxWidth: "90vw", aspectRatio: "3/4", borderRadius: 22, overflow: "hidden", position: "relative", background: "#141018", border: "1px solid rgba(255,255,255,.12)", touchAction: "none", flexShrink: 0 }}>
            <img
              src={phase === "result" && resultImage ? resultImage : photo}
              alt={phase === "result" ? "You wearing " + (selected?.name || "the garment") : "You"}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: phase === "generating" ? "brightness(.55)" : "none", transition: "filter .3s" }} />

            {phase === "preview" && selected && (
              <img src={selected.image} alt={selected.name} onPointerDown={onPointerDown}
                style={{
                  position: "absolute",
                  left: overlay.x * 100 + "%", top: overlay.y * 100 + "%",
                  transform: "translate(-50%, -50%)",
                  width: overlay.scale * 100 + "%",
                  opacity: overlay.opacity,
                  cursor: "grab", userSelect: "none",
                  mixBlendMode: "normal",
                  filter: "drop-shadow(0 6px 18px rgba(0,0,0,.45))",
                }} draggable={false} />
            )}

            {phase === "generating" && <GeneratingOverlay garment={selected} />}

            {phase === "idle" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 18, background: "linear-gradient(transparent 60%, rgba(20,16,24,.85))" }}>
                <div style={{ color: "rgba(255,255,255,.8)", fontSize: 15 }}>👇 Pick a piece from the rack below</div>
              </div>
            )}
          </div>

          {/* AI result info bar */}
          {phase === "result" && selected && (
            <div className="fade-up" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 16px" }}>
              <div style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{selected.name}</span>
                <span style={{ color: "var(--marigold)", marginLeft: 8, fontWeight: 700 }}>{npr(selected.price)}</span>
                {selected.sizes.length > 0 && (
                  <span style={{ color: "rgba(255,255,255,.55)", marginLeft: 8, fontSize: 12 }}>
                    Sizes: {selected.sizes.join(" · ")}
                  </span>
                )}
              </div>
              <button className="ph-btn" onClick={() => setInterested(true)}
                style={{ background: "linear-gradient(120deg, var(--rani), var(--rani-soft))", color: "#fff", padding: "10px 18px", fontSize: 14, borderRadius: 22, boxShadow: "0 4px 14px rgba(196,37,97,.35)" }}>
                🙋 I want this
              </button>
              <button className="ph-btn" disabled={lookState !== "idle"}
                onClick={async () => {
                  if (!resultImage) return;
                  setLookState("saving");
                  const saved = await saveLook({
                    garmentId: selected.id, garmentName: selected.name,
                    price: selected.price, shopName: shop.name, imageUrl: resultImage,
                  });
                  if (saved) { setLookState("saved"); onLookSaved(); }
                  else setLookState("idle");
                }}
                style={{ background: lookState === "saved" ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.14)", color: lookState === "saved" ? "var(--marigold)" : "#fff", padding: "10px 18px", fontSize: 14, borderRadius: 22 }}>
                {lookState === "saved" ? "♥ Saved" : lookState === "saving" ? "Saving…" : "♡ Save look"}
              </button>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>✨ AI try-on · ask staff to see it in person</span>
            </div>
          )}

          {interested && selected && (
            <InterestedModal shop={shop} garment={selected} onClose={() => setInterested(false)} />
          )}

          {notice && phase === "preview" && (
            <div style={{ fontSize: 12, color: "var(--marigold)", background: "rgba(242,169,59,.12)", padding: "7px 14px", borderRadius: 10 }}>
              {notice}
            </div>
          )}

          {/* preview controls */}
          {phase === "preview" && selected && (
            <div className="fade-up" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center", background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 16px" }}>
              <div style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{selected.name}</span>
                <span style={{ color: "var(--marigold)", marginLeft: 8, fontWeight: 700 }}>{npr(selected.price)}</span>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,255,.6)" }}>
                Size
                <input type="range" min="0.3" max="1.4" step="0.01" value={overlay.scale}
                  onChange={(e) => setOverlay((o) => ({ ...o, scale: +e.target.value }))} style={{ accentColor: "var(--rani)" }} />
              </label>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>Drag the garment to position · preview mode</span>
            </div>
          )}
          <button className="ph-btn" onClick={retakePhoto} style={{ background: "transparent", color: "rgba(255,255,255,.45)", fontSize: 13, padding: "4px 8px" }}>
            Retake my photo
          </button>
        </div>
      </div>

      {/* category chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 2px 8px" }} className="garment-rail">
        {cats.map((c) => (
          <button key={c} className="ph-btn" onClick={() => setCatFilter(c)}
            style={{ background: catFilter === c ? "var(--marigold)" : "rgba(255,255,255,.09)", color: catFilter === c ? "var(--ink)" : "rgba(255,255,255,.75)", padding: "8px 16px", fontSize: 13, borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
            {c}
          </button>
        ))}
      </div>

      {/* garment rail — the rack */}
      <div className="garment-rail" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {rail.map((g) => (
          <button key={g.id} onClick={() => startTryOn(g)} className="ph-btn"
            style={{
              flexShrink: 0, width: 108, padding: 0, borderRadius: 14, overflow: "hidden", textAlign: "left",
              background: "#fff", border: selected?.id === g.id ? "3px solid var(--marigold)" : "3px solid transparent",
            }}>
            <div style={{ aspectRatio: "3/4", background: "var(--plum)" }}>
              <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ padding: "6px 8px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              <div style={{ fontSize: 11, color: "var(--rani)", fontWeight: 700 }}>{npr(g.price)}</div>
              {g.sizes.length > 0 && (
                <div style={{ fontSize: 9.5, color: "var(--mut)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sizes.join(" ")}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import {
  PRO_CONTROLS, captureFrame, checkLight, correctionGains, readVideoPatch, wbMatrix,
} from "@/lib/proshot";
import type { LightVerdict, ProControl, WbGains } from "@/lib/proshot";

/* The pro shot: an in-app camera for the bolt, built around one gesture.

   The vendor holds a sheet of plain white paper beside the cloth and taps it
   on the live preview. From that tap comes everything the file-input path
   never had: the white balance, set from a known white instead of the phone's
   guess (the guess is the single biggest source of wrong colours in the
   catalog — see color-detect.ts's opening apology); and a verdict on the
   light itself, read off the same patch.

   The verdict is a gate. Only when the light passes — bright, unclipped,
   near-neutral: the profile of daylight or a high-CRI (95+) lamp, which is
   as close as an RGB sensor can get to asking about CRI — do the manual
   camera controls unlock, and only the ones this device actually answers
   for (Android Chrome offers most, iOS none). Under bad light the sliders
   stay shut on purpose: manual control there is a tool for making the
   preview look right while the pixels stay wrong, and the honest advice is
   a window, not a slider.

   Portalled to <body> for the same reason ImageZoom is — this opens from
   inside the fabric form's Dialog, whose fade-up transform cages
   position: fixed. */

interface Props {
  /** A full-resolution, white-balanced frame — headed for the same cropper
      every uploaded photo goes through. */
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  /** The way out for a denied camera or a phone that has none: the parent
      opens its file input, which is the path that always works. */
  onUpload: () => void;
}

/** A control the hardware answered for, with the range it offered. */
interface LiveControl {
  ctrl: ProControl;
  min: number;
  max: number;
  step: number;
  value: number;
}

export default function ProShot({ onCapture, onClose, onUpload }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  /* Where the paper was, in 0..1 of the frame — kept so a hardware slider
     moving can re-read the same spot, and so the marker has somewhere to
     be. */
  const pointRef = useRef<{ nx: number; ny: number } | null>(null);
  const retuneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [camState, setCamState] = useState<"starting" | "live" | "denied">("starting");
  const [gains, setGains] = useState<WbGains | null>(null);
  const [verdict, setVerdict] = useState<LightVerdict | null>(null);
  const [point, setPoint] = useState<{ nx: number; ny: number } | null>(null);
  const [controls, setControls] = useState<LiveControl[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        /* 2560 ideal, not the kiosk's 1280: this frame is what the vendor
           crops the weave out of, and images.ts is explicit that the crop is
           taken from the full picture — a tight crop of a small frame is a
           small picture of the weave. */
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        /* Cloth is a close subject; ask for continuous focus where it's a
           real setting. Refusal is fine — it's the default nearly
           everywhere. */
        try {
          await track?.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints);
        } catch { /* not offered — the camera focuses as it pleases */ }

        /* Which of the pro controls this hardware actually has. The spec
           types don't know these keys, so this is stringly on purpose. */
        const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
        const settings = (track?.getSettings?.() ?? {}) as Record<string, unknown>;
        const live: LiveControl[] = [];
        for (const ctrl of PRO_CONTROLS) {
          const cap = caps[ctrl.key] as { min?: number; max?: number; step?: number } | undefined;
          if (!cap || typeof cap.min !== "number" || typeof cap.max !== "number" || cap.min >= cap.max) continue;
          if (ctrl.mode) {
            const modes = caps[ctrl.mode.key];
            if (!Array.isArray(modes) || !modes.includes(ctrl.mode.value)) continue;
          }
          const current = typeof settings[ctrl.key] === "number" ? (settings[ctrl.key] as number) : (cap.min + cap.max) / 2;
          live.push({
            ctrl,
            min: cap.min,
            max: cap.max,
            step: cap.step || (cap.max - cap.min) / 100,
            value: current,
          });
        }
        if (!cancelled) {
          setControls(live);
          setCamState("live");
        }
      } catch {
        if (!cancelled) setCamState("denied");
      }
    })();
    return () => {
      cancelled = true;
      if (retuneTimer.current) clearTimeout(retuneTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Read the paper — off the raw stream, never the corrected preview.
     readVideoPatch draws from the video's frames, which CSS filters don't
     touch, so re-tapping always measures what the sensor is delivering now
     and the gains never compound. */
  const tune = useCallback((nx: number, ny: number) => {
    const v = videoRef.current;
    if (!v) return;
    const patch = readVideoPatch(v, nx, ny);
    if (!patch) return;
    pointRef.current = { nx, ny };
    setPoint({ nx, ny });
    setGains(correctionGains(patch));
    setVerdict(checkLight(patch));
  }, []);

  const tap = (e: React.MouseEvent<HTMLVideoElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    tune(
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    );
  };

  /* A slider changing the sensor changes what the paper reads, so the paper
     is read again — after a beat, because exposure and temperature take a few
     frames to land. Without this, hardware WB and software WB would fight:
     the gains computed under the old setting stay glued on top of the new
     one. */
  const retuneSoon = () => {
    if (!pointRef.current) return;
    if (retuneTimer.current) clearTimeout(retuneTimer.current);
    retuneTimer.current = setTimeout(() => {
      const p = pointRef.current;
      if (p) tune(p.nx, p.ny);
    }, 350);
  };

  const setControl = async (key: string, value: number) => {
    const found = controls.find((c) => c.ctrl.key === key);
    const track = trackRef.current;
    if (!found || !track) return;
    // Optimistic — a slider that waits for the sensor feels broken.
    setControls((cur) => cur.map((c) => (c.ctrl.key === key ? { ...c, value } : c)));
    const advanced: Record<string, unknown> = { [key]: value };
    if (found.ctrl.mode) advanced[found.ctrl.mode.key] = found.ctrl.mode.value;
    try {
      await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
      retuneSoon();
    } catch {
      /* Advertised but refused — some sensors list a range they only honour
         in native apps. The control leaves rather than sitting there doing
         nothing. */
      setControls((cur) => cur.filter((c) => c.ctrl.key !== key));
    }
  };

  const snap = () => {
    const v = videoRef.current;
    if (!v || busy) return;
    setBusy(true);
    /* The gains go into the pixels here. Preview and capture run the same
       numbers — the SVG matrix and this loop are the one correction twice. */
    const dataUrl = captureFrame(v, gains);
    if (!dataUrl) { setBusy(false); return; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  };

  const balanced = gains !== null;
  const unlocked = verdict?.ok === true;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Pro shot camera"
      style={{ position: "fixed", inset: 0, zIndex: "var(--z-popover)", background: "var(--stage)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

      {/* The correction the shutter will apply, shown live on the preview.
          linearRGB, not sRGB: the gains are linear-light multipliers, and the
          browser degamma → matrix → regamma round trip is what makes this
          filter and captureFrame's pixel loop the same correction twice. */}
      {gains && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="proshot-wb" colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={wbMatrix(gains)} />
          </filter>
        </svg>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", flexShrink: 0 }}>
        <div>
          <div className="ph-display" style={{ fontSize: 19, color: "#fff", lineHeight: 1.2 }}>pro shot</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>
            the colour-true way to photograph a bolt
          </div>
        </div>
        <button className="ph-btn" onClick={onClose} aria-label="Close the camera"
          style={{ background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 14, padding: "9px 11px", borderRadius: "var(--radius-pill)" }}>
          <Icon name="close" />
        </button>
      </div>

      {camState === "denied" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 26px", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: 13.5, lineHeight: 1.7, maxWidth: 320 }}>
            The camera didn&apos;t open — permission, or a device without one. Uploading still
            works, and daylight in the photo still matters most.
          </div>
          <button className="ph-btn" onClick={onUpload}
            style={{ background: "#fff", color: "var(--stage)", fontWeight: 600, fontSize: 13, padding: "12px 22px", borderRadius: "var(--radius-pill)" }}>
            upload a photo instead
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0 16px 24px", minHeight: 0 }}>

          {/* The frame. Sized by its own intrinsic ratio (max constraints
              only), so a tap's position on screen is its position in the
              stream with no letterbox math. */}
          <div style={{ position: "relative", lineHeight: 0, borderRadius: "var(--radius-md)", overflow: "hidden", flexShrink: 0 }}>
            <video ref={videoRef} playsInline muted onClick={tap}
              style={{
                maxWidth: "min(94vw, 640px)", maxHeight: "48vh", display: "block",
                cursor: "crosshair",
                filter: gains ? "url(#proshot-wb)" : undefined,
              }} />
            {camState === "starting" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.7)", fontSize: 13, background: "rgba(0,0,0,.4)", minWidth: 240, minHeight: 180 }}>
                opening the camera…
              </div>
            )}
            {/* Where the paper was tapped — a small open square, drawn in the
                verdict's colour so "this is what we judged the light by" and
                "this is what the light was judged as" are one mark. */}
            {point && (
              <div aria-hidden style={{
                position: "absolute", left: point.nx * 100 + "%", top: point.ny * 100 + "%",
                width: 26, height: 26, marginLeft: -13, marginTop: -13,
                border: "2.5px solid " + (unlocked ? "#7ddf9a" : "#ffb35c"),
                borderRadius: 6, pointerEvents: "none",
              }} />
            )}
          </div>

          {/* The one instruction, or what the tap found. */}
          <div style={{ maxWidth: 480, width: "100%", flexShrink: 0 }}>
            {!balanced ? (
              <div style={{ background: "rgba(255,255,255,.1)", borderRadius: "var(--radius-sm)", padding: "11px 14px", fontSize: 12.5, color: "rgba(255,255,255,.9)", lineHeight: 1.65 }}>
                <b>Tap something white</b> on screen.
              </div>
            ) : unlocked ? (
              <div style={{ background: "rgba(125,223,154,.12)", border: "1px solid rgba(125,223,154,.4)", borderRadius: "var(--radius-sm)", padding: "11px 14px", fontSize: 12.5, color: "rgba(255,255,255,.92)", lineHeight: 1.65 }}>
                Set from your white. Moved? Tap again.
              </div>
            ) : (
              /* Corrected in full even here — the frame on screen is already
                 balanced and exposed off the paper. What this banner does is
                 stop short of promising "exact", and keep the sliders shut:
                 the arithmetic part is done, and what's left wrong about this
                 light is not something a slider reaches. */
              <div style={{ background: "rgba(255,179,92,.12)", border: "1px solid rgba(255,179,92,.45)", borderRadius: "var(--radius-sm)", padding: "11px 14px", fontSize: 12.5, color: "rgba(255,255,255,.92)", lineHeight: 1.65 }}>
                {verdict?.reason} Shoot away.
              </div>
            )}
          </div>

          {/* The manual deck — only under light that deserves it, and only
              the controls this hardware really answers for. */}
          {unlocked && controls.length > 0 && (
            <div style={{ maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 9, background: "rgba(255,255,255,.07)", borderRadius: "var(--radius-sm)", padding: "12px 14px", flexShrink: 0 }}>
              {controls.map(({ ctrl, min, max, step, value }) => (
                <label key={ctrl.key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "rgba(255,255,255,.85)" }}>
                  <span style={{ width: 88, flexShrink: 0, fontWeight: 600, letterSpacing: ".04em" }}>{ctrl.label}</span>
                  <input type="range" min={min} max={max} step={step} value={value}
                    aria-label={ctrl.label}
                    onChange={(e) => setControl(ctrl.key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: "#fff" }} />
                  <span style={{ width: 64, flexShrink: 0, textAlign: "right", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                    {ctrl.format(value)}{ctrl.unit && " " + ctrl.unit}
                  </span>
                </label>
              ))}
            </div>
          )}
          {unlocked && controls.length === 0 && (
            <div style={{ maxWidth: 480, width: "100%", fontSize: 11.5, color: "rgba(255,255,255,.55)", lineHeight: 1.6, textAlign: "center", flexShrink: 0 }}>
              Manual controls unavailable here.
            </div>
          )}

          {/* The shutter. Never locked behind the paper — a vendor with a
              queue and no paper still gets their photo, just with the phone's
              guess and a line saying so. */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 6 }}>
            <button className="ph-btn" onClick={snap} disabled={camState !== "live" || busy}
              aria-label="Take the photo"
              style={{
                width: 68, height: 68, borderRadius: "50%", background: "#fff",
                border: "4px solid rgba(255,255,255,.35)", backgroundClip: "padding-box",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--stage)", opacity: camState !== "live" || busy ? 0.5 : 1,
              }}>
              <Icon name="camera" size={26} />
            </button>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
              {busy ? "keeping the colour…" : balanced ? "balanced — fill the frame" : "or shoot with the guess"}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { npr, waLink } from "@/lib/constants";
import { submitLead } from "@/lib/storage";
import { getContact } from "@/lib/account";
import {
  listLooks, setLookFavorite, deleteLook, clearAllLooks,
  lookImageURL, shareLook, type SavedLook,
} from "@/lib/looks";
import { saveProfile, forgetProfile, type Profile } from "@/lib/profile";
import { HEIGHT_MIN, HEIGHT_MAX, WEIGHT_MIN, WEIGHT_MAX, type Gender, type SizeRec } from "@/lib/sizing";
import { useT } from "@/lib/i18n";
import type { Wearable, Shop } from "@/lib/types";
import Icon from "@/components/Icon";
import EeMark from "@/components/EeMark";
import LookViewer from "@/components/LookViewer";

/* Kiosk pieces shared by every version of the shopper flow.

   These are the parts that are the same experiment either way — the lead
   form, the size sheet, the saved-looks gallery. Only the *stage* (how a
   try-on is framed, revealed and browsed) differs between Kiosk and KioskV2,
   so only the stage is written twice. */

export const barBtn: React.CSSProperties = {
  padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "var(--ink)",
  border: "1px solid var(--line)", borderRadius: 999, background: "var(--card)",
};

export interface KioskProps {
  shop: Shop;
  catalog: Wearable[];
  exit: () => void;
  initialGarmentId?: string | null;
  /* Shared-device mode: this tablet is used by one shopper after another, so
     nothing personal may survive a session. Turns off remember-my-photo, the
     saved-looks gallery and contact prefill, wipes everything on reset, and
     auto-resets when the tablet is left idle. Off on a shopper's own phone,
     where remembering is the whole point. */
  shared?: boolean;
}

/* ---------- "My looks": on-device gallery of saved try-ons ---------- */
export function LooksGallery({ onClose, onCountChange }: { onClose: () => void; onCountChange: (n: number) => void }) {
  const t = useT();
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [viewing, setViewing] = useState<SavedLook | null>(null);
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
                <button onClick={() => setViewing(l)} title={l.garmentName}
                  style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                  <img src={imgSrc(l)} alt={"You wearing " + l.garmentName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
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
                    <Icon name="share" /> {t.share}
                  </button>
                  <button className="ph-btn"
                    onClick={async () => {
                      if (!confirm(t.confirmDeleteLook)) return;
                      await deleteLook(l.id); refresh();
                    }}
                    style={{ color: "var(--stone)", fontSize: 11.5, padding: "6px 8px" }}>
                    {t.del}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <LookViewer look={viewing} src={imgSrc(viewing)} onClose={() => setViewing(null)}
          onDelete={async () => { await deleteLook(viewing.id); refresh(); }}
          labels={{ save: t.saveImage, share: t.share, del: t.deleteThisLook, confirmDelete: t.confirmDeleteLook }} />
      )}
    </div>
  );
}

/* ---------- "I want this" → vendor leads inbox ---------- */
export function InterestedModal({ shop, garment, recommended, shared, onClose }: { shop: Shop; garment: Wearable; recommended?: string; shared?: boolean; onClose: () => void }) {
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
    background: "var(--card)", color: "var(--ink)", fontSize: 15,
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
                            color: size === s ? "var(--on-accent)" : "var(--stone)",
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
              <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 10 }}>
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
export function SizeBadge({ rec, onEdit, dark }: { rec: SizeRec; onEdit: () => void; dark?: boolean }) {
  const t = useT();
  const note = rec.nearest ? t.sizeNearestNote(rec.size) : rec.confidence === "rough" ? t.sizeRoughNote : "";
  /* On the v2 shell the violet-on-white pill is the one light object in a dark
     room, so the same badge inverts rather than being written twice. */
  const ink = dark ? "var(--butter)" : "var(--violet)";
  const quiet = dark ? "var(--on-slab-quiet)" : "var(--stone)";
  return (
    <button className="ph-btn" onClick={onEdit}
      aria-label={t.findMySize}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13,
        fontWeight: 600, borderRadius: 999,
        border: "1px solid " + (dark ? "rgba(245,221,144,.55)" : "var(--violet)"),
        color: ink, background: dark ? "rgba(245,221,144,.10)" : "var(--card)",
      }}>
      <span><Icon name="ruler" /> {rec.free ? t.sizeFree : `${t.yourSize}: ${rec.size}`}</span>
      {note && <span style={{ color: quiet, fontWeight: 500, fontSize: 11 }}>· {note}</span>}
      <span style={{ color: quiet, fontSize: 11 }}><Icon name="edit" /></span>
    </button>
  );
}

export function FindMySizeSheet({ initial, onClose, onSaved, onForget }: {
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
    background: "var(--card)", color: "var(--ink)", fontSize: 15,
  };
  const genderChip = (g: Gender, label: string) => (
    <button key={g} className="ph-btn" onClick={() => setGender((cur) => (cur === g ? undefined : g))}
      style={{
        flex: 1, padding: "9px 0", fontSize: 13, borderRadius: 999, fontWeight: 600,
        background: gender === g ? "var(--violet)" : "var(--paper)",
        color: gender === g ? "var(--on-accent)" : "var(--stone)",
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
            style={{ flex: 2, background: "var(--violet)", color: "var(--on-accent)", padding: 13, fontSize: 14, borderRadius: 999, fontWeight: 700, fontFamily: "'Baloo 2', cursive", opacity: canSave ? 1 : 0.6 }}>
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

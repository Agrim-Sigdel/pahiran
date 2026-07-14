"use client";

import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { CATEGORIES, SIZES, npr } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import Activity from "@/components/Analytics";
import type { ErrorLog, Garment, Lead, Shop, TryOnEvent } from "@/lib/types";

interface DashboardProps {
  shop: Shop;
  updateShop: (s: Shop) => void;
  changeSlug: ((slug: string) => Promise<string | null>) | null;
  catalog: Garment[];
  addGarment: (g: Omit<Garment, "id">) => void;
  editGarment: (g: Garment) => void;
  removeGarment: (id: string) => void;
  toggleStock: (id: string) => void;
  events: TryOnEvent[];
  leads: Lead[];
  errors: ErrorLog[];
  onLeadHandled: (id: string, handled: boolean) => void;
  loading: boolean;
  launchKiosk: () => void;
  signOut: (() => void) | null;
}

export default function Dashboard({
  shop, updateShop, changeSlug, catalog, addGarment, editGarment, removeGarment,
  toggleStock, events, leads, errors, onLeadHandled, loading, launchKiosk, signOut,
}: DashboardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Garment | null>(null);
  const [filter, setFilter] = useState("All");
  const [qrGarment, setQrGarment] = useState<Garment | null>(null);
  const filtered = filter === "All" ? catalog : catalog.filter((g) => g.category === filter);

  const kioskPath = shop.slug ? "/k/" + shop.slug : "/kiosk";
  const kioskUrl = typeof window === "undefined" ? kioskPath : window.location.origin + kioskPath;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px 80px" }}>
      {/* header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 0 10px", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="ph-display" style={{ fontSize: 30, lineHeight: 1 }}>
            Pahiran<span style={{ color: "var(--rani)" }}>.</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--mut)", marginTop: 4, letterSpacing: ".06em", textTransform: "uppercase" }}>
            Virtual try-on · vendor dashboard
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
            {signOut && (
              <button className="ph-btn" onClick={signOut}
                style={{ background: "transparent", color: "var(--mut)", padding: "10px 12px", fontSize: 13 }}>
                Sign out
              </button>
            )}
            <button
              className="ph-btn"
              onClick={() => {
                if (catalog.length === 0) {
                  alert("Add at least one garment to your catalog first — the kiosk needs something on the rack to show shoppers.");
                  return;
                }
                launchKiosk();
              }}
              style={{
                background: catalog.length === 0 ? "var(--line)" : "linear-gradient(120deg, var(--rani), var(--rani-soft))",
                color: catalog.length === 0 ? "var(--mut)" : "#fff",
                padding: "14px 26px", fontSize: 16,
                boxShadow: catalog.length === 0 ? "none" : "0 8px 22px rgba(196,37,97,.32)",
              }}>
              ▸ Launch kiosk mode
            </button>
          </div>
          {catalog.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 6 }}>
              Add a garment below to unlock the kiosk
            </div>
          )}
        </div>
      </header>

      {/* shop identity strip */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "14px 0 26px", borderBottom: "1px solid var(--line)" }}>
        <LabeledInput label="Shop name" value={shop.name} placeholder="e.g. Juju Fashion House"
          onChange={(v) => updateShop({ ...shop, name: v })} width={260} />
        <LabeledInput label="Area / city" value={shop.area} placeholder="e.g. New Road, Kathmandu"
          onChange={(v) => updateShop({ ...shop, area: v })} width={260} />
        {shop.slug && <KioskLink url={kioskUrl} slug={shop.slug} changeSlug={changeSlug} />}
      </div>

      {/* activity: stats, chart, leads, history, errors */}
      {!loading && (
        <Activity events={events} catalog={catalog} leads={leads} errors={errors} onLeadHandled={onLeadHandled} />
      )}

      {/* catalog header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 0 16px", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="ph-display" style={{ fontSize: 22 }}>Catalog</span>
          <span style={{ color: "var(--mut)", marginLeft: 10, fontSize: 14 }}>{catalog.length} item{catalog.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "#fff", fontSize: 14 }}>
            <option>All</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="ph-btn" onClick={() => setShowForm(true)}
            style={{ background: "var(--ink)", color: "#fff", padding: "11px 20px", fontSize: 14 }}>
            + Add garment
          </button>
        </div>
      </div>

      {/* catalog grid */}
      {loading ? (
        <div style={{ color: "var(--mut)", padding: 40, textAlign: "center" }}>Loading your catalog…</div>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} anyItems={catalog.length > 0} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 18 }}>
          {filtered.map((g) => (
            <div key={g.id} className="fade-up" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", opacity: g.inStock ? 1 : 0.65 }}>
              <div style={{ aspectRatio: "3/4", background: "var(--plum)", position: "relative" }}>
                <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: g.inStock ? "none" : "grayscale(.7)" }} />
                <span style={{ position: "absolute", top: 10, left: 10, background: "rgba(33,20,35,.78)", color: "var(--marigold)", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 20 }}>
                  {g.category}
                </span>
                {!g.inStock && (
                  <span style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(33,20,35,.85)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 20 }}>
                    Out of stock
                  </span>
                )}
              </div>
              <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{g.name}</div>
                {g.sizes.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0 6px" }}>
                    {g.sizes.map((s) => (
                      <span key={s} style={{ fontSize: 10, fontWeight: 600, color: "var(--mut)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px" }}>{s}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--rani)", fontWeight: 700, fontSize: 15 }}>{npr(g.price)}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button className="ph-btn" onClick={() => setEditing(g)}
                      style={{ background: "transparent", color: "var(--ink)", fontSize: 12, padding: "4px 6px", fontWeight: 500 }}>
                      Edit
                    </button>
                    <button className="ph-btn" title="QR code for this garment" onClick={() => setQrGarment(g)}
                      style={{ background: "transparent", color: "var(--ink)", fontSize: 12, padding: "4px 6px", fontWeight: 500 }}>
                      QR
                    </button>
                    <button className="ph-btn" onClick={() => toggleStock(g.id)}
                      style={{ background: "transparent", color: g.inStock ? "var(--mut)" : "var(--rani)", fontSize: 12, padding: "4px 6px", fontWeight: 500 }}>
                      {g.inStock ? "In stock" : "Restock"}
                    </button>
                    <button className="ph-btn" onClick={() => removeGarment(g.id)}
                      style={{ background: "transparent", color: "var(--mut)", fontSize: 12, padding: "4px 6px", fontWeight: 500 }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <GarmentModal onClose={() => setShowForm(false)} onSave={(g) => { addGarment(g); setShowForm(false); }} />}
      {editing && (
        <GarmentModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(g) => { editGarment({ ...editing, ...g }); setEditing(null); }}
        />
      )}
      {qrGarment && (
        <QRModal
          garment={qrGarment}
          url={kioskUrl + "?g=" + encodeURIComponent(qrGarment.id)}
          crossDevice={Boolean(shop.slug)}
          onClose={() => setQrGarment(null)}
        />
      )}
    </div>
  );
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function KioskLink({ url, slug, changeSlug }: {
  url: string; slug: string; changeSlug: ((slug: string) => Promise<string | null>) | null;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = SLUG_RE.test(draft) && draft.length >= 3 && draft.length <= 40;

  const save = async () => {
    if (!changeSlug || !valid || draft === slug) { setEditing(false); return; }
    setBusy(true);
    const err = await changeSlug(draft);
    setBusy(false);
    if (err) { setError(err); return; }
    setError("");
    setEditing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--mut)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>
      Your kiosk link
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>/k/</span>
            <input value={draft} autoFocus
              onChange={(e) => { setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
              style={{ padding: "10px 13px", borderRadius: 10, border: "1px solid " + (valid ? "var(--line)" : "var(--rani)"), fontSize: 14, letterSpacing: 0, textTransform: "none", fontWeight: 400, width: 190 }} />
            <button className="ph-btn" disabled={!valid || busy} onClick={save}
              style={{ background: valid ? "var(--ink)" : "var(--line)", color: valid ? "#fff" : "var(--mut)", padding: "10px 14px", fontSize: 12 }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="ph-btn" onClick={() => { setEditing(false); setDraft(slug); setError(""); }}
              style={{ background: "transparent", color: "var(--mut)", padding: "10px 8px", fontSize: 12 }}>
              Cancel
            </button>
          </div>
          <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", color: error ? "var(--rani)" : "var(--mut)" }}>
            {error || "Lowercase letters, numbers and dashes. Changing this breaks QR codes you've already printed."}
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid var(--line)", background: "#fff", fontSize: 13, letterSpacing: 0, textTransform: "none", fontWeight: 400, maxWidth: "58vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {url}
          </code>
          <button className="ph-btn"
            onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ background: "var(--ink)", color: "#fff", padding: "10px 14px", fontSize: 12 }}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          {changeSlug && (
            <button className="ph-btn" onClick={() => { setDraft(slug); setEditing(true); }}
              style={{ background: "transparent", color: "var(--mut)", padding: "10px 8px", fontSize: 12 }}>
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QRModal({ garment, url, crossDevice, onClose }: { garment: Garment; url: string; crossDevice: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#211423", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(33,20,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "#fff", borderRadius: 20, width: 380, maxWidth: "100%", padding: 24, textAlign: "center" }}>
        <div className="ph-display" style={{ fontSize: 20, marginBottom: 4 }}>Try-on QR</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{garment.name}</div>
        <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 14 }}>
          Shoppers scan this on the hanger tag and try it on their own phone.
        </div>
        {qr ? (
          <img src={qr} alt={"QR code linking to try-on for " + garment.name} style={{ width: 220, height: 220, display: "block", margin: "0 auto" }} />
        ) : (
          <div style={{ width: 220, height: 220, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mut)", fontSize: 13 }}>
            Generating…
          </div>
        )}
        <code style={{ display: "block", fontSize: 11, color: "var(--mut)", margin: "12px 0", wordBreak: "break-all" }}>{url}</code>
        {!crossDevice && (
          <div style={{ fontSize: 12, color: "var(--marigold)", background: "rgba(242,169,59,.14)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
            Local mode: this link only works on this device until you connect Supabase and deploy.
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ph-btn" onClick={onClose} style={{ flex: 1, background: "var(--cream)", color: "var(--ink)", padding: "12px", fontSize: 14, border: "1px solid var(--line)" }}>Close</button>
          {qr && (
            <a className="ph-btn" href={qr} download={"pahiran-qr-" + garment.id + ".png"}
              style={{ flex: 1, background: "var(--ink)", color: "#fff", padding: "12px", fontSize: 14, textDecoration: "none" }}>
              Download PNG
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder, width }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--mut)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>
      {label}
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ width, maxWidth: "80vw", padding: "11px 13px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 15, background: "#fff", color: "var(--ink)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }} />
    </label>
  );
}

function EmptyState({ onAdd, anyItems }: { onAdd: () => void; anyItems: boolean }) {
  return (
    <div style={{ border: "2px dashed var(--line)", borderRadius: 20, padding: "60px 24px", textAlign: "center" }}>
      <div className="ph-display" style={{ fontSize: 22, marginBottom: 8 }}>
        {anyItems ? "Nothing in this category yet" : "Your rack is empty"}
      </div>
      <p style={{ color: "var(--mut)", maxWidth: 420, margin: "0 auto 20px", fontSize: 15 }}>
        Photograph each garment flat or on a mannequin against a plain wall, then add it here. Clean photos give the best try-on results.
      </p>
      <button className="ph-btn" onClick={onAdd} style={{ background: "var(--rani)", color: "#fff", padding: "13px 26px", fontSize: 15 }}>
        + Add your first garment
      </button>
    </div>
  );
}

function GarmentModal({ initial, onClose, onSave }: {
  initial?: Garment;
  onClose: () => void;
  onSave: (g: Omit<Garment, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? CATEGORIES[0]);
  const [price, setPrice] = useState(initial ? String(initial.price || "") : "");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [sizes, setSizes] = useState<string[]>(initial?.sizes ?? []);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setImage(await fileToCompressedDataURL(file)); }
    catch { alert("Could not read that image. Try a JPG or PNG."); }
    setBusy(false);
  };

  const toggleSize = (s: string) =>
    setSizes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const canSave = Boolean(name.trim() && image && !busy);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(33,20,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "#fff", borderRadius: 20, width: 440, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: 24 }}>
        <div className="ph-display" style={{ fontSize: 22, marginBottom: 18 }}>
          {initial ? "Edit garment" : "Add a garment"}
        </div>

        <div onClick={() => fileRef.current?.click()}
          style={{ border: "2px dashed " + (image ? "var(--rani)" : "var(--line)"), borderRadius: 14, height: 210, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden", background: "var(--cream)" }}>
          {busy ? <span style={{ color: "var(--mut)" }}>Processing photo…</span>
            : image ? <img src={image} alt="Garment preview" style={{ height: "100%", objectFit: "contain" }} />
            : <div style={{ textAlign: "center", color: "var(--mut)", fontSize: 14, padding: 12 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                Tap to upload a garment photo<br /><span style={{ fontSize: 12 }}>Flat-lay or mannequin, plain background</span>
              </div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Garment name (e.g. Banarasi silk sari — red)"
            style={{ padding: "12px 13px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 15 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ flex: 1, padding: "12px 13px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 15, background: "#fff" }}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Price (NPR)" inputMode="numeric"
              style={{ flex: 1, padding: "12px 13px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 15 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--mut)", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 7 }}>
              Available sizes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SIZES.map((s) => (
                <button key={s} type="button" className="ph-btn" onClick={() => toggleSize(s)}
                  style={{
                    padding: "7px 12px", fontSize: 13, borderRadius: 18,
                    background: sizes.includes(s) ? "var(--ink)" : "var(--cream)",
                    color: sizes.includes(s) ? "#fff" : "var(--mut)",
                    border: "1px solid " + (sizes.includes(s) ? "var(--ink)" : "var(--line)"),
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="ph-btn" onClick={onClose} style={{ flex: 1, background: "var(--cream)", color: "var(--ink)", padding: "13px", fontSize: 15, border: "1px solid var(--line)" }}>Cancel</button>
          <button className="ph-btn" disabled={!canSave}
            onClick={() => onSave({
              name: name.trim(), category, price: Number(price || 0), image: image!,
              sizes,
              inStock: initial?.inStock ?? true,
              tryonEnabled: initial?.tryonEnabled ?? true,
              stitchedToOrder: initial?.stitchedToOrder ?? false,
            })}
            style={{ flex: 2, background: canSave ? "var(--rani)" : "var(--line)", color: canSave ? "#fff" : "var(--mut)", padding: "13px", fontSize: 15 }}>
            {initial ? "Save changes" : "Save to catalog"}
          </button>
        </div>
      </div>
    </div>
  );
}

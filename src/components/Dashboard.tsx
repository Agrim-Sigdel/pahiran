"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import QRCode from "qrcode";
import { CATEGORIES, SIZES, npr } from "@/lib/constants";
import { fileToCompressedDataURL } from "@/lib/images";
import { OverviewTab, LeadsTab, garmentTryCounts } from "@/components/Analytics";
import LocationPicker from "@/components/LocationPicker";
import type { Garment, Lead, Shop, TryOnEvent } from "@/lib/types";

type Tab = "overview" | "leads" | "catalog" | "settings";

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
  onLeadHandled: (id: string, handled: boolean) => void;
  loading: boolean;
  launchKiosk: () => void;
  signOut: (() => void) | null;
}

export default function Dashboard({
  shop, updateShop, changeSlug, catalog, addGarment, editGarment, removeGarment,
  toggleStock, events, leads, onLeadHandled, loading, launchKiosk, signOut,
}: DashboardProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Garment | null>(null);
  const [filter, setFilter] = useState("All");
  const [qrGarment, setQrGarment] = useState<Garment | null>(null);

  const openLeads = leads.filter((l) => !l.handled).length;
  const tryCounts = useMemo(() => garmentTryCounts(events), [events]);
  const filtered = filter === "All" ? catalog : catalog.filter((g) => g.category === filter);

  const kioskPath = shop.slug ? "/k/" + shop.slug : "/kiosk";
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "leads", label: "Leads", badge: openLeads || undefined },
    { key: "catalog", label: "Catalog" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 min(26px, 4vw) 50px" }}>
      {/* header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 16px", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="wordmark" style={{ fontSize: 22 }}>peeq</div>
          <div style={{ fontSize: 12, color: "var(--mut)", letterSpacing: ".12em", marginTop: 3 }}>
            {[shop.name, shop.area].filter(Boolean).join(" · ") || "Vendor dashboard"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {signOut && (
            <button className="ph-btn" onClick={signOut}
              style={{ color: "var(--mut)", fontSize: 12, letterSpacing: ".1em" }}>sign out</button>
          )}
          <button
            className="ph-btn btn-solid"
            onClick={() => {
              if (catalog.length === 0) {
                alert("Add at least one garment to your catalog first — the kiosk needs something on the rack to show shoppers.");
                setTab("catalog");
                return;
              }
              launchKiosk();
            }}>launch kiosk</button>
        </div>
      </header>

      {/* tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "var(--mut)", padding: 40, textAlign: "center" }}>Loading your shop…</div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="fade-up">
              {openLeads > 0 && (
                <button className="ph-btn" onClick={() => setTab("leads")}
                  style={{ width: "100%", textAlign: "left", background: "var(--cream)", border: "1px solid var(--camel)", borderRadius: "var(--radius-card)", padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "var(--forest-deep)" }}>
                  <b style={{ color: "var(--camel)" }}>{openLeads} open lead{openLeads !== 1 ? "s" : ""}</b> — tap to view
                </button>
              )}
              <OverviewTab events={events} catalog={catalog} />
            </div>
          )}

          {tab === "leads" && (
            <div className="fade-up">
              <LeadsTab leads={leads} catalog={catalog} onLeadHandled={onLeadHandled} shopName={shop.name} />
            </div>
          )}

          {tab === "catalog" && (
            <div className="fade-up">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span className="ph-display" style={{ fontSize: 22, color: "var(--forest-deep)" }}>catalog</span>
                  <span style={{ color: "var(--mut)", marginLeft: 10, fontSize: 13 }}>{catalog.length} item{catalog.length !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}
                    style={{ padding: "10px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--cream)", fontSize: 13 }}>
                    <option>All</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button className="ph-btn btn-solid" style={{ padding: "11px 20px", fontSize: 12 }} onClick={() => setShowForm(true)}>
                    + add garment
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState onAdd={() => setShowForm(true)} anyItems={catalog.length > 0} />
              ) : (
                <div className="card-grid">
                  {filtered.map((g) => {
                    const tries = tryCounts.get(g.id) || 0;
                    return (
                      <div key={g.id} className="fade-up" style={{ background: "var(--cream)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)", opacity: g.inStock ? 1 : 0.6 }}>
                        <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--sage-mist)" }}>
                          <img src={g.image} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: g.inStock ? "none" : "grayscale(.7)" }} />
                          <span style={{ position: "absolute", top: 10, left: 10, background: "var(--cream)", color: "var(--forest-deep)", fontSize: 10, fontWeight: 600, letterSpacing: ".1em", padding: "4px 10px", borderRadius: 2 }}>
                            {g.category}
                          </span>
                          {tries > 0 && (
                            <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(26,23,20,.8)", color: "var(--cream)", fontSize: 10, padding: "4px 8px", borderRadius: 2 }}>
                              {tries} tr{tries === 1 ? "y" : "ies"}
                            </span>
                          )}
                          {!g.inStock && (
                            <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--forest-deep)", color: "var(--cream)", fontSize: 10, fontWeight: 500, letterSpacing: ".08em", padding: "4px 9px", borderRadius: 2 }}>
                              Out of stock
                            </span>
                          )}
                        </div>
                        <div style={{ padding: "13px 14px 14px" }}>
                          <div style={{ fontWeight: 500, fontSize: 11.5, letterSpacing: ".12em", marginBottom: 4 }}>{g.name}</div>
                          {g.sizes.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0 6px" }}>
                              {g.sizes.map((s) => (
                                <span key={s} style={{ fontSize: 10, fontWeight: 500, color: "var(--mut)", border: "1px solid var(--line)", borderRadius: 3, padding: "2px 6px" }}>{s}</span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                            <span style={{ color: "var(--camel)", fontWeight: 500, fontSize: 14 }}>{npr(g.price)}</span>
                            <span style={{ display: "flex", gap: 2 }}>
                              <button className="ph-btn" onClick={() => setEditing(g)}
                                style={{ color: "var(--forest-deep)", fontSize: 11, padding: "4px 5px", fontWeight: 500 }}>
                                Edit
                              </button>
                              <button className="ph-btn" title="QR code for this garment" onClick={() => setQrGarment(g)}
                                style={{ color: "var(--forest-deep)", fontSize: 11, padding: "4px 5px", fontWeight: 500 }}>
                                QR
                              </button>
                              <button className="ph-btn" onClick={() => toggleStock(g.id)}
                                style={{ color: g.inStock ? "var(--mut)" : "var(--camel)", fontSize: 11, padding: "4px 5px", fontWeight: 500 }}>
                                {g.inStock ? "In stock" : "Restock"}
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="fade-up">
              <SettingsTab shop={shop} updateShop={updateShop} changeSlug={changeSlug}
                kioskUrl={origin + kioskPath}
                storeUrl={shop.slug ? origin + "/s/" + shop.slug : null} />
            </div>
          )}
        </>
      )}

      {showForm && <GarmentModal onClose={() => setShowForm(false)} onSave={(g) => { addGarment(g); setShowForm(false); }} />}
      {editing && (
        <GarmentModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(g) => { editGarment({ ...editing, ...g }); setEditing(null); }}
          onRemove={() => { removeGarment(editing.id); setEditing(null); }}
        />
      )}
      {qrGarment && (
        <QRModal
          garment={qrGarment}
          url={origin + kioskPath + "?g=" + encodeURIComponent(qrGarment.id)}
          crossDevice={Boolean(shop.slug)}
          onClose={() => setQrGarment(null)}
        />
      )}
    </div>
  );
}

/* ── Settings tab: draft state + explicit save ── */
function SettingsTab({ shop, updateShop, changeSlug, kioskUrl, storeUrl }: {
  shop: Shop;
  updateShop: (s: Shop) => void;
  changeSlug: ((slug: string) => Promise<string | null>) | null;
  kioskUrl: string;
  storeUrl: string | null;
}) {
  const [name, setName] = useState(shop.name);
  const [area, setArea] = useState(shop.area);
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp);
  const [listed, setListed] = useState(shop.listed);
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({ lat: shop.lat, lng: shop.lng });
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(shop.name); setArea(shop.area); setWhatsapp(shop.whatsapp); setListed(shop.listed); setPin({ lat: shop.lat, lng: shop.lng }); }, [shop]);

  const dirty = name !== shop.name || area !== shop.area || whatsapp !== shop.whatsapp || listed !== shop.listed
    || pin.lat !== shop.lat || pin.lng !== shop.lng;

  return (
    <div className="panel">
      <div className="panel-head"><span className="title">Shop identity</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
        <label className="field">Shop name
          <input value={name} placeholder="e.g. Juju Fashion House" onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </label>
        <label className="field">Area / city
          <input value={area} placeholder="e.g. New Road, Kathmandu" onChange={(e) => { setArea(e.target.value); setSaved(false); }} />
        </label>
        <div className="field">Shop location on the map
          <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--mut)", margin: "2px 0 8px", display: "block" }}>
            Shoppers see this pin on the peeq map and your storefront. Tap the map or drag the dot.
          </span>
          <LocationPicker lat={pin.lat} lng={pin.lng} onChange={(lat, lng) => { setPin({ lat, lng }); setSaved(false); }} />
        </div>
        <label className="field">WhatsApp number (orders)
          <input value={whatsapp} placeholder="e.g. 9779841000000" inputMode="tel"
            onChange={(e) => { setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, "")); setSaved(false); }} />
        </label>
        <div className="field">Kiosk link (QR target)
          <LinkBox url={kioskUrl}>
            {changeSlug && shop.slug && <SlugEditor slug={shop.slug} changeSlug={changeSlug} />}
          </LinkBox>
        </div>
        {storeUrl && (
          <div className="field">Storefront link (share anywhere)
            <LinkBox url={storeUrl} />
          </div>
        )}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
          <input type="checkbox" checked={listed} style={{ marginTop: 3, accentColor: "var(--forest)" }}
            onChange={(e) => { setListed(e.target.checked); setSaved(false); }} />
          <span>
            Show my shop on the peeq landing page
            <span style={{ display: "block", fontSize: 12, color: "var(--mut)" }}>
              Shoppers can find and browse your storefront and kiosk.
            </span>
          </span>
        </label>
        <button className="ph-btn btn-solid" disabled={!dirty}
          onClick={() => { updateShop({ ...shop, name, area, whatsapp, listed, lat: pin.lat, lng: pin.lng }); setSaved(true); }}
          style={{ alignSelf: "flex-start", marginTop: 6, opacity: dirty ? 1 : 0.55 }}>
          {saved && !dirty ? "saved ✓" : "save changes"}
        </button>
      </div>
    </div>
  );
}

function LinkBox({ url, children }: { url: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <code style={{ padding: "11px 13px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 13, background: "#fff", color: "var(--ink)", flex: 1, minWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>
        {url}
      </code>
      <button className="ph-btn"
        onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{ background: "var(--forest-deep)", color: "var(--cream)", padding: "11px 16px", fontSize: 11, letterSpacing: ".1em" }}>
        {copied ? "copied ✓" : "copy"}
      </button>
      {children}
    </div>
  );
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function SlugEditor({ slug, changeSlug }: { slug: string; changeSlug: (slug: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = SLUG_RE.test(draft) && draft.length >= 3 && draft.length <= 40;

  const save = async () => {
    if (!valid || draft === slug) { setEditing(false); return; }
    setBusy(true);
    const err = await changeSlug(draft);
    setBusy(false);
    if (err) { setError(err); return; }
    setError("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button className="ph-btn" onClick={() => { setDraft(slug); setEditing(true); setError(""); }}
        style={{ color: "var(--mut)", padding: "10px 8px", fontSize: 11, letterSpacing: ".1em" }}>
        Edit
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>/k/</span>
        <input value={draft} autoFocus
          onChange={(e) => { setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          style={{ padding: "10px 13px", borderRadius: "var(--radius-btn)", border: "1px solid " + (valid ? "var(--line)" : "var(--camel)"), fontSize: 14, letterSpacing: 0, textTransform: "none", fontWeight: 400, width: 180, background: "#fff" }} />
        <button className="ph-btn" disabled={!valid || busy} onClick={save}
          style={{ background: valid ? "var(--forest)" : "var(--line)", color: valid ? "var(--cream)" : "var(--mut)", padding: "10px 14px", fontSize: 11, letterSpacing: ".1em" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="ph-btn" onClick={() => { setEditing(false); setDraft(slug); setError(""); }}
          style={{ color: "var(--mut)", padding: "10px 8px", fontSize: 11, letterSpacing: ".1em" }}>cancel</button>
      </div>
      <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: error ? "var(--camel)" : "var(--mut)" }}>
        {error || "Lowercase letters, numbers and dashes. Changing this breaks QR codes you've already printed."}
      </span>
    </div>
  );
}

function EmptyState({ onAdd, anyItems }: { onAdd: () => void; anyItems: boolean }) {
  return (
    <div style={{ border: "1.5px dashed var(--line)", borderRadius: "var(--radius-modal)", padding: "60px 24px", textAlign: "center", background: "var(--cream)" }}>
      <div className="ph-display" style={{ fontSize: 22, marginBottom: 8, color: "var(--forest-deep)" }}>
        {anyItems ? "Nothing in this category yet" : "Your rack is empty"}
      </div>
      <p style={{ color: "var(--mut)", maxWidth: 420, margin: "0 auto 20px", fontSize: 14, lineHeight: 1.6 }}>
        Photograph each garment flat or on a mannequin against a plain wall, then add it here. Clean photos give the best try-on results.
      </p>
      <button className="ph-btn btn-solid" onClick={onAdd}>+ add your first garment</button>
    </div>
  );
}

function GarmentModal({ initial, onClose, onSave, onRemove }: {
  initial?: Garment;
  onClose: () => void;
  onSave: (g: Omit<Garment, "id">) => void;
  onRemove?: () => void;
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
  const input: React.CSSProperties = { width: "100%", padding: "12px 13px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 15, background: "#fff" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--cream)", borderRadius: "var(--radius-modal)", width: 400, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: "28px 26px" }}>
        <div className="ph-display" style={{ fontSize: 24, color: "var(--forest-deep)", marginBottom: 18 }}>
          {initial ? "edit garment" : "add a garment"}
        </div>

        <div onClick={() => fileRef.current?.click()}
          style={{ border: "1.5px dashed " + (image ? "var(--forest)" : "var(--line)"), borderRadius: 6, height: 190, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden", background: "var(--sage)", color: "var(--mut)", fontSize: 14, textAlign: "center", lineHeight: 1.6 }}>
          {busy ? <span>Processing photo…</span>
            : image ? <img src={image} alt="Garment preview" style={{ height: "100%", objectFit: "contain" }} />
            : <div style={{ padding: 12 }}>Tap to upload a garment photo<br /><span style={{ fontSize: 12 }}>Flat-lay or mannequin, plain background</span></div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Garment name (e.g. Red Banarasi Silk Sari)" />
          <div style={{ display: "flex", gap: 10 }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ ...input, flex: 1 }}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input style={{ ...input, flex: 1 }} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Price (NPR)" inputMode="numeric" />
          </div>
          <div>
            <div className="field" style={{ marginBottom: 7 }}>Available sizes (optional)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SIZES.map((s) => (
                <button key={s} type="button" className="ph-btn" onClick={() => toggleSize(s)}
                  style={{
                    padding: "7px 13px", fontSize: 12, borderRadius: "var(--radius-btn)", fontWeight: 500,
                    background: sizes.includes(s) ? "var(--forest)" : "var(--sage)",
                    color: sizes.includes(s) ? "var(--cream)" : "var(--mut)",
                    border: "1px solid " + (sizes.includes(s) ? "var(--forest)" : "var(--line)"),
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="ph-btn" onClick={onClose}
            style={{ flex: 1, color: "var(--forest-deep)", padding: 13, fontSize: 12, letterSpacing: ".12em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>cancel</button>
          <button className="ph-btn" disabled={!canSave}
            onClick={() => onSave({
              name: name.trim(), category, price: Number(price || 0), image: image!,
              sizes,
              inStock: initial?.inStock ?? true,
              tryonEnabled: initial?.tryonEnabled ?? true,
              stitchedToOrder: initial?.stitchedToOrder ?? false,
            })}
            style={{ flex: 2, background: canSave ? "var(--forest)" : "var(--line)", color: canSave ? "var(--cream)" : "var(--mut)", padding: 13, fontSize: 12, letterSpacing: ".12em", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>
            {initial ? "save changes" : "save to catalog"}
          </button>
        </div>
        {initial && onRemove && (
          <button className="ph-btn"
            onClick={() => { if (confirm("Remove \"" + initial.name + "\" from the catalog?")) onRemove(); }}
            style={{ width: "100%", marginTop: 12, color: "var(--mut)", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Remove from catalog
          </button>
        )}
      </div>
    </div>
  );
}

function QRModal({ garment, url, crossDevice, onClose }: { garment: Garment; url: string; crossDevice: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#1A1714", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,23,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up"
        style={{ background: "var(--cream)", borderRadius: "var(--radius-modal)", width: 380, maxWidth: "100%", padding: "28px 26px", textAlign: "center" }}>
        <div className="ph-display" style={{ fontSize: 24, color: "var(--forest-deep)", marginBottom: 4 }}>try-on QR</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{garment.name}</div>
        <div style={{ fontSize: 12, color: "var(--mut)", marginBottom: 4 }}>
          Shoppers scan this on the hanger tag and try it on their own phone.
        </div>
        {qr ? (
          <img src={qr} alt={"QR code linking to try-on for " + garment.name} style={{ width: 200, height: 200, display: "block", margin: "14px auto" }} />
        ) : (
          <div style={{ width: 200, height: 200, margin: "14px auto", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mut)", fontSize: 13 }}>
            Generating…
          </div>
        )}
        <code style={{ display: "block", fontSize: 11, color: "var(--mut)", margin: "12px 0", wordBreak: "break-all" }}>{url}</code>
        {!crossDevice && (
          <div style={{ fontSize: 12, color: "var(--camel)", background: "var(--sage)", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
            Local mode: this link only works on this device until you connect Supabase and deploy.
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ph-btn" onClick={onClose}
            style={{ flex: 1, color: "var(--forest-deep)", padding: 13, fontSize: 12, letterSpacing: ".12em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 500 }}>close</button>
          {qr && (
            <a className="ph-btn" href={qr} download={"peeq-qr-" + garment.id + ".png"}
              style={{ flex: 2, background: "var(--forest)", color: "var(--cream)", padding: 13, fontSize: 12, letterSpacing: ".12em", textDecoration: "none", borderRadius: "var(--radius-btn)", fontWeight: 500, textAlign: "center" }}>download PNG</a>
          )}
        </div>
      </div>
    </div>
  );
}

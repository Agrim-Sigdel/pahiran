"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import ImageCropper from "@/components/ImageCropper";
import { confirmAsync } from "@/components/Dialog";
import { fileToDataURL } from "@/lib/images";
import { uploadStorefrontImage } from "@/lib/storage";
import { toastErr } from "@/lib/toast";
import ColorWheel from "@/components/ColorWheel";
import {
  accentClass, toneClass, layoutShowsHeroImages,
  STOREFRONT_DEFAULTS, STOREFRONT_SECTIONS, STOREFRONT_ACCENTS,
  STOREFRONT_LAYOUTS, STOREFRONT_TONES, STOREFRONT_CORNERS, STOREFRONT_FONTS,
} from "@/lib/constants";
import { storefrontLook, accentPreviewHex, tonePreviewHex } from "@/lib/storefront-theme";
import { storefrontFontVars } from "@/lib/storefront-fonts";
import {
  AnnounceBar, HeroSection, FeaturedSection, PromoSection, ShopCard,
  resolveStorefrontSlots, defaultHeroBody, type SectionLayout,
} from "@/components/storefront";
import { offersTryOn } from "@/components/TryOnCta";
import type {
  Composition, Fabric, Garment, Shop, SlotImage, Style,
  StorefrontConfig, StorefrontSectionId,
} from "@/lib/types";

/* The vendor's page, editable. Every control writes a draft StorefrontConfig;
   the preview beside the form renders the REAL storefront sections
   (storefront.tsx) against that draft, so what the vendor sees while editing
   is the production markup, not a mock of it. Nothing persists until "save" —
   which writes the whole config through the same updateShop path as Shop
   settings — and leaving with unsaved edits runs the same guard as every
   other dashboard form. */

const PHONE_W = 390; // the preview's design width — a phone, like most shoppers

/* A stitched fit as the picker offers it: the render, and the words the fits
   tab already uses for it. Stored into the config as a labelled image URL —
   see SlotImage — so the public page never reads the compositions table. */
type FitEntry = { id: string; image: string; label: string; draft: boolean };

export default function StorefrontEditor({ shop, catalog, fabrics, styles, compositions, updateShop, setLeaveGuard }: {
  shop: Shop;
  catalog: Garment[];
  fabrics: Fabric[];
  styles: Style[];
  compositions: Composition[];
  updateShop: (s: Shop) => void;
  setLeaveGuard: (fn: (() => Promise<boolean>) | null) => void;
}) {
  const [cfg, setCfg] = useState<StorefrontConfig>(shop.storefront);
  const [saved, setSaved] = useState(false);
  const [pane, setPane] = useState<"edit" | "preview">("edit"); // phones only
  /* Which slot an in-progress upload or pick is for. */
  const [uploadFor, setUploadFor] = useState<"hero" | "promo" | null>(null);
  const [pickFor, setPickFor] = useState<"hero" | "promo" | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /* Which colour the wheel is open on, if either. One at a time: both open at
     once is two wheels and no way to tell which swatch is being dragged. */
  const [wheelFor, setWheelFor] = useState<"accent" | "tone" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCfg(shop.storefront); }, [shop.storefront]);

  const dirty = useMemo(
    () => JSON.stringify(cfg) !== JSON.stringify(shop.storefront),
    [cfg, shop.storefront]
  );

  /* Same registration as GarmentPage: a ref so the guard registered once
     always reads the current answer. */
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    setLeaveGuard(async () => !dirtyRef.current || confirmAsync({
      title: "Discard changes?",
      body: "Your storefront edits aren't saved yet. Discard them?",
      confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true,
    }));
    return () => setLeaveGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (fn: (c: StorefrontConfig) => StorefrontConfig) => {
    setCfg(fn);
    setSaved(false);
  };
  /* null out empty strings on the way in: "" and "use the default" must be
     one state, or clearing a field would save a storefront that says nothing */
  const text = (v: string): string | null => (v.trim() === "" ? null : v);

  const promoApplies = offersTryOn(shop);
  const byId = useMemo(() => new Map(catalog.map((g) => [g.id, g])), [catalog]);

  /* The stitched fits, labelled the way the fits tab labels them. Drafts are
     offered too — a hero image is marketing, not a try-on entitlement — but
     they carry a badge so the vendor knows shoppers can't try that one yet. */
  const fits = useMemo<FitEntry[]>(() => {
    const fabricById = new Map(fabrics.map((f) => [f.id, f]));
    const styleById = new Map(styles.map((s) => [s.id, s]));
    return compositions
      .filter((c) => c.status === "ready" && c.image && c.fabricId && fabricById.has(c.fabricId))
      .map((c) => {
        const fabric = fabricById.get(c.fabricId!)!;
        const style = c.styleId ? styleById.get(c.styleId) : undefined;
        return {
          id: c.id,
          image: c.image!,
          label: (style?.name ?? "Cut") + " · " + fabric.name,
          draft: !c.published,
        };
      })
      .sort((a, b) => Number(a.draft) - Number(b.draft) || a.label.localeCompare(b.label));
  }, [compositions, fabrics, styles]);

  /* ---------- section order ---------- */

  /* The rows a vendor sees: promo is not offered to a general shop, so it
     doesn't appear as a thing to arrange. Moves swap with the DISPLAYED
     neighbour — never a silent no-op against a row that isn't shown. */
  const displayedSections = cfg.sections.filter((s) => s.id !== "promo" || promoApplies);
  const move = (id: StorefrontSectionId, dir: -1 | 1) => edit((c) => {
    const shown = c.sections.filter((s) => s.id !== "promo" || promoApplies);
    const di = shown.findIndex((s) => s.id === id);
    const target = shown[di + dir];
    if (!target) return c;
    const arr = [...c.sections];
    const [item] = arr.splice(arr.findIndex((s) => s.id === id), 1);
    const at = arr.findIndex((s) => s.id === target.id);
    arr.splice(dir > 0 ? at + 1 : at, 0, item);
    return { ...c, sections: arr };
  });
  const toggleHidden = (id: StorefrontSectionId) => edit((c) => ({
    ...c,
    sections: c.sections.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)),
  }));

  /* ---------- image slots ---------- */

  const addSlot = (target: "hero" | "promo", slot: SlotImage) => edit((c) =>
    target === "hero"
      ? { ...c, hero: { ...c.hero, images: [...c.hero.images, slot].slice(0, 8) } }
      : { ...c, promo: { ...c.promo, image: slot } });

  const handleFile = async (file: File | undefined) => {
    if (!file || !uploadFor) return;
    try { setCropping(await fileToDataURL(file)); }
    catch { toastErr("Could not read that image. Try a JPG or PNG."); setUploadFor(null); }
  };

  const finishCrop = async (dataUrl: string) => {
    const target = uploadFor;
    setCropping(null);
    setUploadFor(null);
    if (!target) return;
    setUploading(true);
    try {
      addSlot(target, { kind: "upload", url: await uploadStorefrontImage(shop, dataUrl) });
      setPickFor(null);
    } catch {
      toastErr("Could not upload that photo — please try again.");
    }
    setUploading(false);
  };

  /* ---------- shared bits ---------- */

  const input: React.CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", fontSize: 14.5, backgroundColor: "var(--card)", color: "var(--ink)" };
  const smallBtn: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "7px 12px" };
  const hint: React.CSSProperties = { fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)", margin: "2px 0 6px", display: "block" };

  const slotView = (slot: SlotImage): { src: string; label: string } => {
    if (slot.kind === "upload") return { src: slot.url, label: slot.label ?? "your photo" };
    const g = byId.get(slot.garmentId);
    return { src: g?.image ?? "", label: g?.name ?? "removed piece" };
  };

  const openPicker = (target: "hero" | "promo") =>
    setPickFor(pickFor === target ? null : target);

  const pickFit = (target: "hero" | "promo", f: FitEntry) => {
    addSlot(target, { kind: "upload", url: f.image, label: f.label });
    if (target === "promo") setPickFor(null);
  };
  const pickGarment = (target: "hero" | "promo", g: Garment) => {
    addSlot(target, { kind: "garment", garmentId: g.id });
    if (target === "promo") setPickFor(null);
  };

  const save = () => {
    updateShop({ ...shop, storefront: cfg });
    setSaved(true);
  };

  return (
    <div style={{ marginTop: 16 }}>
      {/* edit/preview toggle — phones only; wide screens show both */}
      <div className="sfe-toggle">
        {(["edit", "preview"] as const).map((p) => (
          <button key={p} className="ph-btn" onClick={() => setPane(p)} aria-pressed={pane === p}
            style={{ ...smallBtn, background: pane === p ? "var(--ink)" : "transparent", color: pane === p ? "var(--card)" : "var(--ink)" }}>
            {p}
          </button>
        ))}
      </div>

      <div className="sfe-split">
        <div className="sfe-form" data-pane={pane}>

          {/* ---- layout ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Layout</span>
              <span className="sub">how the page is put together</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STOREFRONT_LAYOUTS.map((l) => {
                const on = (cfg.layout ?? "boutique") === l.id;
                return (
                  <button key={l.id} className="ph-btn" onClick={() => edit((c) => ({ ...c, layout: l.id }))}
                    aria-pressed={on}
                    style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "2px solid " + (on ? "var(--violet)" : "var(--line)"), background: on ? "var(--paper)" : "transparent" }}>
                    <LayoutThumb id={l.id} on={on} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{l.label}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--stone)", lineHeight: 1.45, marginTop: 2 }}>{l.blurb}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--stone)", lineHeight: 1.45, marginTop: 4 }}>
                        Best for {l.best}.
                      </span>
                      {/* Said in the picker, not discovered on the live page.
                          A layout that can't show something the vendor spent
                          time choosing owes them the sentence before they
                          pick it — silently dropping their hero pictures
                          would read as peeq losing them. */}
                      {l.drops && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--warn)", fontWeight: 600, lineHeight: 1.45, marginTop: 5 }}>
                          {l.drops}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- colours ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Colours</span>
              <span className="sub">the paper, and the accent on it</span></div>

            <div className="field" style={{ marginBottom: 18 }}>Paper
              <span style={hint}>The background your photos sit on.</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {STOREFRONT_TONES.map((t) => {
                  const on = !cfg.toneHex && (cfg.tone ?? "warm") === t.id;
                  return (
                    <Swatch key={t.id} label={t.label} title={t.note} on={on}
                      /* the class paints --paper for free, so the swatch shows
                         the theme-appropriate value rather than a hardcoded one */
                      className={toneClass(t.id)} fill="var(--paper)"
                      onClick={() => { edit((c) => ({ ...c, tone: t.id, toneHex: null })); setWheelFor(null); }} />
                  );
                })}
                <Swatch label="Pick one" title="Choose any colour" on={!!cfg.toneHex}
                  fill={cfg.toneHex ? tonePreviewHex(cfg.toneHex) : undefined}
                  wheel={!cfg.toneHex}
                  onClick={() => {
                    if (!cfg.toneHex) edit((c) => ({ ...c, toneHex: tonePreviewHex("#f6efe3") }));
                    setWheelFor(wheelFor === "tone" ? null : "tone");
                  }} />
              </div>
              {wheelFor === "tone" && (
                <div style={{ marginTop: 10 }}>
                  <ColorWheel hex={cfg.toneHex ?? "#f6efe3"}
                    onChange={(h) => edit((c) => ({ ...c, toneHex: h }))}
                    onDone={() => setWheelFor(null)} />
                  <p style={{ fontSize: 12, color: "var(--stone)", margin: "8px 0 0", lineHeight: 1.5 }}>
                    The swatch shows what your page will actually use. Very dark
                    or very strong colours are lightened until prices and
                    captions still read on them — and a matching dark version is
                    worked out for shoppers whose phone is in dark mode.
                  </p>
                </div>
              )}
            </div>

            <div className="field">Accent
              <span style={hint}>Buttons, links and active states.</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[{ id: null as string | null, label: "peeq" }, ...STOREFRONT_ACCENTS].map((a) => {
                  const on = !cfg.accentHex && cfg.accent === a.id;
                  return (
                    <Swatch key={a.id ?? "default"} label={a.label} on={on}
                      className={accentClass(a.id)} fill="var(--violet)"
                      onClick={() => { edit((c) => ({ ...c, accent: a.id, accentHex: null })); setWheelFor(null); }} />
                  );
                })}
                <Swatch label="Pick one" title="Choose any colour" on={!!cfg.accentHex}
                  fill={cfg.accentHex ? accentPreviewHex(cfg.accentHex) : undefined}
                  wheel={!cfg.accentHex}
                  onClick={() => {
                    if (!cfg.accentHex) edit((c) => ({ ...c, accentHex: accentPreviewHex("#4a1526") }));
                    setWheelFor(wheelFor === "accent" ? null : "accent");
                  }} />
              </div>
              {wheelFor === "accent" && (
                <div style={{ marginTop: 10 }}>
                  <ColorWheel hex={cfg.accentHex ?? "#4a1526"}
                    onChange={(h) => edit((c) => ({ ...c, accentHex: h }))}
                    onDone={() => setWheelFor(null)} />
                  <p style={{ fontSize: 12, color: "var(--stone)", margin: "8px 0 0", lineHeight: 1.5 }}>
                    Your colour, deepened until white button text reads on it —
                    the swatch and the preview show the real result. A brighter
                    version of the same colour is worked out for dark mode.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ---- corners + heading face ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Style</span>
              <span className="sub">shape and lettering</span></div>
            <div className="field" style={{ marginBottom: 16 }}>Corners
              <span style={hint}>How round every card, button and photo is.</span>
              <Segmented options={STOREFRONT_CORNERS} value={cfg.corners ?? "soft"}
                onPick={(id) => edit((c) => ({ ...c, corners: id }))} />
            </div>
            <div className="field">Heading face
              <span style={hint}>Headings, buttons and prices. Body text stays the same so Nepali always renders.</span>
              <Segmented options={STOREFRONT_FONTS} value={cfg.font ?? "peeq"}
                onPick={(id) => edit((c) => ({ ...c, font: id }))} />
            </div>
          </div>

          {/* ---- sections ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Sections</span>
              <span className="sub">what shows, and in what order</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayedSections.map((s, i) => {
                const meta = STOREFRONT_SECTIONS[s.id];
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--line)", borderRadius: "var(--radius-md)", padding: "9px 12px", background: "var(--paper)", opacity: s.hidden ? 0.55 : 1 }}>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{meta.label}</span>
                    {meta.hideable ? (
                      <button className="ph-btn" onClick={() => toggleHidden(s.id)} aria-pressed={!s.hidden}
                        style={{ fontSize: 12, fontWeight: 600, color: s.hidden ? "var(--stone)" : "var(--violet)", padding: "6px 8px" }}>
                        {s.hidden ? "hidden" : "shown"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--stone)", padding: "6px 8px" }}>always shown</span>
                    )}
                    <button className="ph-btn" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label={"Move " + meta.label + " up"}
                      style={{ ...smallBtn, padding: "6px 10px", opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                    <button className="ph-btn" onClick={() => move(s.id, 1)} disabled={i === displayedSections.length - 1} aria-label={"Move " + meta.label + " down"}
                      style={{ ...smallBtn, padding: "6px 10px", opacity: i === displayedSections.length - 1 ? 0.35 : 1 }}>↓</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- announcement ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Announcement bar</span></div>
            <label className="field">Message
              <span style={hint}>Leave empty to use the standard line.</span>
              <input style={input} value={cfg.announceText ?? ""} maxLength={120}
                placeholder={STOREFRONT_DEFAULTS.announceText}
                onChange={(e) => edit((c) => ({ ...c, announceText: text(e.target.value) }))} />
            </label>
          </div>

          {/* ---- hero ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Hero</span>
              <span className="sub">the first thing a shopper sees</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="field">Small line above the heading
                <input style={input} value={cfg.hero.kicker ?? ""} maxLength={60}
                  placeholder={STOREFRONT_DEFAULTS.heroKicker}
                  onChange={(e) => edit((c) => ({ ...c, hero: { ...c.hero, kicker: text(e.target.value) } }))} />
              </label>
              <label className="field">Heading
                <span style={hint}>A new line in the box is a new line on the page.</span>
                <textarea style={{ ...input, resize: "vertical" }} rows={2} value={cfg.hero.headline ?? ""} maxLength={80}
                  placeholder={STOREFRONT_DEFAULTS.heroHeadline}
                  onChange={(e) => edit((c) => ({ ...c, hero: { ...c.hero, headline: text(e.target.value) } }))} />
              </label>
              <label className="field">Paragraph
                <textarea style={{ ...input, resize: "vertical" }} rows={3} value={cfg.hero.body ?? ""} maxLength={240}
                  placeholder={defaultHeroBody(shop)}
                  onChange={(e) => edit((c) => ({ ...c, hero: { ...c.hero, body: text(e.target.value) } }))} />
              </label>

              <div className="field">Hero pictures
                <span style={hint}>
                  {/* The warning belongs here as well as in the layout picker:
                      a vendor who chose Bazaar last week and comes back to
                      curate hero slides today never re-reads the picker. */}
                  {!layoutShowsHeroImages(cfg.layout) ? (
                    <b style={{ color: "var(--warn)", fontWeight: 600 }}>
                      The Bazaar layout doesn&apos;t show hero pictures. They&apos;re kept — switch layout to use them.
                    </b>
                  ) : cfg.hero.images.length === 0
                    ? "Automatic — your newest in-stock pieces slide through. Add your own to choose what leads."
                    : "These slide through, left to right."}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {cfg.hero.images.map((slot, i) => (
                    <SlotTile key={i} {...slotView(slot)} order={i + 1}
                      onLeft={i > 0 ? () => edit((c) => {
                        const images = [...c.hero.images];
                        [images[i - 1], images[i]] = [images[i], images[i - 1]];
                        return { ...c, hero: { ...c.hero, images } };
                      }) : undefined}
                      onRight={i < cfg.hero.images.length - 1 ? () => edit((c) => {
                        const images = [...c.hero.images];
                        [images[i], images[i + 1]] = [images[i + 1], images[i]];
                        return { ...c, hero: { ...c.hero, images } };
                      }) : undefined}
                      onRemove={() => edit((c) => ({ ...c, hero: { ...c.hero, images: c.hero.images.filter((_, j) => j !== i) } }))} />
                  ))}
                  {cfg.hero.images.length < 8 && (
                    <button className="ph-btn" onClick={() => openPicker("hero")} aria-expanded={pickFor === "hero"}
                      style={{ width: 104, aspectRatio: "3 / 4", border: "1.5px dashed " + (pickFor === "hero" ? "var(--ink)" : "var(--line-strong)"), borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--stone)", fontSize: 12, fontWeight: 600, background: "var(--paper)" }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                      {pickFor === "hero" ? "close" : "add"}
                    </button>
                  )}
                </div>
                {pickFor === "hero" && (
                  <SlotPicker fits={fits} catalog={catalog} uploading={uploading}
                    onFit={(f) => pickFit("hero", f)}
                    onGarment={(g) => pickGarment("hero", g)}
                    onUpload={() => { setUploadFor("hero"); fileRef.current?.click(); }} />
                )}
              </div>
            </div>
          </div>

          {/* ---- featured ---- */}
          <div className="panel">
            <div className="panel-head"><span className="title">Featured pieces</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="field">Heading
                <input style={input} value={cfg.featured.heading ?? ""} maxLength={60}
                  placeholder={STOREFRONT_DEFAULTS.featuredHeading}
                  onChange={(e) => edit((c) => ({ ...c, featured: { ...c.featured, heading: text(e.target.value) } }))} />
              </label>
              <div className="field">Which pieces
                <span style={hint}>
                  {cfg.featured.picks.length === 0
                    ? "Automatic — peeq picks from your in-stock pieces. Tap up to four to choose them yourself."
                    : "Your picks, in the order you tapped them. Tap again to remove."}
                </span>
                <GarmentPickGrid catalog={catalog} picks={cfg.featured.picks}
                  onPick={(g) => edit((c) => ({
                    ...c,
                    featured: {
                      ...c.featured,
                      picks: c.featured.picks.includes(g.id)
                        ? c.featured.picks.filter((id) => id !== g.id)
                        : c.featured.picks.length < 4 ? [...c.featured.picks, g.id] : c.featured.picks,
                    },
                  }))} />
              </div>
            </div>
          </div>

          {/* ---- promo (try-on shops only — a general shop never renders it) ---- */}
          {promoApplies && (
            <div className="panel">
              <div className="panel-head"><span className="title">Try-on promo</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label className="field">Small line above the heading
                  <input style={input} value={cfg.promo.kicker ?? ""} maxLength={60}
                    placeholder={STOREFRONT_DEFAULTS.promoKicker}
                    onChange={(e) => edit((c) => ({ ...c, promo: { ...c.promo, kicker: text(e.target.value) } }))} />
                </label>
                <label className="field">Heading
                  <input style={input} value={cfg.promo.heading ?? ""} maxLength={80}
                    placeholder={STOREFRONT_DEFAULTS.promoHeading}
                    onChange={(e) => edit((c) => ({ ...c, promo: { ...c.promo, heading: text(e.target.value) } }))} />
                </label>
                <label className="field">Paragraph
                  <textarea style={{ ...input, resize: "vertical" }} rows={3} value={cfg.promo.body ?? ""} maxLength={240}
                    placeholder={STOREFRONT_DEFAULTS.promoBody}
                    onChange={(e) => edit((c) => ({ ...c, promo: { ...c.promo, body: text(e.target.value) } }))} />
                </label>
                <div className="field">Photo
                  <span style={hint}>
                    {cfg.promo.image === null
                      ? "Automatic — a piece the sections above haven't already shown."
                      : "Your choice."}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
                    {cfg.promo.image && (
                      <SlotTile {...slotView(cfg.promo.image)}
                        onRemove={() => edit((c) => ({ ...c, promo: { ...c.promo, image: null } }))}
                        removeLabel="Back to automatic" />
                    )}
                    <button className="ph-btn" onClick={() => openPicker("promo")} aria-expanded={pickFor === "promo"}
                      style={{ width: 104, aspectRatio: "3 / 4", border: "1.5px dashed " + (pickFor === "promo" ? "var(--ink)" : "var(--line-strong)"), borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--stone)", fontSize: 12, fontWeight: 600, background: "var(--paper)" }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{cfg.promo.image ? "⇄" : "+"}</span>
                      {pickFor === "promo" ? "close" : cfg.promo.image ? "change" : "choose"}
                    </button>
                  </div>
                  {pickFor === "promo" && (
                    <SlotPicker fits={fits} catalog={catalog} uploading={uploading}
                      onFit={(f) => pickFit("promo", f)}
                      onGarment={(g) => pickGarment("promo", g)}
                      onUpload={() => { setUploadFor("promo"); fileRef.current?.click(); }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* one hidden input serves both upload buttons; uploadFor says where
              the picture lands */}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button className="ph-btn btn-solid" disabled={!dirty || uploading} onClick={save}
              style={{ opacity: dirty && !uploading ? 1 : 0.55 }}>
              {saved && !dirty ? <>saved <Icon name="check" /></> : "save changes"}
            </button>
            {dirty && (
              <button className="ph-btn" onClick={() => { setCfg(shop.storefront); setSaved(false); }}
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--stone)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                discard edits
              </button>
            )}
            {shop.slug && (
              <a href={"/s/" + shop.slug} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)", textUnderlineOffset: 3 }}>
                open the live page ↗
              </a>
            )}
          </div>
        </div>

        {/* ---- the live preview: the real sections, scaled to a phone ---- */}
        <div className="sfe-preview" data-pane={pane}>
          <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 6 }}>
            preview — how your page will look{dirty ? " (unsaved)" : ""}
          </div>
          <PhoneFrame>
            <StorefrontPreview shop={shop} cfg={cfg} catalog={catalog} />
          </PhoneFrame>
        </div>
      </div>

      {cropping && (
        <ImageCropper src={cropping} title="Crop the photo"
          hint="This is exactly what the storefront will show."
          onCancel={() => { setCropping(null); setUploadFor(null); }}
          onDone={finishCrop} />
      )}
    </div>
  );
}

/* ---------- look controls ---------- */

/* One colour choice. A preset swatch wears its own class and paints the token
   (var(--paper) / var(--violet)), so it shows the value the theme will
   actually resolve rather than a hardcoded light-mode copy. A picked colour
   has no class, so it takes `fill` — which is the DERIVED colour, never the
   raw hex: the swatch has to show what the page will use, or the vendor is
   choosing from a colour they'll never see. */
function Swatch({ label, title, on, className, fill, wheel = false, onClick }: {
  label: string;
  title?: string;
  on: boolean;
  className?: string;
  fill?: string;
  /** Draw the empty "any colour" state — a hue ring rather than a flat chip. */
  wheel?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={"ph-btn " + (className ?? "")} onClick={onClick} aria-pressed={on} title={title}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: 6, borderRadius: "var(--radius-md)", border: "2px solid " + (on ? "var(--ink)" : "transparent") }}>
      <span aria-hidden style={{
        width: 34, height: 34, borderRadius: "var(--radius-pill)", border: "1px solid var(--line-strong)",
        background: wheel
          ? "conic-gradient(from 0deg, #ff0000, #ffff00 60deg, #00ff00 120deg, #00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg)"
          : fill,
      }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? "var(--ink)" : "var(--stone)" }}>{label}</span>
    </button>
  );
}

/* A row of mutually exclusive choices, each with the one-liner that says what
   it's for — the note is the whole point, since "Soft / Round / Square" alone
   asks a vendor to imagine three pages. */
function Segmented({ options, value, onPick }: {
  options: readonly { id: string; label: string; note: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} className="ph-btn" onClick={() => onPick(o.id)} aria-pressed={on}
            style={{ flex: "1 1 140px", textAlign: "left", padding: "9px 12px", borderRadius: "var(--radius-md)", border: "2px solid " + (on ? "var(--violet)" : "var(--line)"), background: on ? "var(--paper)" : "transparent" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{o.label}</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--stone)", marginTop: 1 }}>{o.note}</span>
          </button>
        );
      })}
    </div>
  );
}

/* A twelve-pixel diagram of where things sit in each layout. Not a screenshot:
   the point is the arrangement — one big picture, a row that runs off the
   edge, a page that starts with the rack — which reads faster as bars than as
   a shrunken page nobody can make out. */
function LayoutThumb({ id, on }: { id: string; on: boolean }) {
  const ink = on ? "var(--violet)" : "var(--stone)";
  const bar = (h: number, w: string, solid = false): React.CSSProperties => ({
    height: h, width: w, borderRadius: 2, background: solid ? ink : "var(--line-strong)",
  });
  return (
    <span aria-hidden style={{ flexShrink: 0, width: 46, height: 58, padding: 5, borderRadius: 5, border: "1px solid var(--line)", background: "var(--card)", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
      {id === "boutique" && (
        <>
          <span style={{ display: "flex", gap: 3 }}>
            <span style={{ ...bar(20, "50%"), background: "var(--line)" }} />
            <span style={bar(20, "50%", true)} />
          </span>
          <span style={{ display: "flex", gap: 3 }}>
            <span style={bar(13, "50%")} /><span style={bar(13, "50%")} />
          </span>
          <span style={{ display: "flex", gap: 3 }}>
            <span style={bar(13, "50%")} /><span style={bar(13, "50%")} />
          </span>
        </>
      )}
      {id === "lookbook" && (
        <>
          <span style={bar(27, "100%", true)} />
          <span style={{ display: "flex", gap: 3 }}>
            <span style={bar(11, "42%")} /><span style={bar(11, "42%")} /><span style={bar(11, "22%")} />
          </span>
          <span style={{ display: "flex", gap: 3 }}>
            <span style={bar(9, "50%")} /><span style={bar(9, "50%")} />
          </span>
        </>
      )}
      {id === "bazaar" && (
        <>
          <span style={{ ...bar(5, "100%"), background: "var(--line)" }} />
          <span style={bar(6, "100%", true)} />
          <span style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={bar(10, "calc(33.33% - 1.4px)")} />
            ))}
          </span>
        </>
      )}
    </span>
  );
}

/* ---------- a filled image slot, as a tile ---------- */

/* One picture the vendor has placed: the image big enough to recognise, its
   name under it, and the controls ON the tile — remove top-right, order
   arrows on a scrim along the bottom (hero only; the promo has one slot and
   nothing to order). */
function SlotTile({ src, label, order, onLeft, onRight, onRemove, removeLabel = "Remove" }: {
  src: string;
  label: string;
  order?: number;
  onLeft?: () => void;
  onRight?: () => void;
  onRemove: () => void;
  removeLabel?: string;
}) {
  const arrow: React.CSSProperties = { width: 30, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, lineHeight: 1 };
  return (
    <div style={{ width: 104 }}>
      <div style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--line)", background: "var(--paper-deep)" }}>
        <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        {order !== undefined && (
          <span aria-hidden style={{ position: "absolute", top: 5, left: 5, minWidth: 20, height: 20, borderRadius: "var(--radius-pill)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
            {order}
          </span>
        )}
        <button className="ph-btn" onClick={onRemove} aria-label={removeLabel + " " + label}
          style={{ position: "absolute", top: 3, right: 3, width: 26, height: 26, borderRadius: "var(--radius-pill)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" />
        </button>
        {(onLeft || onRight) && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "space-between", background: "linear-gradient(transparent, rgba(0,0,0,.6))", paddingTop: 10 }}>
            <button className="ph-btn" onClick={onLeft} disabled={!onLeft} aria-label={"Move " + label + " earlier"}
              style={{ ...arrow, opacity: onLeft ? 1 : 0.3 }}>←</button>
            <button className="ph-btn" onClick={onRight} disabled={!onRight} aria-label={"Move " + label + " later"}
              style={{ ...arrow, opacity: onRight ? 1 : 0.3 }}>→</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--stone)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
        {label}
      </div>
    </div>
  );
}

/* ---------- pickers ---------- */

/* Where a hero or promo picture comes from: the stitched fits first — the
   renders are the shop's best marketing images — then the catalog, then a
   photo of the vendor's own. Fits lead when they exist; a shop with none
   (catalog-only, or nothing stitched yet) goes straight to the catalog. */
function SlotPicker({ fits, catalog, uploading, onFit, onGarment, onUpload }: {
  fits: FitEntry[];
  catalog: Garment[];
  uploading: boolean;
  onFit: (f: FitEntry) => void;
  onGarment: (g: Garment) => void;
  onUpload: () => void;
}) {
  const [source, setSource] = useState<"fits" | "catalog">(fits.length > 0 ? "fits" : "catalog");
  const seg: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: "var(--radius-pill)" };
  return (
    <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", padding: 12, background: "var(--paper)" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        {fits.length > 0 && (
          <>
            <button className="ph-btn" onClick={() => setSource("fits")} aria-pressed={source === "fits"}
              style={{ ...seg, background: source === "fits" ? "var(--ink)" : "transparent", color: source === "fits" ? "var(--card)" : "var(--stone)", border: "1px solid " + (source === "fits" ? "var(--ink)" : "var(--line)") }}>
              stitched fits
            </button>
            <button className="ph-btn" onClick={() => setSource("catalog")} aria-pressed={source === "catalog"}
              style={{ ...seg, background: source === "catalog" ? "var(--ink)" : "transparent", color: source === "catalog" ? "var(--card)" : "var(--stone)", border: "1px solid " + (source === "catalog" ? "var(--ink)" : "var(--line)") }}>
              catalog
            </button>
          </>
        )}
        <button className="ph-btn" disabled={uploading} onClick={onUpload}
          style={{ ...seg, marginLeft: "auto", color: "var(--violet)", border: "1px solid var(--violet)" }}>
          {uploading ? "uploading…" : "upload a photo"}
        </button>
      </div>

      {source === "fits" && fits.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto", padding: 2 }}>
          {fits.map((f) => (
            <button key={f.id} className="ph-btn" onClick={() => onFit(f)} title={f.label}
              style={{ padding: 0, borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--line)", background: "var(--paper-deep)", textAlign: "left" }}>
              <div style={{ position: "relative", aspectRatio: "3 / 4" }}>
                <img src={f.image} alt={f.label} loading="lazy"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                {f.draft && (
                  <span style={{ position: "absolute", top: 5, left: 5, fontSize: 9, fontWeight: 700, letterSpacing: ".08em", padding: "3px 7px", borderRadius: "var(--radius-xs)", background: "var(--card)", color: "var(--stone)" }}>
                    DRAFT
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink)", padding: "5px 7px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.label}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <GarmentPickGrid catalog={catalog} onPick={onGarment} />
      )}
    </div>
  );
}

/* A grid of the shop's pieces to tap. With `picks` it behaves as a numbered
   multi-select (featured); without, every tap just reports the piece. */
function GarmentPickGrid({ catalog, picks, onPick }: {
  catalog: Garment[];
  picks?: string[];
  onPick: (g: Garment) => void;
}) {
  if (catalog.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--stone)", padding: "12px 0" }}>Nothing in the catalog yet — add a garment first.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))", gap: 8, maxHeight: 300, overflowY: "auto", marginTop: 8, padding: 2 }}>
      {catalog.map((g) => {
        const at = picks?.indexOf(g.id) ?? -1;
        return (
          <button key={g.id} className="ph-btn" onClick={() => onPick(g)}
            aria-pressed={picks ? at >= 0 : undefined}
            title={g.name}
            style={{ position: "relative", padding: 0, borderRadius: "var(--radius-md)", overflow: "hidden", border: "2px solid " + (at >= 0 ? "var(--violet)" : "var(--line)"), background: "var(--paper-deep)", aspectRatio: "3 / 4" }}>
            <img src={g.image} alt={g.name} loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: g.inStock ? "none" : "grayscale(1)" }} />
            {at >= 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "var(--radius-pill)", background: "var(--violet)", color: "var(--on-accent)", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {at + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- the preview ---------- */

/* The page at phone width, scaled to whatever column it gets. Non-interactive
   by construction — pointer-events off, hidden from the accessibility tree —
   because its links point at the real storefront and a preview that navigates
   away mid-edit would be a trap. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      const ow = outerRef.current?.clientWidth ?? PHONE_W;
      const ih = innerRef.current?.offsetHeight ?? 0;
      const s = Math.min(1, ow / PHONE_W);
      setScale(s);
      setHeight(Math.round(ih * s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} style={{ border: "1px solid var(--line-strong)", borderRadius: "var(--radius-lg)", overflow: "hidden", maxHeight: "72vh", overflowY: "auto", background: "var(--paper)" }}>
      <div style={{ height: height || undefined, overflow: "hidden" }}>
        <div ref={innerRef} aria-hidden style={{ width: PHONE_W, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function StorefrontPreview({ shop, cfg, catalog }: {
  shop: Shop;
  cfg: StorefrontConfig;
  catalog: Garment[];
}) {
  const slug = shop.slug ?? "preview";
  const slots = resolveStorefrontSlots(cfg, catalog, slug);
  const tryOn = { enabled: true, left: 1 };
  const tryonHref = "/k/" + slug;
  const noop = () => {};
  /* The draft's look, through the same function the live page calls — so the
     preview is showing the vendor the real derivation, not a lookalike. */
  const look = storefrontLook(cfg);
  const layout = (cfg.layout ?? "boutique") as SectionLayout;

  const card = (g: Garment) => (
    <ShopCard key={g.id} g={g} slug={slug} shop={shop} tryOn={tryOn}
      saved={false} onToggleSave={noop} onAdd={noop} />
  );

  const sectionFor = (id: StorefrontSectionId): React.ReactNode => {
    switch (id) {
      case "announce":
        return <AnnounceBar text={cfg.announceText ?? STOREFRONT_DEFAULTS.announceText} />;
      case "hero":
        return (
          <HeroSection shop={shop}
            kicker={cfg.hero.kicker ?? STOREFRONT_DEFAULTS.heroKicker}
            headline={cfg.hero.headline ?? STOREFRONT_DEFAULTS.heroHeadline}
            body={cfg.hero.body ?? defaultHeroBody(shop)}
            slides={slots.heroSlides} tryOn={tryOn} tryonHref={tryonHref} layout={layout} />
        );
      case "featured":
        return slots.featured.length > 0 ? (
          <FeaturedSection heading={cfg.featured.heading ?? STOREFRONT_DEFAULTS.featuredHeading} layout={layout}>
            {slots.featured.map(card)}
          </FeaturedSection>
        ) : null;
      case "promo":
        return offersTryOn(shop) ? (
          <PromoSection shop={shop}
            kicker={cfg.promo.kicker ?? STOREFRONT_DEFAULTS.promoKicker}
            heading={cfg.promo.heading ?? STOREFRONT_DEFAULTS.promoHeading}
            body={cfg.promo.body ?? STOREFRONT_DEFAULTS.promoBody}
            promo={slots.promo} tryOn={tryOn} tryonHref={tryonHref} layout={layout} />
        ) : null;
      case "collection":
        /* Stand-in for the full collection: the heading and the first few
           cards. The search, sort and filter machinery is page state, not
           page description — nothing on it is editable here. */
        return (
          <section className="section-pad">
            <h2 className="ph-display" style={{ fontWeight: 600, fontSize: 22, color: "var(--ink)", margin: "0 0 16px" }}>the collection</h2>
            {catalog.length === 0 ? (
              <div style={{ color: "var(--stone)", padding: 30, textAlign: "center", fontSize: 13 }}>Your pieces will show here.</div>
            ) : (
              <div className="shop-grid">{catalog.slice(0, 4).map(card)}</div>
            )}
          </section>
        );
    }
  };

  return (
    <div className={[look.className, storefrontFontVars].filter(Boolean).join(" ")}
      style={{ ...look.style, background: "var(--paper)" }}>
      {cfg.sections.filter((s) => !s.hidden).map((s) => (
        <div key={s.id}>{sectionFor(s.id)}</div>
      ))}
      {/* the footer exists on the page but isn't configurable — one line
          stands in for it so the preview doesn't just stop mid-air */}
      <div style={{ background: "var(--slab)", color: "var(--on-slab)", textAlign: "center", fontSize: 12, padding: "18px 12px" }}>
        {shop.name || "Your shop"} · powered by peeq
      </div>
    </div>
  );
}

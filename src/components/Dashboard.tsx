"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  CATEGORIES, SIZES, FAMILIES, FABRIC_UNITS,
  npr, fabricPrice, familyLabel, colorHex, colorLabel, colorText,
} from "@/lib/constants";
import { fileToDataURL } from "@/lib/images";
import ImageCropper from "@/components/ImageCropper";
import ColorList from "@/components/ColorList";
import { readFabricColors, type ColorReading } from "@/lib/color-detect";
import { OverviewTab, LeadsTab, garmentTryCounts, groupLeads } from "@/components/Analytics";
import LocationPicker from "@/components/LocationPicker";
import PlanTab from "@/components/PlanTab";
import FabricStudio, { CutModal } from "@/components/FabricStudio";
import ProShot from "@/components/ProShot";
import CounterTryOn from "@/components/CounterTryOn";
import Icon from "@/components/Icon";
import AccountMenu from "@/components/AccountMenu";
import Dialog, { confirmAsync } from "@/components/Dialog";
import { toastErr, toastWarn } from "@/lib/toast";
import { COVERAGES } from "@/lib/types";
import type { Composition, CounterInput, CounterRun, Fabric, FabricColor, Garment, Lead, Shop, Style, StyleCoverage, StyleFamily, TryOnEvent } from "@/lib/types";

/* Only "leads", "catalog" and "fabrics" are in the tab bar. "overview" is the
   root the bar sits under, "plan" and "settings" are pages reached from the
   account menu (see PAGES), and the counter is an action rather than a place,
   so it isn't a tab at all any more.

   The bar carried eight entries at once — five on a catalog-only shop — in a
   horizontally-scrolling strip, which on a phone meant half the product was
   off the right edge of a nav with no affordance saying so. */
type Tab = "overview" | "leads" | "catalog" | "fabrics" | "settings" | "plan";

/* Set-up-once surfaces: rarely opened, but a toast or a bookmark has to be
   able to send a vendor straight to one, so they carry a ?tab= of their own. */
const PAGES = { plan: "Plan & billing", settings: "Shop settings" } as const;
type Page = keyof typeof PAGES;
const isPage = (t: string | null): t is Page => t === "plan" || t === "settings";

/* One row of actions on every catalog card. 11px text in 4×5px padding gave
   a ~20×24px target on a surface the marketing tells vendors to run from a
   phone; WCAG 2.5.8 asks for 24, and a thumb wants more. */
const cardAction: React.CSSProperties = {
  color: "var(--ink)", fontSize: 12.5, fontWeight: 600,
  padding: "9px 10px", minHeight: 38, borderRadius: "var(--radius-md)",
};

interface DashboardProps {
  shop: Shop;
  updateShop: (s: Shop) => void;
  changeSlug: ((slug: string) => Promise<string | null>) | null;
  catalog: Garment[];
  addGarment: (g: Omit<Garment, "id" | "itemCode">) => void;
  editGarment: (g: Garment) => void;
  removeGarment: (id: string) => void;
  toggleStock: (id: string) => void;
  fabrics: Fabric[];
  addFabric: (f: Omit<Fabric, "id" | "itemCode">) => void;
  editFabric: (f: Fabric) => void;
  removeFabric: (id: string) => void;
  toggleFabricStock: (id: string) => void;
  styles: Style[];
  compositions: Composition[];
  composeFabric: (fabricId: string, styleIds: string[]) => Promise<void>;
  createStyle: (s: { name: string; family: StyleFamily; hint: string; coverage: StyleCoverage; refImage: string | null }) => Promise<void>;
  updateStyle: (s: Style) => Promise<void>;
  publishComposition: (id: string, published: boolean) => void;
  priceComposition: (id: string, price: number) => void;
  noteComposition: (id: string, note: string) => void;
  correctComposition: (id: string, correction: string, scope: "cut" | "cloth") => void;
  fixFabricColor: (fabricId: string, colors: FabricColor[]) => void;
  removeComposition: (id: string) => void;
  /* The counter: a cloth and a customer that aren't catalog rows yet.
     `onStitched` fires when the piece exists, halfway through the run. */
  runCounter: (input: CounterInput, onStitched?: (garmentUrl: string) => void) => Promise<CounterRun>;
  keepCounterRun: (
    input: CounterInput,
    garmentUrl: string,
    names: { fabric: string; cut: string }
  ) => Promise<void>;
  counterEnabled: boolean;
  events: TryOnEvent[];
  leads: Lead[];
  onLeadHandled: (id: string, handled: boolean) => void;
  loading: boolean;
  launchKiosk: () => void;
  signOut: (() => void) | null;
  /** True while the one running image generation is in flight, wherever it was
      started from — stitching is one at a time. */
  composing: boolean;
}

export default function Dashboard({
  shop, updateShop, changeSlug, catalog, addGarment, editGarment, removeGarment,
  toggleStock, fabrics, addFabric, editFabric, removeFabric, toggleFabricStock,
  styles, compositions, composeFabric, createStyle, updateStyle,
  publishComposition, priceComposition, noteComposition, removeComposition,
  correctComposition, fixFabricColor,
  runCounter, keepCounterRun, counterEnabled,
  events, leads, onLeadHandled, loading, launchKiosk, signOut, composing,
}: DashboardProps) {
  const router = useRouter();
  const search = useSearchParams();
  const urlTab = search.get("tab");
  const urlCounter = search.get("counter");

  const [tab, setTab] = useState<Tab>("overview");
  /* Where "back" goes from Plan or Shop settings: the tab they were reading
     when they opened it, not a fixed home. */
  const [returnTab, setReturnTab] = useState<Tab>("overview");
  /* Bolts or cuts, inside the Fabrics tab. */
  const [fabricView, setFabricView] = useState<"bolts" | "cuts">("bolts");
  const [showCounter, setShowCounter] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Garment | null>(null);
  const [showFabricForm, setShowFabricForm] = useState(false);
  const [editingFabric, setEditingFabric] = useState<Fabric | null>(null);
  /* The id, not the row. A cloth-scoped correction reported inside the studio
     writes to the fabric, and a captured object would go on holding the old
     text — so the render it just marked for re-stitching would still read as
     current, and the vendor's report would look like it did nothing. Deriving
     it also closes the studio by itself if the bolt is deleted underneath. */
  const [studioFabricId, setStudioFabricId] = useState<string | null>(null);
  /* A trip out of the studio to fix the fabric's photo, and the way back. The
     studio closes rather than stacking a second dialog on itself, and both
     leaving the form and saving it land the vendor back on the previews they
     were checking — the photo was only ever a detour inside that job. */
  const [photoFix, setPhotoFix] = useState<
    { fabricId: string; mode: "replace" | "crop" } | null
  >(null);
  const photoFixFabric = useMemo(
    () => fabrics.find((f) => f.id === photoFix?.fabricId) ?? null,
    [fabrics, photoFix]
  );
  const studioFabric = useMemo(
    () => fabrics.find((f) => f.id === studioFabricId) ?? null,
    [fabrics, studioFabricId]
  );
  /* One family filter across both halves of the Fabrics tab. They used to be
     two states behind two tabs; now that the same select sits in the same
     place in both views, having it silently reset to All when you flipped
     from the kurta bolts to the kurta cuts would read as a bug. */
  const [familyFilter, setFamilyFilter] = useState("All");
  /* Same three jobs as the studio's form: new cut, edit a shop cut, copy a
     library cut into one the shop owns. */
  const [cutForm, setCutForm] = useState<{ mode: "new" | "edit" | "copy"; style?: Style } | null>(null);
  const [filter, setFilter] = useState("All");
  const [codeQuery, setCodeQuery] = useState("");
  const [qrGarment, setQrGarment] = useState<Garment | null>(null);
  const [showTagSheet, setShowTagSheet] = useState(false);

  /* Orders, not rows: a three-piece bag is one thing to call back about, so
     counting its lines would read as three waiting shoppers. */
  const openLeads = useMemo(() => groupLeads(leads).filter((o) => !o.handled).length, [leads]);
  const tryCounts = useMemo(() => garmentTryCounts(events), [events]);
  /* Vendors reading a code off a hanger tag type just the digits ("14") as
     often as the whole thing ("A7K2-0014"), so match on either. */
  const filtered = useMemo(() => {
    const byCategory = filter === "All" ? catalog : catalog.filter((g) => g.category === filter);
    const q = codeQuery.trim().toUpperCase();
    if (!q) return byCategory;
    const digits = q.replace(/\D/g, "");
    return byCategory.filter((g) => {
      const code = g.itemCode ?? "";
      if (code.includes(q)) return true;
      if (digits && code.split("-")[1]?.replace(/^0+/, "") === digits.replace(/^0+/, "")) return true;
      return g.name.toUpperCase().includes(q);
    });
  }, [catalog, filter, codeQuery]);

  const kioskPath = shop.slug ? "/k/" + shop.slug : "/kiosk";
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const visibleFabrics = useMemo(
    () => (familyFilter === "All" ? fabrics : fabrics.filter((f) => f.family === familyFilter)),
    [fabrics, familyFilter]
  );

  /* The cuts view: every cut, the shop's own first within each family so
     their tailoring sits above the library's. */
  const visibleCuts = useMemo(() => {
    const list = familyFilter === "All" ? styles : styles.filter((s) => s.family === familyFilter);
    return [...list].sort((a, b) =>
      Number(!!b.shopId) - Number(!!a.shopId) || a.sort - b.sort || a.name.localeCompare(b.name));
  }, [styles, familyFilter]);
  const yourCutCount = useMemo(() => visibleCuts.filter((s) => s.shopId).length, [visibleCuts]);

  /* Only ready renders count on the card — a failed or in-flight one isn't a
     cut the shop can sell yet. */
  const compCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of compositions) {
      if (c.status !== "ready" || !c.fabricId) continue;
      m.set(c.fabricId, (m.get(c.fabricId) ?? 0) + 1);
    }
    return m;
  }, [compositions]);

  /* Made-to-order is a tailoring flow, so it follows the same entitlement as
     the kiosk: a catalog-only shop never sees it. Cuts ride inside Fabrics,
     the counter is a header button and the overview is the root this bar sits
     under — so this is the whole bar: three entries on a tailor's shop, two on
     a catalog-only one, and no sideways scroll on a phone for either. */
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "leads", label: "Orders", badge: openLeads || undefined },
    { key: "catalog", label: "Catalog" },
    ...(shop.type === "apparel" ? [{ key: "fabrics" as Tab, label: "Fabrics" }] : []),
  ];

  /* Plan and Shop settings are addressable; the bar tabs are view state. So
     opening a page writes ?tab=, and going back to the bar clears it —
     otherwise a vendor who read the plans, carried on into the catalog and
     reloaded would land back on the plans. */
  const openPage = (p: Page) => {
    if (!isPage(tab)) setReturnTab(tab);
    setTab(p);
    router.replace("/dashboard?tab=" + p, { scroll: false });
  };
  const goTab = (t: Tab) => {
    setTab(t);
    if (urlTab) router.replace("/dashboard", { scroll: false });
  };

  /* The catalog- and fabric-limit toasts have always pushed /dashboard?tab=plan
     to send a vendor to the plans. Nothing read it: the tab was local state and
     the query string went nowhere, so "see plans" changed the address bar and
     left the vendor exactly where they were. Now that the Plan page has no tab
     of its own, that link is the main way in — so it has to work. */
  useEffect(() => { if (isPage(urlTab)) setTab(urlTab); }, [urlTab]);

  /* A printed access card lands on /dashboard?counter=1: the counter opens
     itself, then the flag is cleared so a reload doesn't reopen it. */
  useEffect(() => {
    if (urlCounter && shop.type === "apparel") {
      setShowCounter(true);
      router.replace("/dashboard", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCounter]);

  return (
    <div id="main" style={{ maxWidth: 1080, margin: "0 auto", padding: "0 min(26px, 4vw) 50px" }}>
      {/* header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0 16px", flexWrap: "wrap", gap: 12 }}>
        {/* The wordmark is the way home now that the overview has no tab of
            its own — the gesture every site on the web already trained a
            vendor to expect, so the account menu isn't the only road back. */}
        <button className="ph-btn" onClick={() => goTab("overview")}
          aria-label="Overview" title="Overview"
          style={{ padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer" }}>
          <div className="wordmark" style={{ fontSize: 22 }}>p<span className="ee" style={{ color: "var(--butter-deep)" }}>ee</span>q</div>
          <div style={{ fontSize: 12, color: "var(--stone)", letterSpacing: ".12em", marginTop: 3 }}>
            {[shop.name, shop.area].filter(Boolean).join(" · ") || "Vendor dashboard"}
          </div>
        </button>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Every apparel shop has a storefront, so every apparel shop gets a
              link to it. This used to render only in the non-apparel branch,
              which meant the shops that actually run try-ons had to dig their
              own public URL out of Settings to look at it. */}
          {shop.slug && (
            <a className="ph-btn" href={"/s/" + shop.slug} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "9px 16px", textDecoration: "none" }}>
              <Icon name="open" /> view storefront
            </a>
          )}
          {/* The counter is a thing you DO — three photographs and a fitting,
              for the customer standing in front of you right now — not a place
              with contents to come back to. It sat in the tab bar next to
              Catalog and Fabrics, which are places, and it kept a permanent
              slot for a flow that starts from zero every time. It belongs
              beside "launch kiosk": the other button that starts something. */}
          {shop.type === "apparel" && (
            <button className="ph-btn" onClick={() => setShowCounter(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "9px 16px" }}>
              <Icon name="scissors" /> counter
            </button>
          )}
          {/* The kiosk is the try-on flow, so a catalog-only shop has no use
              for it — their storefront link is the thing to share. */}
          {shop.type === "apparel" && (
            <button
              className="ph-btn btn-solid"
              onClick={() => {
                if (catalog.length === 0) {
                  toastWarn("Add at least one garment first — the kiosk needs something to show shoppers.");
                  goTab("catalog");
                  return;
                }
                launchKiosk();
              }}>launch kiosk</button>
          )}
          {/* Sign out lived here as 12px grey text immediately left of the
              primary CTA. It is an account action, so it belongs in the
              account menu every other page in the product already has — and
              the dashboard was the only page without one. Overview, Plan and
              Shop settings now sit in the same menu. Overview takes the slot
              the dead "Dashboard" self-link used to hold, which is what let it
              out of the tab bar: it is where a vendor lands, not somewhere
              they navigate to between jobs. */}
          <AccountMenu
            extraItems={[
              { label: "Overview", onSelect: () => goTab("overview") },
              ...(Object.keys(PAGES) as Page[]).map((p) => ({
                label: PAGES[p], onSelect: () => openPage(p),
              })),
            ]}
          />
          {!signOut && null}
        </div>
      </header>

      {/* tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => goTab(t.key)}>
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* On a page, no tab in the bar is lit — so the page says its own name
          and offers the way back to the tab the vendor left. Tapping any tab
          works too; this is just the one that doesn't ask them to choose. */}
      {isPage(tab) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "-4px 0 2px", flexWrap: "wrap" }}>
          <button className="ph-btn" onClick={() => goTab(returnTab)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "8px 14px" }}>
            <Icon name="back" /> back
          </button>
          <span className="ph-display" style={{ fontSize: 20, color: "var(--ink)" }}>{PAGES[tab].toLowerCase()}</span>
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--stone)", padding: 40, textAlign: "center" }}>Loading your shop…</div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="fade-up">
              {/* Named, because the overview is the one view no tab in the bar
                  lights up for — it is what the bar sits under, not an entry
                  in it. Without this the landing screen is three stat tiles
                  and a chart under a nav where nothing is selected. */}
              <div className="cat-bar">
                <div>
                  <span className="ph-display" style={{ fontSize: 22, color: "var(--ink)" }}>overview</span>
                  <span style={{ color: "var(--stone)", marginLeft: 10, fontSize: 13 }}>how your shop is doing</span>
                </div>
              </div>
              {/* --warn. This was `var(--camel)`, a legacy alias of the
                  body-text grey, so an "alert" drawn in it was the same colour
                  as the paragraph under it: the one row on the page meaning
                  "people are waiting for a phone call" read as decoration. */}
              {openLeads > 0 && (
                <button className="ph-btn" onClick={() => goTab("leads")}
                  style={{ width: "100%", textAlign: "left", background: "var(--warn-bg)", border: "1px solid var(--warn)", borderRadius: "var(--radius-card)", padding: "12px 16px", marginBottom: 14, fontSize: 13.5, color: "var(--ink)" }}>
                  <b style={{ color: "var(--warn)" }}>{openLeads} order{openLeads !== 1 ? "s" : ""} to call back</b> — tap to view
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
              <div className="cat-bar">
                <div>
                  <span className="ph-display" style={{ fontSize: 22, color: "var(--ink)" }}>catalog</span>
                  <span style={{ color: "var(--stone)", marginLeft: 10, fontSize: 13 }}>{catalog.length} item{catalog.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="cat-tools">
                  <input
                    className="cat-search"
                    value={codeQuery}
                    onChange={(e) => setCodeQuery(e.target.value)}
                    placeholder={shop.vendorCode ? `find ${shop.vendorCode}-0001 or a name…` : "search by name…"}
                    aria-label="Search your catalog by item code or name"
                    style={{ padding: "10px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", background: "var(--card)", fontSize: 13 }}
                  />
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}
                    className="ph-select" style={{ padding: "10px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", backgroundColor: "var(--card)", fontSize: 13 }}>
                    <option>All</option>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {catalog.length > 0 && (
                    <button className="ph-btn cat-qr" style={{ padding: "10px 18px", fontSize: 12, fontWeight: 600, border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", color: "var(--ink)", background: "var(--card)" }}
                      onClick={() => setShowTagSheet(true)}>
                      <Icon name="print" /> qr tags
                    </button>
                  )}
                  <button className="ph-btn btn-solid cat-add" style={{ padding: "11px 20px", fontSize: 12 }} onClick={() => setShowForm(true)}>
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
                      /* Out of stock greys the PHOTO, not the card: dimming the
                         whole tile to .6 took the name, the code and the price
                         below the contrast floor — exactly the fields a vendor
                         reads to decide what to restock. */
                      <div key={g.id} className="fade-up" style={{ background: "var(--card)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)" }}>
                        <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)" }}>
                          {/* Tapping a product photo means "open this product".
                              It used to open the QR modal — with a QR button
                              two lines below it — while the same gesture on the
                              Fabrics tab opened the studio. Same gesture, two
                              answers, neither of them the obvious one. */}
                          <button onClick={() => setEditing(g)} title={"Edit " + g.name}
                            style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                            <img src={g.image} alt={g.name} className={"img-blend" + (g.inStock ? "" : " oos-img")} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </button>
                          <span style={{ position: "absolute", top: 10, left: 10, background: "var(--card)", color: "var(--ink)", fontSize: 10, fontWeight: 600, letterSpacing: ".1em", padding: "4px 10px", borderRadius: "var(--radius-xs)" }}>
                            {g.category}
                          </span>
                          {tries > 0 && (
                            <span style={{ position: "absolute", top: 10, right: 10, background: "var(--stage-veil)", color: "var(--on-slab)", fontSize: 10, padding: "4px 8px", borderRadius: "var(--radius-xs)" }}>
                              {tries} tr{tries === 1 ? "y" : "ies"}
                            </span>
                          )}
                          {!g.inStock && (
                            <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--ink)", color: "var(--card)", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", padding: "4px 9px", borderRadius: "var(--radius-xs)" }}>
                              Out of stock
                            </span>
                          )}
                        </div>
                        <div style={{ padding: "13px 14px 14px" }}>
                          {/* Everything on this card used to be under 12px —
                              code 10.5, name 11.5, size chips 10, actions 11 —
                              on the surface the marketing says vendors run from
                              a phone. Nothing here is below 12 now, and the
                              action row is a 40px-tall target rather than 20. */}
                          {g.itemCode && (
                            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: ".06em", color: "var(--stone)", marginBottom: 3 }}>{g.itemCode}</div>
                          )}
                          <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: ".02em", marginBottom: 4 }}>{g.name}</div>
                          {g.sizes.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0 6px" }}>
                              {g.sizes.map((s) => (
                                <span key={s} style={{ fontSize: 12, fontWeight: 500, color: "var(--stone)", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)", padding: "2px 7px" }}>{s}</span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "var(--ink)", fontWeight: 600, fontSize: 14.5 }}>{npr(g.price)}</span>
                            <span style={{ display: "flex", gap: 2 }}>
                              <button className="ph-btn" onClick={() => setEditing(g)} style={cardAction}>
                                Edit
                              </button>
                              <button className="ph-btn" title={"QR code for " + g.name} onClick={() => setQrGarment(g)} style={cardAction}>
                                QR
                              </button>
                              {/* Labelled with the ACTION, not the state. A
                                  button reading "In stock" that makes the piece
                                  out of stock is a button whose label is a lie
                                  the moment you believe it. aria-pressed carries
                                  the state for anyone who needs it announced. */}
                              <button className="ph-btn" onClick={() => toggleStock(g.id)}
                                aria-pressed={!g.inStock}
                                title={g.inStock ? "Mark out of stock" : "Mark back in stock"}
                                style={{ ...cardAction, color: g.inStock ? "var(--stone)" : "var(--warn)" }}>
                                {g.inStock ? "Mark sold out" : "Restock"}
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

          {/* Fabrics and cuts are the two halves of one job — a bolt is only
              worth listing once there is a cut to stitch it into, and the
              fabric card's "Cuts" button already crossed between them — so
              they share a tab and a family filter, and the switch below picks
              the half. Two top-level tabs for this was two names for one
              workspace. */}
          {tab === "fabrics" && (
            <div className="fade-up">
              <div className="cat-bar">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                  <div className="subtabs">
                    <button className={fabricView === "bolts" ? "on" : ""}
                      aria-pressed={fabricView === "bolts"}
                      onClick={() => setFabricView("bolts")}>Bolts</button>
                    <button className={fabricView === "cuts" ? "on" : ""}
                      aria-pressed={fabricView === "cuts"}
                      onClick={() => setFabricView("cuts")}>Cuts</button>
                  </div>
                  <span style={{ color: "var(--stone)", fontSize: 13 }}>
                    {fabricView === "bolts"
                      ? `${fabrics.length} fabric${fabrics.length !== 1 ? "s" : ""}`
                      : `${visibleCuts.length} cut${visibleCuts.length !== 1 ? "s" : ""}${yourCutCount > 0 ? ` · ${yourCutCount} yours` : ""}`}
                  </span>
                </div>
                <div className="cat-tools">
                  <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}
                    aria-label={fabricView === "bolts" ? "Filter fabrics by family" : "Filter cuts by family"}
                    className="ph-select" style={{ padding: "10px 12px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", backgroundColor: "var(--card)", fontSize: 13 }}>
                    <option>All</option>
                    {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {fabricView === "bolts" ? (
                    <button className="ph-btn btn-solid cat-add" style={{ padding: "11px 20px", fontSize: 12 }} onClick={() => setShowFabricForm(true)}>
                      + add fabric
                    </button>
                  ) : (
                    <button className="ph-btn btn-solid cat-add" style={{ padding: "11px 20px", fontSize: 12 }}
                      onClick={() => setCutForm({ mode: "new" })}>
                      + add your own cut
                    </button>
                  )}
                </div>
              </div>

              {fabricView === "bolts" && (visibleFabrics.length === 0 ? (
                <div style={{ textAlign: "center", padding: "54px 20px", color: "var(--stone)" }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    {fabrics.length > 0 ? "No fabrics in that family." : "No fabrics yet."}
                  </div>
                  <div style={{ fontSize: 12.5, marginBottom: 18, lineHeight: 1.6 }}>
                    Photograph each bolt flat and well-lit — the weave and colour are what
                    the stitched preview is built from.
                  </div>
                  <button className="ph-btn btn-solid" style={{ padding: "11px 22px", fontSize: 12 }}
                    onClick={() => setShowFabricForm(true)}>+ add fabric</button>
                </div>
              ) : (
                <div className="card-grid">
                  {visibleFabrics.map((f) => (
                    <div key={f.id} className="fade-up" style={{ background: "var(--card)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)" }}>
                      <div style={{ aspectRatio: "4/3", position: "relative", background: "var(--paper-deep)" }}>
                        <button onClick={() => setEditingFabric(f)} title={"Edit " + f.name}
                          style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                          <img src={f.image} alt={f.name} className={"img-blend" + (f.inStock ? "" : " oos-img")} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </button>
                        <span style={{ position: "absolute", top: 10, left: 10, background: "var(--card)", color: "var(--ink)", fontSize: 10, fontWeight: 600, letterSpacing: ".1em", padding: "4px 10px", borderRadius: "var(--radius-xs)" }}>
                          {familyLabel(f.family)}
                        </span>
                        {(compCount.get(f.id) ?? 0) > 0 && (
                          <span style={{ position: "absolute", top: 10, right: 10, background: "var(--stage-veil)", color: "var(--on-slab)", fontSize: 10, padding: "4px 8px", borderRadius: "var(--radius-xs)" }}>
                            {compCount.get(f.id)} cut{compCount.get(f.id) !== 1 ? "s" : ""}
                          </span>
                        )}
                        {!f.inStock && (
                          <span style={{ position: "absolute", bottom: 10, left: 10, background: "var(--ink)", color: "var(--card)", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", padding: "4px 9px", borderRadius: "var(--radius-xs)" }}>
                            Out of stock
                          </span>
                        )}
                      </div>
                      <div style={{ padding: "13px 14px 14px" }}>
                        {f.itemCode && (
                          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: ".06em", color: "var(--stone)", marginBottom: 3 }}>{f.itemCode}</div>
                        )}
                        <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: ".02em", marginBottom: 4 }}>{f.name}</div>
                        {(f.composition || f.color) && (
                          <div style={{ fontSize: 12.5, color: "var(--stone)", marginBottom: 5 }}>
                            {[f.composition, f.color].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>{fabricPrice(f.price, f.unit)}</span>
                          <span style={{ display: "flex", gap: 2 }}>
                            <button className="ph-btn" onClick={() => setStudioFabricId(f.id)} style={{ ...cardAction, fontWeight: 700 }}>
                              Cuts
                            </button>
                            <button className="ph-btn" onClick={() => setEditingFabric(f)} style={cardAction}>
                              Edit
                            </button>
                            <button className="ph-btn" onClick={() => toggleFabricStock(f.id)}
                              aria-pressed={!f.inStock}
                              title={f.inStock ? "Mark out of stock" : "Mark back in stock"}
                              style={{ ...cardAction, color: f.inStock ? "var(--stone)" : "var(--warn)" }}>
                              {f.inStock ? "Mark sold out" : "Restock"}
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {fabricView === "cuts" && (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--stone)", margin: "-2px 0 18px", lineHeight: 1.65 }}>
                    Every cut a cloth can be stitched into. Library cuts come with peeq and are
                    shared by every shop; cuts marked yours belong to your shop alone, and only
                    you can change them.
                  </div>

                  {visibleCuts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "54px 20px", color: "var(--stone)" }}>
                      <div style={{ fontSize: 14, marginBottom: 18 }}>No cuts in that family yet.</div>
                      <button className="ph-btn btn-solid" style={{ padding: "11px 22px", fontSize: 12 }}
                        onClick={() => setCutForm({ mode: "new" })}>+ add your own cut</button>
                    </div>
                  ) : (
                    FAMILIES.filter((f) => familyFilter === "All" || f.id === familyFilter).map((f) => {
                      const familyCuts = visibleCuts.filter((s) => s.family === f.id);
                      if (familyCuts.length === 0) return null;
                      /* Two different shapes of card, so two rows: putting a tall
                         wireframe next to a three-line description in one grid
                         leaves the text cards mostly white space. */
                      const withImage = familyCuts.filter((c) => c.refImage);
                      const textOnly = familyCuts.filter((c) => !c.refImage);
                      const edit = (c: Style) => setCutForm({ mode: c.shopId ? "edit" : "copy", style: c });
                      return (
                        <div key={f.id} style={{ marginBottom: 30 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 10 }}>
                            <span className="ph-display" style={{ fontSize: 16, color: "var(--ink)" }}>{f.label.toLowerCase()}</span>
                            <span style={{ fontSize: 11.5, color: "var(--stone)" }}>{familyCuts.length}</span>
                          </div>
                          {withImage.length > 0 && (
                            <div className="card-grid" style={{ marginBottom: textOnly.length ? 12 : 0 }}>
                              {withImage.map((c) => <CutCard key={c.id} cut={c} onEdit={() => edit(c)} />)}
                            </div>
                          )}
                          {textOnly.length > 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                              {textOnly.map((c) => <TextCutCard key={c.id} cut={c} onEdit={() => edit(c)} />)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          )}

          {tab === "plan" && (
            <div className="fade-up">
              <PlanTab shop={shop} />
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
      {showFabricForm && (
        <FabricModal onClose={() => setShowFabricForm(false)}
          onSave={(f) => { addFabric(f); setShowFabricForm(false); }} />
      )}
      {editingFabric && (
        <FabricModal
          initial={editingFabric}
          onClose={() => setEditingFabric(null)}
          onSave={(f) => { editFabric({ ...editingFabric, ...f }); setEditingFabric(null); }}
          onRemove={() => { removeFabric(editingFabric.id); setEditingFabric(null); }}
        />
      )}
      {studioFabric && (
        <FabricStudio
          fabric={studioFabric}
          styles={styles}
          compositions={compositions.filter((c) => c.fabricId === studioFabric.id)}
          onClose={() => setStudioFabricId(null)}
          onCompose={(styleIds) => composeFabric(studioFabric.id, styleIds)}
          onCreateStyle={createStyle}
          onUpdateStyle={updateStyle}
          onPublish={publishComposition}
          onPrice={priceComposition}
          onNote={noteComposition}
          onCorrect={correctComposition}
          onFixColor={fixFabricColor}
          onRephoto={(mode) => {
            setPhotoFix({ fabricId: studioFabric.id, mode });
            setStudioFabricId(null);
          }}
          composing={composing}
          onRemove={removeComposition}
        />
      )}
      {photoFix && photoFixFabric && (
        <FabricModal
          initial={photoFixFabric}
          photoIntent={photoFix.mode}
          onClose={() => { setStudioFabricId(photoFix.fabricId); setPhotoFix(null); }}
          onSave={(f) => {
            editFabric({ ...photoFixFabric, ...f });
            setStudioFabricId(photoFix.fabricId);
            setPhotoFix(null);
          }}
        />
      )}
      {cutForm && (
        <CutModal
          family={cutForm.style?.family ?? FAMILIES[0].id}
          pickFamily={cutForm.mode === "new"}
          mode={cutForm.mode}
          initial={cutForm.style}
          onClose={() => setCutForm(null)}
          onSave={async (s) => {
            /* A copy saves as a new shop cut — the library one every other
               shop sees stays untouched. */
            if (cutForm.mode === "edit" && cutForm.style) {
              await updateStyle({ ...cutForm.style, ...s });
            } else {
              await createStyle(s);
            }
            setCutForm(null);
          }}
        />
      )}
      {/* Full-screen rather than a centred modal: the counter is three photo
          uploads and a fitting to study, which is a screen's worth of work —
          and it keeps the room it had as a tab. closeOnBackdrop is off because
          by step three there are three uploaded photographs in here, and a
          stray tap on the edge would bin all of them. */}
      {showCounter && (
        <Dialog variant="full" hideHeader closeOnBackdrop={false}
          ariaLabel="At the counter" onClose={() => setShowCounter(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px min(26px, 4vw)", background: "var(--card)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <div>
              <span className="ph-display" style={{ fontSize: 20, color: "var(--ink)" }}>at the counter</span>
              <span style={{ fontSize: 12, color: "var(--stone)", marginLeft: 10 }}>one cloth, one customer, right now</span>
            </div>
            <button className="ph-btn" onClick={() => setShowCounter(false)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "8px 14px" }}>
              <Icon name="close" /> close
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px min(26px, 4vw) 44px" }}>
            <div style={{ maxWidth: 1080, margin: "0 auto" }}>
              <CounterTryOn onRun={runCounter} onKeep={keepCounterRun} enabled={counterEnabled}
                styles={styles} fabrics={fabrics} onAddGarment={addGarment} />
            </div>
          </div>
        </Dialog>
      )}
      {showTagSheet && (
        <TagSheetModal
          catalog={catalog}
          urlFor={(g) => origin + kioskPath + "?g=" + encodeURIComponent(g.id)}
          onClose={() => setShowTagSheet(false)}
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

/* ── cuts on the designs tab ──
   A cut is words first and a picture second (see style-library.ts), so it gets
   two card shapes: one led by the reference photo, and a compact text card for
   cuts that are only words. They never share a grid row — a tall wireframe
   next to a three-line description leaves the text card mostly empty. */

const cutOwnerChip = (mine: boolean): React.CSSProperties => ({
  fontSize: 9.5, fontWeight: 600, letterSpacing: ".09em", padding: "3px 8px",
  borderRadius: "var(--radius-xs)", whiteSpace: "nowrap",
  background: mine ? "var(--ink)" : "var(--paper-deep)",
  color: mine ? "var(--card)" : "var(--stone)",
});

const cutCoverageChip: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 600, letterSpacing: ".09em", padding: "3px 8px",
  borderRadius: "var(--radius-xs)", textTransform: "uppercase", whiteSpace: "nowrap",
  background: "var(--paper)", color: "var(--ink)",
};

function CutEditButton({ mine, onEdit }: { mine: boolean; onEdit: () => void }) {
  return (
    <button className="ph-btn" onClick={onEdit}
      title={mine ? "Change this cut" : "Library cut — take a copy you can change"}
      style={{ color: "var(--ink)", fontSize: 11, padding: "4px 5px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon name={mine ? "edit" : "copy"} /> {mine ? "Edit" : "Make it your own"}
    </button>
  );
}

function CutCard({ cut, onEdit }: { cut: Style; onEdit: () => void }) {
  const mine = !!cut.shopId;
  const cov = COVERAGES.find((x) => x.id === cut.coverage);
  return (
    <div className="fade-up" style={{ background: "var(--card)", borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
      {/* The image is absolutely placed so a tall wireframe scales down into
          the frame instead of stretching the card (and the whole grid row). */}
      <div style={{ aspectRatio: "3/4", position: "relative", background: "var(--paper-deep)", overflow: "hidden" }}>
        <img src={cut.refImage ?? undefined} alt={cut.name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: 10, boxSizing: "border-box" }} />
        {cov && (
          <span style={{ ...cutCoverageChip, position: "absolute", top: 10, left: 10, background: "var(--card)" }}>
            {cov.label}
          </span>
        )}
        {/* both branches sit on a photo, so both stay dark in either theme —
            --ink here would have flipped pale under --card text */}
        <span style={{ ...cutOwnerChip(mine), position: "absolute", top: 10, right: 10, background: mine ? "var(--stage)" : "var(--stage-veil)", color: "var(--on-slab)" }}>
          {mine ? "YOURS" : "peeq library"}
        </span>
      </div>
      <div style={{ padding: "11px 13px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontWeight: 500, fontSize: 11.5, letterSpacing: ".12em" }}>{cut.name}</div>
        {cut.hint && (
          <div style={{ fontSize: 11, color: "var(--stone)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {cut.hint}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto", paddingTop: 3 }}>
          <CutEditButton mine={mine} onEdit={onEdit} />
        </div>
      </div>
    </div>
  );
}

/* Text-only cut: the chips sit in flow above the words, never over them. */
function TextCutCard({ cut, onEdit }: { cut: Style; onEdit: () => void }) {
  const mine = !!cut.shopId;
  const cov = COVERAGES.find((x) => x.id === cut.coverage);
  return (
    <div className="fade-up" style={{ background: "var(--card)", borderRadius: "var(--radius-card)", border: "1px solid var(--line)", padding: "13px 14px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {cov && <span style={cutCoverageChip}>{cov.label}</span>}
        <span style={cutOwnerChip(mine)}>{mine ? "YOURS" : "peeq library"}</span>
      </div>
      <div style={{ fontWeight: 500, fontSize: 12, letterSpacing: ".1em" }}>{cut.name}</div>
      {cut.hint && (
        <div style={{ fontSize: 11.5, color: "var(--stone)", fontStyle: "italic", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          “{cut.hint}”
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto" }}>
        <CutEditButton mine={mine} onEdit={onEdit} />
      </div>
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
          <input value={name} maxLength={60} placeholder="e.g. Juju Fashion House" onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </label>
        <label className="field">Area / city
          <input value={area} maxLength={80} placeholder="e.g. New Road, Kathmandu" onChange={(e) => { setArea(e.target.value); setSaved(false); }} />
        </label>
        {/* Same label and the same "optional" as Onboarding. The two screens
            showed the same control under two different names, so a vendor who
            skipped it during setup had to work out that this was the thing
            they skipped. */}
        <div className="field">Pin your shop on the map
          <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)", margin: "2px 0 8px", display: "block" }}>
            Optional — shoppers see this pin on the peeq map and your storefront. Tap the map or drag the dot.
          </span>
          <LocationPicker lat={pin.lat} lng={pin.lng} onChange={(lat, lng) => { setPin({ lat, lng }); setSaved(false); }} />
        </div>
        <label className="field">WhatsApp number (orders)
          <input value={whatsapp} maxLength={20} placeholder="e.g. 9779841000000" inputMode="tel"
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
        {shop.vendorCode && (
          <div className="field">Vendor code
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, letterSpacing: ".1em", color: "var(--ink)" }}>{shop.vendorCode}</span>
              <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "var(--stone)" }}>
                Every item you add is numbered {shop.vendorCode}-0001, {shop.vendorCode}-0002, and so on. This code is fixed — unlike your kiosk link, it can never change, so printed tags stay valid forever.
              </span>
            </div>
          </div>
        )}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
          <input type="checkbox" checked={listed} style={{ marginTop: 3, accentColor: "var(--ink)" }}
            onChange={(e) => { setListed(e.target.checked); setSaved(false); }} />
          <span>
            Show my shop on the peeq landing page
            <span style={{ display: "block", fontSize: 12, color: "var(--stone)" }}>
              Shoppers can find and browse your storefront and kiosk.
            </span>
          </span>
        </label>
        <button className="ph-btn btn-solid" disabled={!dirty}
          onClick={() => { updateShop({ ...shop, name, area, whatsapp, listed, lat: pin.lat, lng: pin.lng }); setSaved(true); }}
          style={{ alignSelf: "flex-start", marginTop: 6, opacity: dirty ? 1 : 0.55 }}>
          {saved && !dirty ? <>saved <Icon name="check" /></> : "save changes"}
        </button>
      </div>
    </div>
  );
}

function LinkBox({ url, children }: { url: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <code style={{ padding: "11px 13px", borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", fontSize: 13, background: "var(--card)", color: "var(--ink)", flex: 1, minWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>
        {url}
      </code>
      <button className="ph-btn"
        onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{ background: "var(--ink)", color: "var(--card)", padding: "11px 16px", fontSize: 11, letterSpacing: ".1em" }}>
        {copied ? <>copied <Icon name="check" /></> : "copy"}
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
        style={{ color: "var(--stone)", padding: "10px 8px", fontSize: 11, letterSpacing: ".1em" }}>
        Edit
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>/k/</span>
        <input value={draft} autoFocus maxLength={40}
          onChange={(e) => { setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40)); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          style={{ padding: "10px 13px", borderRadius: "var(--radius-btn)", border: "1px solid " + (valid ? "var(--line)" : "var(--danger)"), fontSize: 14, letterSpacing: 0, textTransform: "none", fontWeight: 400, width: 180, background: "var(--card)" }} />
        <button className="ph-btn" disabled={!valid || busy} onClick={save}
          style={{ background: valid ? "var(--ink)" : "var(--line)", color: valid ? "var(--card)" : "var(--stone)", padding: "10px 14px", fontSize: 11, letterSpacing: ".1em" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="ph-btn" onClick={() => { setEditing(false); setDraft(slug); setError(""); }}
          style={{ color: "var(--stone)", padding: "10px 8px", fontSize: 11, letterSpacing: ".1em" }}>cancel</button>
      </div>
      <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none", fontSize: 12, color: error ? "var(--danger)" : "var(--stone)" }}>
        {error || "Lowercase letters, numbers and dashes. Changing this breaks QR codes you've already printed."}
      </span>
    </div>
  );
}

function EmptyState({ onAdd, anyItems }: { onAdd: () => void; anyItems: boolean }) {
  return (
    <div style={{ border: "1.5px dashed var(--line)", borderRadius: "var(--radius-modal)", padding: "60px 24px", textAlign: "center", background: "var(--card)" }}>
      <div className="ph-display" style={{ fontSize: 22, marginBottom: 8, color: "var(--ink)" }}>
        {anyItems ? "Nothing in this category yet" : "No garments yet"}
      </div>
      <p style={{ color: "var(--stone)", maxWidth: 420, margin: "0 auto 20px", fontSize: 14, lineHeight: 1.6 }}>
        Photograph each garment flat or on a mannequin against a plain wall, then add it here. Clean photos give the best try-on results.
      </p>
      <button className="ph-btn btn-solid" onClick={onAdd}>+ add your first garment</button>
    </div>
  );
}

function GarmentModal({ initial, onClose, onSave, onRemove }: {
  initial?: Garment;
  onClose: () => void;
  onSave: (g: Omit<Garment, "id" | "itemCode">) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? CATEGORIES[0]);
  const [price, setPrice] = useState(initial ? String(initial.price || "") : "");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [sizes, setSizes] = useState<string[]>(initial?.sizes ?? []);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [cropping, setCropping] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setCropping(await fileToDataURL(file)); }
    catch { toastErr("Could not read that image. Try a JPG or PNG."); }
    setBusy(false);
  };

  const toggleSize = (s: string) =>
    setSizes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  /* Price is required. It used to be absent from canSave, so a vendor who
     tabbed past it saved a garment priced at 0 — which the storefront then
     showed as "Rs 0" to every shopper, with nothing anywhere saying so. */
  const priceNum = Number(price || 0);
  const missing = [
    !name.trim() && "a name",
    !image && "a photo",
    !(priceNum > 0) && "a price",
  ].filter(Boolean) as string[];
  const canSave = missing.length === 0 && !busy;
  /* backgroundColor, not the `background` shorthand: the shorthand resets
     background-image, and that's where the select's own chevron lives. */
  const input: React.CSSProperties = { width: "100%", padding: "12px 13px", borderRadius: "var(--radius-field)", border: "1px solid var(--line)", fontSize: 15, backgroundColor: "var(--card)", color: "var(--ink)" };
  const dirty = initial
    ? name !== initial.name || category !== initial.category || String(initial.price || "") !== price
      || image !== initial.image || sizes.join() !== initial.sizes.join()
    : Boolean(name.trim() || image || price || sizes.length);

  return (
    <Dialog onClose={onClose} title={initial ? "edit garment" : "add a garment"} hideHeader
      width={400} dirty={dirty}
      dirtyMessage="This garment isn't saved yet. Discard what you've filled in?"
      panelStyle={{ padding: "28px 26px" }}>
      <div className="ph-display" style={{ fontSize: 24, color: "var(--ink)", marginBottom: 18 }}>
        {initial ? "edit garment" : "add a garment"}
      </div>

      {/* a button, not a div: this is the field the whole form depends on */}
      <button type="button" onClick={() => fileRef.current?.click()}
        aria-label={image ? "Change the garment photo" : "Upload a garment photo"}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        style={{ width: "100%", border: "1.5px dashed " + (image ? "var(--ink)" : "var(--line)"), borderRadius: "var(--radius-lg)", height: 190, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden", background: "var(--paper)", color: "var(--stone)", fontSize: 14, textAlign: "center", lineHeight: 1.6 }}>
        {busy ? <span>Processing photo…</span>
          : image ? <img src={image} alt="Garment preview" style={{ height: "100%", objectFit: "contain" }} />
          : <div style={{ padding: 12 }}>Tap to upload a garment photo<br /><span style={{ fontSize: 12 }}>Flat-lay or mannequin, plain background</span></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />

      {/* Real labels. Every field here was placeholder-only, so the moment a
          vendor typed anything the form became six unlabelled boxes. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field"><span>Garment name <span className="req">*</span></span>
          <input style={input} value={name} maxLength={80} data-autofocus
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Red Banarasi Silk Sari" />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}><span>Price (NPR) <span className="req">*</span></span>
            <input style={{ ...input, borderColor: touched && !(priceNum > 0) ? "var(--danger)" : "var(--line)" }}
              value={price} maxLength={8} inputMode="numeric"
              aria-invalid={touched && !(priceNum > 0)}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder="2500" />
          </label>
        </div>
        <div className="field">Available sizes (optional)
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
            {SIZES.map((s) => (
              <button key={s} type="button" className="ph-btn" onClick={() => toggleSize(s)}
                aria-pressed={sizes.includes(s)}
                style={{
                  padding: "9px 15px", fontSize: 13, borderRadius: "var(--radius-btn)", fontWeight: 600,
                  background: sizes.includes(s) ? "var(--ink)" : "var(--paper)",
                  color: sizes.includes(s) ? "var(--card)" : "var(--stone)",
                  border: "1px solid " + (sizes.includes(s) ? "var(--ink)" : "var(--line)"),
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Say what is missing. The save button used to just sit there greyed
          out with no explanation anywhere on the form. */}
      {missing.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--stone)" }}>
          Still needs {andList(missing)}.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="ph-btn" onClick={onClose}
          style={{ flex: 1, color: "var(--ink)", padding: 13, fontSize: 13, letterSpacing: ".06em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 600 }}>cancel</button>
        <button className="ph-btn" aria-disabled={!canSave}
          onClick={() => {
            setTouched(true);
            if (!canSave) return;
            onSave({
              name: name.trim(), category, price: priceNum, image: image!,
              sizes,
              inStock: initial?.inStock ?? true,
              tryonEnabled: initial?.tryonEnabled ?? true,
              stitchedToOrder: initial?.stitchedToOrder ?? false,
            });
          }}
          style={{ flex: 2, background: canSave ? "var(--ink)" : "var(--line)", color: canSave ? "var(--card)" : "var(--stone)", padding: 13, fontSize: 13, letterSpacing: ".06em", borderRadius: "var(--radius-btn)", fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed" }}>
          {initial ? "save changes" : "save to catalog"}
        </button>
      </div>
      {cropping && (
        <ImageCropper src={cropping} title="Crop the photo"
          hint="Keep the garment and leave the room out — this is the picture shoppers see, and the one try-on puts on them."
          onCancel={() => setCropping(null)}
          onDone={(dataUrl) => { setCropping(null); setImage(dataUrl); }} />
      )}
      {initial && onRemove && (
        <button className="ph-btn"
          onClick={async () => {
            const ok = await confirmAsync({
              title: "Remove this garment?",
              body: "“" + initial.name + "” will be removed from your catalog and storefront. Printed QR tags for it stop working.",
              confirmLabel: "Remove", destructive: true,
            });
            if (ok) onRemove();
          }}
          style={{ width: "100%", marginTop: 12, color: "var(--danger)", fontSize: 13, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
          Remove from catalog
        </button>
      )}
    </Dialog>
  );
}

/** "a main colour, a second colour and any extra detail" */
const andList = (xs: string[]): string =>
  xs.join(", ").replace(/, ([^,]*)$/, " and $1");

/* ── the colours, read off the photo and shown — and now correctable here ──

   This started as a readout on purpose. The argument was that a vendor on this
   form has nothing to judge the reading against except the photo it was
   measured from, the two agree by construction, and so any "correction" made
   here would be the measurement wearing the shop's name — which is exactly what
   `colorsCorrected` exists to keep out of the render prompt.

   The flaw in that was assuming the photo is all the vendor has. They are
   standing at the counter with the bolt in their hands. A maroon shot under a
   tube light reads orange in this list and they can see that from where they
   are sitting, and making them list the bolt, stitch a cut, wait on a render
   and only then be allowed to say "it's maroon" was several minutes of the
   app's time spent not believing them.

   So the chips stay the resting state — most readings are right, and a form
   that opens six controls for a question already answered is a worse form —
   and one tap opens the list underneath them, with the wheel, the palette and
   the photo to sample from. An edit here is the shop's word, and it sets
   `colorsCorrected` the same way one made in the studio does. */
function ColorReadout({ reading, colors, onChange, corrected, image, onRecrop }: {
  reading: ColorReading | null;
  colors: FabricColor[];
  onChange: (colors: FabricColor[]) => void;
  /** These are the shop's own rather than the photo's — set here or in the
      studio, either way the render follows them over the picture. */
  corrected: boolean;
  /** The fabric's own photo, so the picker has something to sample from. */
  image: string | null;
  /** The other thing a vendor can do about these colours, and the one this
      form doesn't otherwise offer. The reading is taken from the middle of the
      frame, so counter, shelf or shopping bag left in the crop is counter
      measured as cloth — and the fix is a tighter crop, not a new photo. (A
      new photo is already one tap away: the picture at the top of this form is
      itself the button for that.) */
  onRecrop: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const dot = (fill: string) => (
    <span aria-hidden style={{
      width: 14, height: 14, borderRadius: "50%", background: fill,
      border: "1px solid var(--line-strong)", flexShrink: 0,
    }} />
  );

  /* Only ever a caveat about what a photo genuinely cannot settle, and only
     while the reading is all we have. Once the vendor has corrected the
     colours themselves, the photo's doubts about itself are beside the
     point. */
  const doubt = !corrected && reading?.reason ? reading.reason : null;

  return (
    <div className="field">
      {/* Label left, the way out right. Sitting on the label's own line rather
          than under the swatches because it belongs to the whole readout: it
          is the answer to "these are wrong" for the one cause the vendor can't
          fix by dragging a wheel — a crop with the counter still in it, which
          gets averaged into the cloth's colours like any other pixels.

          Nothing to re-crop before a photo exists, so it waits for one. */}
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        Colours
        {image && (
          <button type="button" className="ph-btn" onClick={onRecrop}
            title="Crop this photo tighter — anything but cloth in the frame is measured as cloth"
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3, padding: "4px 2px", minHeight: 28 }}>
            re-crop
          </button>
        )}
      </span>

      {editing || colors.length === 0 ? (
        <>
          <ColorList colors={colors} onChange={onChange} image={image} />
          <span className="hint">
            {colors.length === 0
              ? reading
                ? "We couldn't pick colours out of this photo — set them yourself, or leave them and the previews will go on the photo alone."
                : "Read off the photo when you add one, or set them yourself now."
              : "Tap a swatch for the wheel, and set roughly how much of the cloth each colour covers — a border is a small share, not half the garment."}
          </span>
        </>
      ) : (
        <>
          {/* The chips are the button. A separate "edit" link beside them would
              be the smaller target and the less obvious one: the thing the
              vendor wants to change is right there, and on a phone it is what
              their thumb goes to anyway. */}
          <button type="button" onClick={() => setEditing(true)}
            aria-label="Change these colours and their shares"
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14, fontWeight: 400, color: "var(--ink)", minHeight: 24, background: "none", border: "none", padding: "2px 0", margin: 0, textAlign: "left", cursor: "pointer" }}>
            {colors.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {dot(c.hex || colorHex(c.id) || "var(--line)")}
                {colorLabel(c.id)}
                <span style={{ color: "var(--stone)", fontSize: 12.5 }}>{Math.round(c.share * 100)}%</span>
              </span>
            ))}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              change
            </span>
          </button>
          <span className="hint">
            {corrected
              ? "Set by you — the previews follow these over the photo."
              : "Measured from the photo. If the light has shifted them, correct them here against the cloth in your hands — the previews will follow your words instead."}
          </span>
        </>
      )}

      {doubt && (
        <span className="hint" style={{ color: "var(--warn)" }}>{doubt}</span>
      )}
    </div>
  );
}

/* ── Fabric modal ──
   Deliberately not a GarmentModal variant. A fabric has no sizes (it's cut to
   the person) and no category, but it does have a family, a unit, and a weave
   — and price without a unit is meaningless on a bolt. Sharing one component
   would mean a prop soup of mutually-exclusive fields. */
function FabricModal({ initial, onClose, onSave, onRemove, photoIntent }: {
  initial?: Fabric;
  onClose: () => void;
  onSave: (f: Omit<Fabric, "id" | "itemCode">) => void;
  onRemove?: () => void;
  /** Opened from the studio because the picture is what's wrong. "crop" goes
      straight into the cropper on the photo that's already there; "replace"
      opens here with the photo called out, and the vendor taps it themselves —
      a file dialog fired on mount has no user gesture behind it and browsers
      are right to block it. */
  photoIntent?: "replace" | "crop";
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [family, setFamily] = useState<StyleFamily>(initial?.family ?? FAMILIES[0].id);
  const [price, setPrice] = useState(initial ? String(initial.price || "") : "");
  const [unit, setUnit] = useState<Fabric["unit"]>(initial?.unit ?? "meter");
  const [composition, setComposition] = useState(initial?.composition ?? "");
  const [colors, setColors] = useState<FabricColor[]>(initial?.colors ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [touched, setTouched] = useState(false);
  /* Open from the start when there's already something in there — a bolt whose
     colours and weave are filled in shouldn't hide them behind a closed panel
     the vendor has to discover before they can edit them. */
  const [showOptional, setShowOptional] = useState(
    Boolean(initial && (initial.composition || initial.colors.length || initial.note))
  );
  /** What the photo says about its own colours. Drives the question the
      colours section leads with; never applied without an answer. */
  const [reading, setReading] = useState<ColorReading | null>(null);
  /* Whether the colours below came from a person or from the pixels, which is
     the whole of what `colorsCorrected` means. A reading applied on open is the
     app measuring its own photo; a vendor moving the wheel is the shop saying
     what the cloth is, and only the second may outrank the sample image in the
     render prompt. Tracked as a gesture rather than by diffing against the
     reading, because setting a colour back to exactly what was measured is
     still the vendor vouching for it. */
  const [colorsTouched, setColorsTouched] = useState(false);

  /* The photo goes through the cropper before it becomes the fabric's image.
     It matters more here than anywhere else in the app: this picture is the
     one the render model is told to stitch from and the one the colour reader
     measures, so counter and background in the frame are counter and
     background in the catalog. */
  const [cropping, setCropping] = useState<string | null>(
    photoIntent === "crop" && initial?.image ? initial.image : null
  );
  /* The in-app camera, offered beside the file input rather than replacing
     it. What it adds over the OS camera is exactly the two things this photo
     is downstream of: white balance set off a tapped sheet of paper instead
     of the phone's guess, and manual camera controls that unlock only under
     light good enough to deserve them. */
  const [proShot, setProShot] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { setCropping(await fileToDataURL(file)); }
    catch { toastErr("Could not read that image. Try a JPG or PNG."); }
    setBusy(false);
  };

  const acceptCrop = async (dataUrl: string) => {
    setCropping(null);
    setImage(dataUrl);
    /* Reading it costs nothing — it's a canvas, not a model — so it never
       gates the upload; a failed read simply comes back empty. Applied rather
       than offered: a new photo is a new measurement, and it replaces whatever
       the old one said about a cloth that is being re-photographed. Any
       correction made against the old photo goes with it — updateFabric clears
       colors_corrected whenever the picture changes. */
    const r = await readFabricColors(dataUrl);
    setReading(r);
    /* Only when there is something to replace them with. A read that comes
       back empty knows nothing about this cloth, and writing it in anyway would
       clear a set of colours — possibly ones the vendor typed by hand — on the
       strength of a canvas that failed. That matters more now that re-cropping
       is a button next to the colours rather than a trip through the studio:
       the vendor tightening a crop is not asking to lose their maroon. */
    if (r.colors.length) {
      setColors(r.colors.map((c) => ({ id: c.id, hex: c.hex, share: c.share })));
      setColorsTouched(false);
    }
  };

  /* A bolt listed before colours existed gets read the moment it's opened —
     otherwise every fabric already in a shop's catalog stays colourless
     forever and nothing downstream ever benefits. Only when it's genuinely
     blank: a bolt whose colours are set, and especially one the vendor has
     corrected against a render, is never re-measured behind their back. */
  const [readApplied, setReadApplied] = useState(false);
  useEffect(() => {
    if (!initial?.image || initial.colors.length) return;
    let live = true;
    readFabricColors(initial.image).then((r) => {
      if (!live) return;
      setReading(r);
      if (r.colors.length) {
        setColors(r.colors.map((c) => ({ id: c.id, hex: c.hex, share: c.share })));
        setReadApplied(true);
      }
    });
    return () => { live = false; };
  }, [initial?.image, initial?.colors.length]);

  const priceNum = Number(price || 0);
  const missing = [
    !name.trim() && "a name",
    !image && "a photo",
    !(priceNum > 0) && "a price",
  ].filter(Boolean) as string[];
  /* Optional, but the part a photo can't say — so a blank one is worth one
     question on the way out, not a blocked save. A vendor with a queue at the
     counter always gets the bolt listed.

     Colours are not on this list any more. They're measured rather than typed,
     so there is nothing here for the vendor to have skipped, and a warning
     about a field they cannot fill in is a warning that teaches them to click
     through the next one. */
  const soft = [!note.trim() && "any extra detail"].filter(Boolean) as string[];
  /* Says what's in the folded panel without opening it — otherwise "optional"
     is the only clue that a bolt's colours are set, and the vendor opens it
     every time to check. */
  const optionalSummary =
    [composition.trim(), colorText(colors), note.trim() && "a note"]
      .filter(Boolean)
      .join(" · ") || "colours, weave, detail";
  const canSave = missing.length === 0 && !busy;
  /* Colours only count as unsaved work when the vendor's own edits put them
     there. A reading applied to an old colourless bolt on open is the app's
     doing, not theirs — counting it would greet anyone who opened a legacy
     fabric and closed it again with "discard what you've filled in?", about a
     field they never touched. */
  const dirty = initial
    ? name !== initial.name || family !== initial.family || String(initial.price || "") !== price
      || unit !== initial.unit || composition !== (initial.composition ?? "")
      || ((colorsTouched || !readApplied) && JSON.stringify(colors) !== JSON.stringify(initial.colors ?? []))
      || note !== (initial.note ?? "") || image !== initial.image
    : Boolean(name.trim() || image || price || composition || note);

  const save = async () => {
    setTouched(true);
    if (!canSave) return;
    if (soft.length > 0) {
      const ok = await confirmAsync({
        title: "Save without " + andList(soft) + "?",
        /* Says what actually happens to the field rather than praising it. It
           is read straight into the prompt that generates this cloth's
           previews, so skipping it isn't leaving a form incomplete — it's
           handing the render less to work from. */
        body: "Where a border sits, how the cloth drapes, what the pattern is — we read that "
          + "alongside the photo when generating this cloth's previews, and a photo can't show "
          + "it. You can add it later, but anything stitched before then won't have used it.",
        confirmLabel: "Save anyway", cancelLabel: "Let me add it",
      });
      if (!ok) return;
    }
    onSave({
      name: name.trim(), family, image: image!,
      price: priceNum, unit,
      composition: composition.trim(),
      colors,
      /* True the moment the vendor sets a colour by hand, here or in the
         studio: both are the shop saying what the cloth is rather than the
         canvas reporting what the photo was. Otherwise carried, so fixing a
         typo in the price never demotes a correction — and cleared outright by
         updateFabric when the photo itself changes, because a correction made
         against the old picture says nothing about the new one. */
      colorsCorrected: colorsTouched || (initial?.colorsCorrected ?? false),
      color: colorText(colors),
      note: note.trim(),
      correction: initial?.correction ?? "",
      inStock: initial?.inStock ?? true,
    });
  };

  return (
    /* 430 rather than 400: the colour row carries a well, a list and a button
       side by side, and at 400 the list is narrower than the words in it. */
    <Dialog onClose={onClose} title={initial ? "edit fabric" : "add a fabric"} hideHeader
      width={430} dirty={dirty}
      dirtyMessage="This fabric isn't saved yet. Discard what you've filled in?"
      panelStyle={{ padding: "28px 26px" }}>
      <div className="ph-display" style={{ fontSize: 24, color: "var(--ink)", marginBottom: 18 }}>
        {initial ? "edit fabric" : "add a fabric"}
      </div>

      {/* Sent here from the studio by a preview whose colour came out wrong.
          The picture is the thing to change, so it's said before the vendor
          reaches the form and the box below is drawn as the thing to press. */}
      {photoIntent === "replace" && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid var(--warn)", borderRadius: "var(--radius-field)", padding: "11px 13px", marginBottom: 14, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6 }}>
          Tap the picture below to shoot or upload a new one — daylight if you can, and fill the
          frame with the weave. If the colour is what went wrong, use the pro shot with a sheet
          of white paper: it sets the white balance from the paper instead of the phone&apos;s
          guess. Everything else about this bolt stays as it is, and every preview made from the
          old photo will be marked for re-stitching.
        </div>
      )}

      <button type="button" onClick={() => fileRef.current?.click()}
        aria-label={image ? "Change the fabric photo" : "Upload a fabric photo"}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        style={{ width: "100%", border: "1.5px dashed " + (photoIntent === "replace" ? "var(--warn)" : image ? "var(--ink)" : "var(--line)"), borderRadius: "var(--radius-lg)", height: 190, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 8, overflow: "hidden", background: "var(--paper)", color: "var(--stone)", fontSize: 14, textAlign: "center", lineHeight: 1.6 }}>
        {busy ? <span>Processing photo…</span>
          : image ? <img src={image} alt="Fabric preview" style={{ height: "100%", objectFit: "contain" }} />
          : <div style={{ padding: 12 }}>Tap to upload a fabric photo<br /><span style={{ fontSize: 12 }}>Lay it flat in daylight — fill the frame with the weave</span></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
      {/* The colour-true door, next to the ordinary one. This photo is the
          single source every render and every colour reading works from, so
          it earns a camera of its own — the OS camera can't be told about
          white paper. */}
      <button type="button" className="ph-btn" onClick={() => setProShot(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 16, fontSize: 12, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", padding: "8px 13px" }}>
        <Icon name="camera" /> pro shot — true colour, off a sheet of white paper
      </button>

      {/* No inline styles on any of these: `.field input/select/textarea` in
          globals.css already gives every control on the form one padding, one
          radius and one type size. Restating them here is what let the colour
          row drift 2px out of line with every other control. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="field"><span>Fabric name <span className="req">*</span></span>
          <input value={name} maxLength={80} data-autofocus
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Navy Italian Wool" />
        </label>
        <label className="field">Stitched into
          <select value={family} onChange={(e) => setFamily(e.target.value as StyleFamily)}>
            {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field" style={{ flex: 1 }}><span>Price (NPR) <span className="req">*</span></span>
            {/* The red border comes from the aria-invalid rule, so the state a
                screen reader hears and the state the eye sees are one thing. */}
            <input value={price} maxLength={8} inputMode="numeric"
              aria-invalid={touched && !(priceNum > 0)}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder="1800" />
          </label>
          <label className="field" style={{ flex: 1 }}>Sold by
            <select value={unit} onChange={(e) => setUnit(e.target.value as Fabric["unit"])}>
              {FABRIC_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </label>
        </div>
        {/* Everything below is optional, so it folds away behind one line: a
            bolt gets listed with a photo, a name and a price, and the vendor
            with a customer waiting is not made to scroll past six fields they
            were always going to skip.

            It opens itself when the photo reading arrives, because that's a
            question about this cloth that we asked and that deserves an
            answer — hiding it behind a closed panel would be asking nobody. */}
        <details className="opt-block" open={showOptional}
          onToggle={(e) => setShowOptional(e.currentTarget.open)}>
          <summary>
            Optional customisation
            <span className="sub">{optionalSummary}</span>
          </summary>
          <div className="opt-body">
            <label className="field">Weave
              <input value={composition} maxLength={40}
                onChange={(e) => setComposition(e.target.value)} placeholder="e.g. wool 120s" />
            </label>

            {/* Measured and shown, and correctable on the spot. These words are
                what the render prompt reads, what the storefront filters on and
                what the counter finds when a customer says "the maroon one" —
                so the vendor holding the bolt gets to overrule the camera
                without waiting for a preview to prove them right. */}
            <ColorReadout reading={reading} colors={colors} image={image}
              onChange={(next) => { setColorsTouched(true); setColors(next); }}
              corrected={colorsTouched || (initial?.colorsCorrected ?? false)}
              onRecrop={() => { if (image) setCropping(image); }} />

            <label className="field">Anything else we should know?
              <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. banarasi brocade with zari buttas — gold border on one edge only, goes on the pallu" />
              <span className="hint">
                Optional, but it&apos;s the part a photo can&apos;t show — the pattern, where a
                border sits, how it drapes.
              </span>
            </label>
          </div>
        </details>
      </div>

      {missing.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--stone)" }}>
          Still needs {andList(missing)}.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="ph-btn" onClick={onClose}
          style={{ flex: 1, color: "var(--ink)", padding: 13, fontSize: 13, letterSpacing: ".06em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 600 }}>cancel</button>
        <button className="ph-btn" aria-disabled={!canSave} onClick={save}
          style={{ flex: 2, background: canSave ? "var(--ink)" : "var(--line)", color: canSave ? "var(--card)" : "var(--stone)", padding: 13, fontSize: 13, letterSpacing: ".06em", borderRadius: "var(--radius-btn)", fontWeight: 600, cursor: canSave ? "pointer" : "not-allowed" }}>
          {initial ? "save changes" : "save fabric"}
        </button>
      </div>
      {cropping && (
        <ImageCropper src={cropping} title="Keep just the cloth"
          hint="Drag the box onto the weave and leave the counter out. Everything inside it is what gets stitched from — and what we read the colour off."
          confirmLabel="use this crop"
          onCancel={() => setCropping(null)} onDone={acceptCrop} />
      )}

      {/* A pro-shot frame lands in the same cropper as an upload, so the rest
          of the pipeline — compression, the colour reading, the staleness a
          new photo triggers — never learns which camera it came from. */}
      {proShot && (
        <ProShot
          onClose={() => setProShot(false)}
          onCapture={(dataUrl) => { setProShot(false); setCropping(dataUrl); }}
          onUpload={() => { setProShot(false); fileRef.current?.click(); }} />
      )}

      {initial && onRemove && (
        <button className="ph-btn"
          onClick={async () => {
            const ok = await confirmAsync({
              title: "Remove this fabric?",
              body: "“" + initial.name + "” and its stitched previews will be removed.",
              confirmLabel: "Remove", destructive: true,
            });
            if (ok) onRemove();
          }}
          style={{ width: "100%", marginTop: 12, color: "var(--danger)", fontSize: 13, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
          Remove fabric
        </button>
      )}
    </Dialog>
  );
}

function QRModal({ garment, url, crossDevice, onClose }: { garment: Garment; url: string; crossDevice: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#1A1714", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked (http / permissions) — leave the button as-is
    }
  };

  return (
    <Dialog onClose={onClose} title="try-on QR" hideHeader width={380}
      panelStyle={{ padding: "28px 26px", textAlign: "center" }}>
      <div className="ph-display" style={{ fontSize: 24, color: "var(--ink)", marginBottom: 4 }}>try-on QR</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{garment.name}</div>
        <div style={{ fontSize: 12, color: "var(--stone)", marginBottom: 4 }}>
          Shoppers scan this on the hanger tag and try it on their own phone.
        </div>
        {qr ? (
          <img src={qr} alt={"QR code linking to try-on for " + garment.name} style={{ width: 200, height: 200, display: "block", margin: "14px auto" }} />
        ) : (
          <div style={{ width: 200, height: 200, margin: "14px auto", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--stone)", fontSize: 13 }}>
            Generating…
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0" }}>
          <a className="ph-btn" href={url} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "var(--ink)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "8px 14px", textDecoration: "none" }}>
            <Icon name="open" /> open link
          </a>
          <button className="ph-btn" onClick={copyLink}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: copied ? "var(--ink)" : "var(--ink)", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", padding: "8px 14px" }}>
            <Icon name={copied ? "check" : "copy"} /> {copied ? "copied" : "copy link"}
          </button>
        </div>
        {!crossDevice && (
          <div style={{ fontSize: 12.5, color: "var(--warn)", background: "var(--warn-bg)", borderRadius: "var(--radius-sm)", padding: "8px 12px", marginBottom: 12 }}>
            Local mode: this link only works on this device until you connect Supabase and deploy.
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ph-btn" onClick={onClose}
            style={{ flex: 1, color: "var(--ink)", padding: 13, fontSize: 13, letterSpacing: ".06em", border: "1px solid var(--line)", borderRadius: "var(--radius-btn)", fontWeight: 600 }}>close</button>
          {qr && (
            <a className="ph-btn" href={qr} download={"peeq-qr-" + garment.id + ".png"}
              style={{ flex: 2, background: "var(--ink)", color: "var(--card)", padding: 13, fontSize: 13, letterSpacing: ".06em", textDecoration: "none", borderRadius: "var(--radius-btn)", fontWeight: 600, textAlign: "center" }}>download PNG</a>
          )}
        </div>
    </Dialog>
  );
}

/* ---------- batch QR hanger-tag sheet: pick garments, print 4 tags per A4
   page (cut lines between). Uses a print window so the vendor saves it as a
   PDF from the system dialog — no PDF library needed. ---------- */
function TagSheetModal({ catalog, urlFor, onClose }: {
  catalog: Garment[];
  urlFor: (g: Garment) => string;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(catalog.map((g) => g.id)));
  const [busy, setBusy] = useState(false);
  const count = checked.size;
  const pages = Math.ceil(count / 4);

  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

  const printSheet = async () => {
    setBusy(true);
    const items = catalog.filter((g) => checked.has(g.id));
    const qrs = await Promise.all(items.map((g) =>
      QRCode.toDataURL(urlFor(g), { width: 480, margin: 1, color: { dark: "#1A1714", light: "#ffffff" } })
    ));
    const chunks: { g: Garment; qr: string }[][] = [];
    for (let i = 0; i < items.length; i += 4) {
      chunks.push(items.slice(i, i + 4).map((g, j) => ({ g, qr: qrs[i + j] })));
    }
    /* Garments created before the item-code migration, or anything made in
       localStorage mode, have no code — those still get the write-in line. */
    const tag = (x: { g: Garment; qr: string }) => `
      <div class="tag">
        <div class="row">
          <div class="left">
            <div class="wm">p<span>ee</span>q</div>
            <div class="head">KASTO DEKHCHA<br/><em>TA MALAI?</em> <span class="eyes"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg></span></div>
            <div class="scan">SCAN WITH YOUR CAMERA</div>
            <div class="waist">Use a <b>waist-up photo</b>, not a close-up selfie.</div>
          </div>
          <div class="qrwrap"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i><img src="${x.qr}" alt=""/></div>
        </div>
        <div class="foot"><span>ITEM CODE ${x.g.itemCode ? `<b class="code">${esc(x.g.itemCode)}</b>` : `<span class="line"></span>`}</span><span class="site">PEEQ.APP</span></div>
        <div class="which">${esc(x.g.name)}</div>
      </div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>peeq qr tags</title>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Baloo+2:wght@800&family=Mukta:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; }
        @page { size: A4; margin: 8mm; }
        body { font-family: 'Mukta', sans-serif; background: #fff; }
        .sheet { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; width: 100%; height: 96vh; page-break-after: always; position: relative; }
        .sheet::before, .sheet::after { content: ""; position: absolute; width: 11px; height: 11px; background: url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23b7ac9c%27 stroke-width=%271.75%27%3E%3Ccircle cx=%276%27 cy=%276%27 r=%272.5%27/%3E%3Ccircle cx=%276%27 cy=%2718%27 r=%272.5%27/%3E%3Cpath d=%27M8 7.5 19 18M19 6 8 16.5%27/%3E%3C/svg%3E") center/contain no-repeat; }
        .sheet::before { left: 50%; top: -2px; transform: translateX(-50%) rotate(90deg); }
        .sheet::after { left: -2px; top: 50%; transform: translateY(-50%); }
        .cell { padding: 7mm; border: 1px dashed #cfc6b6; }
        .tag { height: 100%; background: #FAF6F0; border: 1px solid #e6dfd1; border-radius: 14px; padding: 6mm 6mm 4mm; display: flex; flex-direction: column; }
        .row { display: flex; align-items: center; gap: 5mm; flex: 1; min-height: 0; }
        .left { flex: 1; text-align: left; }
        .wm { font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 21px; letter-spacing: -0.03em; color: #1A1714; }
        .wm span { color: #C9A94E; }
        .head { font-family: 'Anton', sans-serif; font-size: 25px; line-height: 1.05; color: #1A1714; margin-top: 2.5mm; letter-spacing: .01em; }
        .head em { font-style: normal; color: #C9A94E; }
        .eyes { font-size: 16px; }
        .qrwrap { position: relative; padding: 4mm; flex-shrink: 0; }
        .qrwrap img { width: 36mm; height: 36mm; display: block; }
        .qrwrap i { position: absolute; width: 6mm; height: 6mm; border: 1.2mm solid #C9A94E; }
        .qrwrap .c1 { top: 0; left: 0; border-right: none; border-bottom: none; border-top-left-radius: 2.5mm; }
        .qrwrap .c2 { top: 0; right: 0; border-left: none; border-bottom: none; border-top-right-radius: 2.5mm; }
        .qrwrap .c3 { bottom: 0; left: 0; border-right: none; border-top: none; border-bottom-left-radius: 2.5mm; }
        .qrwrap .c4 { bottom: 0; right: 0; border-left: none; border-top: none; border-bottom-right-radius: 2.5mm; }
        .scan { font-weight: 700; font-size: 11.5px; letter-spacing: .18em; color: #1A1714; margin-top: 3.5mm; }
        .waist { font-size: 10.5px; color: #5c564c; margin-top: 1mm; }
        .which { text-align: center; }
        .foot { width: 100%; display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid #e6dfd1; margin-top: auto; padding-top: 2.5mm; font-size: 9px; font-weight: 700; letter-spacing: .12em; color: #1A1714; }
        .foot .line { display: inline-block; width: 16mm; border-bottom: 1.5px solid #1A1714; }
        .foot .code { font-size: 11px; letter-spacing: .06em; }
        .foot .site { color: #C9A94E; }
        .which { font-size: 7px; color: #b7ac9c; margin-top: 1.5mm; letter-spacing: .08em; text-transform: uppercase; }
      </style></head><body>
      ${chunks.map((c) => `<div class="sheet">${c.map((x) => `<div class="cell">${tag(x)}</div>`).join("")}${"<div class=\"cell\"></div>".repeat(4 - c.length)}</div>`).join("")}
      <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toastWarn("Allow pop-ups for this site to print the tag sheet."); setBusy(false); return; }
    w.document.write(html);
    w.document.close();
    setBusy(false);
  };

  return (
    <Dialog onClose={onClose} title="print qr hanger tags" hideHeader width={440}
      panelStyle={{ maxHeight: "88dvh", display: "flex", flexDirection: "column", padding: "22px 22px 18px" }}>
      <div className="ph-display" style={{ fontSize: 22, color: "var(--ink)" }}>print qr hanger tags</div>
      <div style={{ fontSize: 13, color: "var(--stone)", margin: "4px 0 14px" }}>
        {count} tag{count !== 1 ? "s" : ""} selected · {pages} page{pages !== 1 ? "s" : ""} of 4 — cut along the dashed lines.
      </div>
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 }}>
        {catalog.map((g) => (
          <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer", padding: "4px 2px" }}>
            <input type="checkbox" checked={checked.has(g.id)} onChange={() => toggle(g.id)} style={{ accentColor: "var(--violet)" }} />
            <img src={g.image} alt="" style={{ width: 30, height: 38, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button className="ph-btn" onClick={onClose} style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600, padding: "10px 16px", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)" }}>cancel</button>
        <button className="ph-btn btn-solid" disabled={count === 0 || busy} onClick={printSheet}
          style={{ padding: "11px 24px", fontSize: 13, opacity: count === 0 || busy ? 0.5 : 1 }}>
          {busy ? "building…" : "print tag sheet"}
        </button>
      </div>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import Onboarding, { slugify } from "@/components/Onboarding";
import PendingReview from "@/components/PendingReview";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  loadShop, saveShop, loadCatalog, addGarment as persistGarment,
  updateGarment as persistGarmentUpdate, removeGarment as unpersistGarment,
  setGarmentStock, getTryOnEvents, getLeads, setLeadHandled,
  updateShopSlug, loadFabrics, addFabric as persistFabric,
  updateFabric as persistFabricUpdate, removeFabric as unpersistFabric,
  setFabricStock, loadStyles, loadCompositions, createStyle as persistStyle,
  updateStyle as persistStyleUpdate,
  composeFabric as runCompose, setCompositionPublished, setCompositionPrice, setCompositionNote,
  removeComposition as unpersistComposition,
  runCounter as runCounterOnServer, saveCounterRun,
} from "@/lib/storage";
import { reportError } from "@/lib/logging";
import { toastErr, toastWarn, toastFailure } from "@/lib/toast";
import { getRole, markVendor } from "@/lib/account";
import type { Composition, CounterInput, CounterRun, Fabric, Garment, Lead, Shop, Style, StyleCoverage, StyleFamily, TryOnEvent } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop>({ id: null, slug: null, vendorCode: null, name: "", area: "", whatsapp: "", listed: false, status: "approved", statusNote: null, type: "apparel", category: "clothing", lat: null, lng: null });
  const [catalog, setCatalog] = useState<Garment[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [events, setEvents] = useState<TryOnEvent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase().auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        // shopper accounts don't get a shop provisioned — send them to /account
        const role = await getRole();
        if (role === "shopper") {
          router.replace("/account");
          return;
        }
        await markVendor(); // visiting the dashboard is the explicit vendor action
      }
      const s = await loadShop();
      if (s) setShop(s);
      const shopId = s?.id ?? null;
      const [c, fb, st, comp, ev, ld] = await Promise.all([
        loadCatalog(shopId),
        loadFabrics(shopId),
        loadStyles(shopId),
        loadCompositions(shopId),
        getTryOnEvents(shopId),
        getLeads(shopId),
      ]);
      setCatalog(c);
      setFabrics(fb);
      setStyles(st);
      setCompositions(comp);
      setEvents(ev);
      setLeads(ld);
      setLoading(false);
    })();
  }, [router]);

  const addGarment = async (g: Omit<Garment, "id" | "itemCode">) => {
    try {
      const saved = await persistGarment(shop, g, catalog.map((x) => x.id));
      setCatalog((c) => [saved, ...c]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      /* Both of these are raised by the enforce_garment_limit trigger, so they
         arrive as raw Postgres exception text. Translate them — the vendor
         should never see 'shop_not_approved' spelled that way. */
      if (msg.includes("shop_not_approved")) {
        toastWarn("Your shop is still awaiting approval, so the catalog is locked for now. We'll call you once you're approved.");
        return;
      }
      if (msg.includes("garment_limit_reached")) {
        toastWarn("You've reached your plan's garment limit.", {
          action: { label: "see plans", onClick: () => router.push("/dashboard?tab=plan") },
        });
        return;
      }
      reportError("dashboard", "add garment failed: " + msg, { shopId: shop.id });
      toastErr("Could not save garment: " + (e?.message || "the image may be too large — try a smaller photo."));
    }
  };

  const editGarment = async (updated: Garment) => {
    const existing = catalog.find((g) => g.id === updated.id);
    if (!existing) return;
    try {
      const saved = await persistGarmentUpdate(shop, updated, existing.image);
      setCatalog((c) => c.map((g) => (g.id === saved.id ? saved : g)));
    } catch (e: any) {
      reportError("dashboard", "edit garment failed: " + (e?.message || e), { shopId: shop.id });
      toastErr("Could not save changes: " + (e?.message || "please try again."));
    }
  };

  /* Fabrics mirror the garment handlers. The limit triggers raise the same two
     exceptions (with fabric_limit_reached in place of garment_limit_reached),
     so the same translation applies — both counts now share plans.max_garments. */
  const addFabric = async (f: Omit<Fabric, "id" | "itemCode">) => {
    try {
      const saved = await persistFabric(shop, f, fabrics.map((x) => x.id));
      setFabrics((c) => [saved, ...c]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("shop_not_approved")) {
        toastWarn("Your shop is still awaiting approval, so the catalog is locked for now. We'll call you once you're approved.");
        return;
      }
      if (msg.includes("fabric_limit_reached") || msg.includes("garment_limit_reached")) {
        toastWarn("You've reached your plan's catalog limit — garments and fabrics share it.", {
          action: { label: "see plans", onClick: () => router.push("/dashboard?tab=plan") },
        });
        return;
      }
      reportError("dashboard", "add fabric failed: " + msg, { shopId: shop.id });
      toastErr("Could not save fabric: " + (e?.message || "the image may be too large — try a smaller photo."));
    }
  };

  const editFabric = async (updated: Fabric) => {
    const existing = fabrics.find((f) => f.id === updated.id);
    if (!existing) return;
    try {
      const saved = await persistFabricUpdate(shop, updated, existing.image);
      setFabrics((c) => c.map((f) => (f.id === saved.id ? saved : f)));
    } catch (e: any) {
      reportError("dashboard", "edit fabric failed: " + (e?.message || e), { shopId: shop.id });
      toastErr("Could not save changes: " + (e?.message || "please try again."));
    }
  };

  /* ── optimistic writes ───────────────────────────────────────────────
     Every handler below moves the UI first and the database second, which is
     right — a stock toggle should not wait on a round trip. What was wrong was
     the `catch {}`: on a dropped connection the vendor watched "Out of stock"
     apply, it silently did not, and the storefront went on selling a piece
     the shop no longer had. Each one now puts the row back the way it was and
     says so, with the action offered again. */
  const removeFabric = async (id: string) => {
    const fabric = fabrics.find((f) => f.id === id);
    if (!fabric) return;
    const next = fabrics.filter((f) => f.id !== id);
    setFabrics(next);
    try {
      await unpersistFabric(fabric, next.map((x) => x.id));
    } catch (e) {
      setFabrics(fabrics); // it is still there — show it
      toastFailure("Could not delete “" + fabric.name + "”", e);
    }
  };

  const toggleFabricStock = async (id: string) => {
    const fabric = fabrics.find((f) => f.id === id);
    if (!fabric) return;
    const inStock = !fabric.inStock;
    setFabrics((c) => c.map((f) => (f.id === id ? { ...f, inStock } : f)));
    try {
      await setFabricStock(fabric, inStock);
    } catch (e) {
      setFabrics((c) => c.map((f) => (f.id === id ? { ...f, inStock: fabric.inStock } : f)));
      toastFailure("Could not change stock for “" + fabric.name + "”", e);
    }
  };

  /* Rendering is the one action here that spends real money, so it reloads the
     composition list from the server rather than trusting an optimistic guess:
     a render can come back ready, failed, or skipped-because-already-there,
     and the vendor needs to see which. */
  const composeFabric = async (fabricId: string, styleIds: string[]) => {
    const results = await runCompose(shop.id, fabricId, styleIds);
    setCompositions(await loadCompositions(shop.id));
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length === results.length) {
      const reason = failed[0]?.error;
      if (reason === "compose_limit") {
        throw new Error("You've used this month's stitching allowance. Upgrade in the Plan tab for more.");
      }
      if (reason === "not_approved") {
        throw new Error("Your shop is still awaiting approval, so stitching is locked for now.");
      }
      throw new Error("None of those came out. Try again, or check the fabric photo is clear.");
    }
    if (failed.length > 0) {
      toastWarn(failed.length + " of " + results.length + " didn't come out. Delete those and try again.");
    }
  };

  const createStyle = async (s: {
    name: string;
    family: StyleFamily;
    hint: string;
    coverage: StyleCoverage;
    refImage: string | null;
  }) => {
    const saved = await persistStyle(shop, s);
    setStyles((cur) => [...cur, saved]);
  };

  /* Editing a cut bumps its revision in the database, which is what makes
     existing renders of it read as stale. Reload compositions so the studio
     shows that immediately rather than after a refresh. */
  const updateStyle = async (updated: Style) => {
    const existing = styles.find((s) => s.id === updated.id);
    const saved = await persistStyleUpdate(shop, updated, existing?.refImage ?? null);
    setStyles((cur) => cur.map((s) => (s.id === saved.id ? saved : s)));
    setCompositions(await loadCompositions(shop.id));
  };

  const publishComposition = async (id: string, published: boolean) => {
    setCompositions((cur) => cur.map((c) => (c.id === id ? { ...c, published } : c)));
    try {
      await setCompositionPublished(id, published);
    } catch (e) {
      setCompositions((cur) => cur.map((c) => (c.id === id ? { ...c, published: !published } : c)));
      toastFailure(published ? "Could not publish that piece" : "Could not unpublish that piece", e);
    }
  };

  const priceComposition = async (id: string, price: number) => {
    const before = compositions.find((c) => c.id === id)?.price;
    setCompositions((cur) => cur.map((c) => (c.id === id ? { ...c, price } : c)));
    try {
      await setCompositionPrice(id, price);
    } catch (e) {
      if (before !== undefined) setCompositions((cur) => cur.map((c) => (c.id === id ? { ...c, price: before } : c)));
      toastFailure("Could not save that price", e);
    }
  };

  /* Only the note moves — rendered_note stays put, so the card reads stale
     until it's stitched again. Optimistic like its neighbours; a failed write
     leaves the vendor's text on screen, which is the harmless direction. */
  const noteComposition = async (id: string, note: string) => {
    setCompositions((cur) => cur.map((c) => (c.id === id ? { ...c, note } : c)));
    try {
      await setCompositionNote(id, note);
    } catch (e) {
      /* Deliberately NOT rolled back: the vendor's own words are the one thing
         it would be worse to delete than to leave unsaved. Say it didn't save
         and let them press again. */
      toastFailure("Could not save that note", e);
    }
  };

  const removeComposition = async (id: string) => {
    const before = compositions;
    setCompositions((cur) => cur.filter((c) => c.id !== id));
    try {
      await unpersistComposition(id);
    } catch (e) {
      setCompositions(before);
      toastFailure("Could not delete that piece", e);
    }
  };

  /* The counter spends without writing anything, so unlike composeFabric there
     is nothing to reload afterwards — the result lives in the panel until the
     vendor decides to keep it. */
  const runCounter = (input: CounterInput, onStitched?: (garmentUrl: string) => void): Promise<CounterRun> =>
    runCounterOnServer(shop.id, input, onStitched);

  /* Keeping one does write: a fabric, a cut of the shop's own, and the
     composition joining them. All three lists move at once so the Fabrics tab
     is already correct when the vendor switches to it to set a price. */
  const keepCounterRun = async (
    input: CounterInput,
    garmentUrl: string,
    names: { fabric: string; cut: string }
  ) => {
    try {
      const saved = await saveCounterRun(shop, input, garmentUrl, names, fabrics.map((f) => f.id));
      setFabrics((c) => [saved.fabric, ...c]);
      setStyles((c) => [...c, saved.style]);
      setCompositions((c) => [saved.composition, ...c]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("fabric_limit_reached") || msg.includes("garment_limit_reached")) {
        throw new Error("You've reached your plan's catalog limit — garments and fabrics share it. Upgrade in the Plan tab to keep this.");
      }
      if (msg.includes("shop_not_approved")) {
        throw new Error("Your shop is still awaiting approval, so the catalog is locked for now.");
      }
      reportError("dashboard", "keep counter run failed: " + msg, { shopId: shop.id });
      throw new Error("Could not keep this: " + (e?.message || "please try again."));
    }
  };

  const changeSlug = async (slug: string): Promise<string | null> => {
    try {
      const updated = await updateShopSlug(shop, slug);
      setShop(updated);
      return null;
    } catch (e: any) {
      return e?.message || "Could not update the link — try again.";
    }
  };

  const removeGarment = async (id: string) => {
    const garment = catalog.find((g) => g.id === id);
    if (!garment) return;
    const next = catalog.filter((g) => g.id !== id);
    setCatalog(next);
    try {
      await unpersistGarment(garment, next.map((x) => x.id));
    } catch (e) {
      setCatalog(catalog);
      toastFailure("Could not delete “" + garment.name + "”", e);
    }
  };

  const toggleStock = async (id: string) => {
    const garment = catalog.find((g) => g.id === id);
    if (!garment) return;
    const inStock = !garment.inStock;
    setCatalog((c) => c.map((g) => (g.id === id ? { ...g, inStock } : g)));
    try {
      await setGarmentStock(garment, inStock);
    } catch (e) {
      /* The one that matters most: a failed "out of stock" that looked like it
         worked leaves the storefront taking orders for a piece that is gone. */
      setCatalog((c) => c.map((g) => (g.id === id ? { ...g, inStock: garment.inStock } : g)));
      toastFailure("“" + garment.name + "” is still marked " + (garment.inStock ? "in stock" : "out of stock"), e);
    }
  };

  const updateShop = useCallback((s: Shop) => {
    setShop(s);
    saveShop(s).catch((e: any) => {
      reportError("dashboard", "save shop failed: " + (e?.message || e), { shopId: s.id });
      toastErr("Could not save shop settings: " + (e?.message || "please try again."));
    });
  }, []);

  /* First login: save the profile, then point /k and /s links at a slug
     built from the shop name (falling back to name-2 … if taken). */
  const completeOnboarding = async (info: { name: string; area: string; whatsapp: string; listed: boolean; type: Shop["type"]; category: Shop["category"]; lat: number | null; lng: number | null }) => {
    let next: Shop = { ...shop, ...info };
    await saveShop(next);
    if (next.id) {
      const base = slugify(info.name);
      if (base.length >= 3 && base !== next.slug) {
        const candidates = [base, ...[2, 3, 4, 5].map((n) => `${base.slice(0, 37)}-${n}`)];
        for (const candidate of candidates) {
          try {
            const updated = await updateShopSlug(next, candidate);
            next = { ...next, slug: updated.slug };
            break;
          } catch {
            // slug taken: try the next candidate; keep the provisioned slug if all fail
          }
        }
      }
    }
    setShop(next);
  };

  const handleLead = async (id: string, handled: boolean) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, handled } : l)));
    try {
      await setLeadHandled(id, handled);
    } catch (e) {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, handled: !handled } : l)));
      toastFailure("Could not mark that order " + (handled ? "done" : "open"), e);
    }
  };

  const signOut = isSupabaseConfigured()
    ? async () => { await supabase().auth.signOut(); router.replace("/login"); }
    : null;

  /* Two gates before the dashboard proper: fill in the profile, then wait for
     approval. An unapproved shop can't add garments or run try-ons — the
     database refuses both — so the dashboard would only offer controls that
     fail on use. */
  if (!loading && !shop.name.trim()) {
    return <Onboarding shop={shop} onComplete={completeOnboarding} />;
  }

  if (!loading && shop.status !== "approved") {
    /* updateShop so a vendor whose review is stuck on a mistyped phone number
       can fix it themselves instead of being unreachable and unapprovable */
    return <PendingReview shop={shop} signOut={signOut} updateShop={updateShop} />;
  }

  return (
    <Dashboard
      shop={shop} updateShop={updateShop} changeSlug={shop.slug ? changeSlug : null}
      catalog={catalog} addGarment={addGarment} editGarment={editGarment}
      removeGarment={removeGarment}
      toggleStock={toggleStock} loading={loading}
      fabrics={fabrics} addFabric={addFabric} editFabric={editFabric}
      removeFabric={removeFabric} toggleFabricStock={toggleFabricStock}
      styles={styles} compositions={compositions}
      composeFabric={composeFabric} createStyle={createStyle} updateStyle={updateStyle}
      publishComposition={publishComposition} priceComposition={priceComposition}
      noteComposition={noteComposition}
      removeComposition={removeComposition}
      runCounter={runCounter} keepCounterRun={keepCounterRun}
      counterEnabled={isSupabaseConfigured()}
      events={events} leads={leads} onLeadHandled={handleLead}
      launchKiosk={() => router.push(shop.slug ? "/k/" + shop.slug : "/kiosk")}
      signOut={signOut}
    />
  );
}

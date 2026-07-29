"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { StitchingOverlay } from "@/components/FabricStudio";
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
  setCompositionCorrection, setFabricCorrection, setFabricColors,
  removeComposition as unpersistComposition,
  runCounter as runCounterOnServer, saveCounterRun,
} from "@/lib/storage";
import { colorText } from "@/lib/constants";
import { reportError } from "@/lib/logging";
import { toast, toastOk, toastErr, toastWarn, toastFailure, dismissToast } from "@/lib/toast";
import { getRole, markVendor } from "@/lib/account";
import type { Composition, CounterInput, CounterRun, Fabric, FabricColor, Garment, Lead, Shop, Style, StyleCoverage, StyleFamily, TryOnEvent } from "@/lib/types";

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
  /** The one running image generation, or null. See composeFabric. */
  const [job, setJob] = useState<{ image: string; caption: string; steps: number } | null>(null);
  const [jobMinimized, setJobMinimized] = useState(false);

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
  /* A stitch is a job, not a modal state.
     It lives here rather than in the studio for three reasons that all come
     from the same fact — it takes the better part of a minute per cut and the
     shop is being charged for it:
       · closing the studio must not abandon it,
       · the vendor must be able to push it aside and keep working,
       · and only one may run, because two at once means two bills, a slower
         queue for both, and a progress bar that can only honestly describe
         one of them. */
  const composeFabric = async (fabricId: string, styleIds: string[]) => {
    if (job) throw new Error("One stitch at a time — this one's still running.");
    const fabric = fabrics.find((f) => f.id === fabricId);
    setJob({
      image: fabric?.image ?? "",
      caption:
        (fabric?.name ?? "Cloth") + " · " + styleIds.length +
        " cut" + (styleIds.length !== 1 ? "s" : ""),
      steps: styleIds.length,
    });
    setJobMinimized(false);
    /* It announces the start and then gets out of the way. This used to be
       sticky (duration 0) on the argument that it stood for work still running
       and should leave when the work did — but StitchingOverlay is rendered a
       level up from <Dashboard> and draws for the whole job, minimising to a
       corner bar with the cloth and a percentage. The overlay survives closing
       the studio; the toast was never the last thing on screen, only the last
       thing in the way. So it fades, and the bar carries the job.

       Dismissed in `finally` as well, for a batch that finishes inside the
       four seconds — dismissToast on an id that has already gone is a no-op. */
    const notice = toast(
      "Stitching " + styleIds.length + " cut" + (styleIds.length !== 1 ? "s" : "") + "…",
      { placement: "top" }
    );
    try {
      return await runComposeJob(fabricId, styleIds);
    } finally {
      dismissToast(notice);
      setJob(null);
    }
  };

  const runComposeJob = async (fabricId: string, styleIds: string[]) => {
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
    /* Only what was actually made. A batch where every cut was already
       stitched costs nothing and produces nothing, and telling the vendor
       "3 previews ready" for three pictures that were already there is how
       they stop believing the number. */
    const made = results.filter((r) => r.status === "ready").length;
    if (made > 0) {
      toastOk(
        made + " preview" + (made !== 1 ? "s" : "") + " ready — check them before publishing.",
        { placement: "top" }
      );
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

  /* No approveComposition any more. It existed for one control — the verdict
     question the studio used to open on every finished render — and that is
     gone, so nothing can set the flag. `compositions.approved` is still
     written to false by correctComposition below, which keeps the stored value
     honest rather than leaving it stuck true on a render since complained
     about; nothing reads it.

     A reported fault, filed against the pairing or against the cloth. Only the
     live value moves — the rendered_* mirrors stay where the last render left
     them, so the card reads as needing a re-stitch until one is paid for. A
     cloth-scoped fault marks every preview of that bolt, which is the point:
     they were all made under the old understanding of it. */
  const correctComposition = async (
    id: string,
    correction: string,
    scope: "cut" | "cloth"
  ) => {
    const composition = compositions.find((c) => c.id === id);
    const fabricId = composition?.fabricId ?? null;
    /* Only the fields this write touches are remembered, and the rollback puts
       only those back. Snapshotting whole arrays would be simpler and wrong:
       a colour correction is saved from the same button press, so restoring
       the old `fabrics` here would quietly undo a colour write that succeeded. */
    const prevCorrection =
      scope === "cut"
        ? composition?.correction ?? ""
        : fabrics.find((f) => f.id === fabricId)?.correction ?? "";
    const prevApproved = composition?.approved ?? false;

    if (scope === "cut") {
      setCompositions((cur) =>
        cur.map((c) => (c.id === id ? { ...c, correction, approved: false } : c))
      );
    } else if (fabricId) {
      setFabrics((cur) => cur.map((f) => (f.id === fabricId ? { ...f, correction } : f)));
    }
    try {
      if (scope === "cut") await setCompositionCorrection(id, correction);
      else if (fabricId) await setFabricCorrection(fabricId, correction);
    } catch (e) {
      /* Rolled back, unlike the note: a correction that looks saved but isn't
         costs a render to discover — the vendor stitches again and gets the
         same fault back. */
      if (scope === "cut") {
        setCompositions((cur) =>
          cur.map((c) =>
            c.id === id ? { ...c, correction: prevCorrection, approved: prevApproved } : c
          )
        );
      } else if (fabricId) {
        setFabrics((cur) =>
          cur.map((f) => (f.id === fabricId ? { ...f, correction: prevCorrection } : f))
        );
      }
      toastFailure("Could not save what you reported", e);
    }
  };

  /* The cloth's colours, corrected from the studio against a render that got
     them wrong. Writes the fabric only, and every preview of that bolt goes
     stale off the back of it — staleReason compares these colours against the
     ones each render was made under.

     `colorsCorrected` moves with them, because that is what the write means:
     a vendor who has seen a garment beside the bolt has said something the
     photo cannot say about itself, and only then is the render prompt allowed
     to put the words above the sample. */
  const fixFabricColor = async (fabricId: string, colors: FabricColor[]) => {
    const before = fabrics;
    setFabrics((cur) =>
      cur.map((f) =>
        f.id === fabricId
          ? { ...f, colors, colorsCorrected: true, color: colorText(colors) }
          : f
      )
    );
    try {
      await setFabricColors(fabricId, colors);
    } catch (e) {
      setFabrics(before);
      toastFailure("Could not save that colour", e);
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
  /* The counter shares the one-at-a-time rule. It spends from the same
     allowance against the same machines, and a fitting that queues behind a
     catalog batch is a customer standing at the desk watching a bar that
     hasn't started — better to say so and let the vendor choose. */
  const runCounter = (input: CounterInput, onStitched?: (garmentUrl: string) => void): Promise<CounterRun> => {
    if (job) {
      return Promise.reject(
        new Error("A stitch is already running. Wait for it to finish, then try this again.")
      );
    }
    return runCounterOnServer(shop.id, input, onStitched);
  };

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
    <>
    {/* Suspense because <Dashboard> reads ?tab= : the plan and settings pages
        moved out of the tab bar into the account menu, so a toast pointing at
        /dashboard?tab=plan is how a vendor who just hit their catalog limit
        gets to the plans. Same shape as /login and /kiosk. */}
    <Suspense fallback={null}>
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
      correctComposition={correctComposition}
      fixFabricColor={fixFabricColor}
      removeComposition={removeComposition}
      runCounter={runCounter} keepCounterRun={keepCounterRun}
      counterEnabled={isSupabaseConfigured()}
      events={events} leads={leads} onLeadHandled={handleLead}
      launchKiosk={() => router.push(shop.slug ? "/k/" + shop.slug : "/kiosk")}
      signOut={signOut}
      composing={job !== null}
    />
    </Suspense>
    {/* Outside <Dashboard> on purpose: the job has to keep drawing after the
        studio that started it is closed. */}
    {job && (
      <StitchingOverlay image={job.image} caption={job.caption} steps={job.steps}
        minimized={jobMinimized}
        onMinimize={() => setJobMinimized(true)}
        onExpand={() => setJobMinimized(false)} />
    )}
    </>
  );
}

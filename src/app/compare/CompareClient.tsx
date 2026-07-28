"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fileToCompressedDataURL } from "@/lib/images";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import Icon from "@/components/Icon";
import { loadCatalog } from "@/lib/storage";
import { adminGet, statusFromError, type AdminStatus } from "@/lib/admin-client";

/* Dev tool: run one person photo + one garment through all try-on providers
   in parallel; each card paints the moment its provider finishes.

   Admin-only. Every run here spends real fal and OpenAI credits, and the only
   thing guarding that was a dev-mode check plus a line of copy reading "dev
   tool · not linked anywhere" — which is a note, not a lock. The guard here
   decides what renders; /api/compare re-checks the token on every request and
   is the actual boundary. */

const PROVIDERS = [
  { id: "fal", label: "fal · FASHN v1.6" },
  { id: "gpt-image-1", label: "OpenAI · gpt-image-1" },
  { id: "gpt-image-2", label: "OpenAI · gpt-image-2" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

interface Item {
  id: string;
  name: string;
  category: string;
  image: string;
}

type Slot = { state: "pending" } | { state: "done"; url: string; ms: number } | { state: "error"; error: string; ms: number };

export default function CompareClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [garment, setGarment] = useState<Item | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("low");
  const [slots, setSlots] = useState<Partial<Record<ProviderId, Slot>>>({});
  const [access, setAccess] = useState<AdminStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const runId = useRef(0);
  const personFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    adminGet<{ email: string }>("/api/admin/me")
      .then(async () => {
        if (!alive) return;
        const { data } = await supabase().auth.getSession();
        setToken(data.session?.access_token ?? null);
        setAccess("ready");
      })
      .catch((e) => { if (alive) setAccess(statusFromError(e)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured()) {
        const { data } = await supabase()
          .from("garments")
          .select("id, name, category, image_url")
          .order("created_at", { ascending: false })
          .limit(60);
        setItems((data ?? []).map((g) => ({ id: g.id, name: g.name, category: g.category, image: g.image_url })));
      } else {
        const cat = await loadCatalog();
        setItems(cat.map((g) => ({ id: g.id, name: g.name, category: g.category, image: g.image })));
      }
    })();
  }, []);

  const fire = (provider: ProviderId, id: number) => {
    if (!garment || !person) return;
    setSlots((s) => ({ ...s, [provider]: { state: "pending" } }));
    fetch("/api/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({
        provider, personImage: person, garmentImage: garment.image, category: garment.category, quality,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (id !== runId.current) return; // superseded by a newer run
        setSlots((s) => ({
          ...s,
          [provider]: res.ok
            ? { state: "done", url: data.url, ms: data.ms }
            : { state: "error", error: data?.error || "failed (" + res.status + ")", ms: data?.ms ?? 0 },
        }));
      })
      .catch((e) => {
        if (id !== runId.current) return;
        setSlots((s) => ({ ...s, [provider]: { state: "error", error: String(e?.message || e), ms: 0 } }));
      });
  };

  const runAll = () => {
    const id = ++runId.current;
    setSlots({});
    for (const p of PROVIDERS) fire(p.id, id);
  };

  const busy = Object.values(slots).some((s) => s?.state === "pending");
  const started = Object.keys(slots).length > 0;

  if (access !== "ready") {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="sheet" style={{ padding: "34px 30px", width: 420, maxWidth: "100%", textAlign: "center" }}>
          {access === "loading" ? (
            <>
              <span className="ee-mark ee-looking" style={{ fontSize: 38, color: "var(--violet)" }}><span>ee</span></span>
              <p style={{ color: "var(--stone)", marginTop: 12 }}>one moment…</p>
            </>
          ) : (
            <div role="alert">
              <h1 className="ph-display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 8px" }}>admins only</h1>
              <p style={{ color: "var(--stone)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 18px" }}>
                {access === "nosupabase"
                  ? "This tool needs cloud mode (Supabase configured)."
                  : access === "unauth"
                  ? "Sign in with an allow-listed admin account to use the provider comparison — every run spends real credits."
                  : "This account isn't an admin. Every run here spends real fal and OpenAI credits."}
              </p>
              <Link href={access === "unauth" ? "/login" : "/"} className="ph-btn btn-violet" style={{ width: "100%" }}>
                {access === "unauth" ? "sign in" : "back home"}
              </Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)", padding: "30px 20px 60px" }}>
      <div id="main" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div className="kicker" style={{ marginBottom: 6 }}>admin tool · spends real credits</div>
        <h1 className="ph-display" style={{ fontSize: 30, color: "var(--ink)", margin: "0 0 4px" }}>
          try-on provider compare
        </h1>
        <p style={{ color: "var(--stone)", fontSize: 14, margin: "0 0 26px" }}>
          fal / FASHN v1.6 (dedicated try-on) vs OpenAI gpt-image-1 &amp; gpt-image-2 — same person, same garment.
        </p>

        {/* 1 — garment */}
        <h2 style={sectionH}>1 · pick a garment</h2>
        {items.length === 0 ? (
          <p style={{ color: "var(--stone)", fontSize: 14 }}>No garments found — add some in the dashboard first.</p>
        ) : (
          <>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={"search " + items.length + " garments by name or category…"} aria-label="Search garments by name or category"
            style={{ width: "100%", maxWidth: 340, padding: "10px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--line)", background: "var(--card)", fontSize: 13.5, marginBottom: 12 }} />
          {(() => {
            const q = search.trim().toLowerCase();
            const shown = q ? items.filter((g) => (g.name + " " + g.category).toLowerCase().includes(q)) : items;
            return shown.length === 0 ? (
              <p style={{ color: "var(--stone)", fontSize: 13.5 }}>nothing matches &ldquo;{search}&rdquo;</p>
            ) : (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
            {shown.map((g) => (
              <button key={g.id} onClick={() => setGarment(g)} className="ph-btn"
                style={{
                  flexShrink: 0, width: 110, padding: 0, borderRadius: "var(--radius-md)", overflow: "hidden",
                  border: garment?.id === g.id ? "3px solid var(--violet)" : "1px solid var(--line)",
                  background: "var(--card)",
                }}>
                <img src={g.image} alt={g.name} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                <div style={{ fontSize: 11, padding: "5px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              </button>
            ))}
          </div>
            );
          })()}
          </>
        )}

        {/* 2 — person */}
        <h2 style={sectionH}>2 · person photo</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {/* A <label> wrapping a hidden input is not focusable, so this was
              keyboard-unreachable — a button that clicks the input is. */}
          <button type="button" className="ph-btn btn-outline"
            onClick={() => personFileRef.current?.click()}
            style={{ padding: "10px 22px", fontSize: 14, cursor: "pointer" }}>
            {person ? "change photo" : "upload photo"}
          </button>
          <input ref={personFileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setPerson(await fileToCompressedDataURL(f, 1024, 0.85));
            }} />
          {person && <img src={person} alt="person" style={{ height: 110, borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }} />}
        </div>

        {/* 3 — run */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
          <span style={{ fontSize: 13, color: "var(--stone)" }}>openai quality:</span>
          {(["low", "medium", "high"] as const).map((q) => (
            <button key={q} className={"efc-chip " + (quality === q ? "on" : "off")} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="ph-btn btn-violet" disabled={!garment || !person || busy} onClick={runAll}
            style={{ opacity: !garment || !person || busy ? 0.5 : 1, padding: "13px 34px", fontSize: 15 }}>
            {busy ? "generating…" : "run comparison"}
          </button>
          {started && !busy && (
            <button className="ph-btn btn-outline" onClick={() => fire("fal", runId.current)}
              style={{ padding: "11px 26px", fontSize: 14 }}>
              reroll fal <Icon name="dice" />
            </button>
          )}
        </div>

        {/* results — each card appears as its provider finishes */}
        {started && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 30 }}>
            {PROVIDERS.map((p) => (
              <ResultCard key={p.id} title={p.label} slot={slots[p.id]} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const sectionH: React.CSSProperties = {
  fontFamily: "var(--font-display), sans-serif", fontSize: 17, fontWeight: 700, color: "var(--ink)", margin: "26px 0 12px",
};

function ResultCard({ title, slot }: { title: string; slot?: Slot }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
        <span>{title}</span>
        {slot?.state !== "pending" && slot && (
          <span style={{ color: "var(--stone)", fontWeight: 500 }}>{(slot.ms / 1000).toFixed(1)}s</span>
        )}
      </div>
      {!slot || slot.state === "pending" ? (
        <div style={{ aspectRatio: "2/3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--paper-deep)" }}>
          <span className="ee-mark ee-looking" style={{ fontSize: 34, color: "var(--violet)" }}><span>ee</span></span>
          <span style={{ color: "var(--stone)", fontSize: 13 }}>generating…</span>
        </div>
      ) : slot.state === "done" ? (
        <img src={slot.url} alt={title} className="img-blend" style={{ width: "100%", display: "block", background: "var(--paper-deep)" }} />
      ) : (
        <div style={{ padding: "24px 16px", color: "var(--danger)", fontSize: 13, lineHeight: 1.6 }}>{slot.error}</div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Icon from "@/components/Icon";

/* peeq.fashion/qr — the counter QR, self-serve.

   The QR encodes /counter, which is user-agnostic: whoever is signed in on
   the scanning device gets their own counter. So there is nothing shop-
   specific to protect and nothing to configure — a public page any vendor
   (or we ourselves) can open, pick a layout, and print, beats a control
   buried in each shop's settings. */

/* Card widths in mm; height is always 1.4x (the 10:14 ratio). The 2-per-page
   cards print ROTATED — landscape footprints stacked top and bottom on the
   portrait sheet — making each card 112mm wide instead of the 92mm two
   upright cards squeezed side by side would allow. Not more than 112: print
   engines fragment elements by their PRE-rotation boxes, so each card's
   un-rotated 1.4w height must also sit fully inside the page (2.4w + gap
   ≤ 279mm), or the lower card gets sliced across two pages. */
const CARD_W: Record<1 | 2 | 4, number> = { 1: 130, 2: 112, 4: 90 };

export default function QrPage() {
  const [per, setPer] = useState<1 | 2 | 4>(4);
  const [qr, setQr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(window.location.origin + "/counter", {
      width: 640, margin: 1, color: { dark: "#1A1714", light: "#FAF6F0" },
    }).then(setQr, () => {});
  }, []);

  const print = () => {
    if (!qr) return;
    const w = CARD_W[per];
    /* The card is the brand, minimal: the real wordmark (Baloo 2 at 800,
       lowercase, the ee in butter — the same CSS the site's nav uses), one
       line in the counter's own voice, the QR, one line saying what scanning
       does, and the address. Nothing else. */
    const card = `
      <div class="card">
        <div class="wm">p<span>ee</span>q</div>
        <div class="kicker">counter</div>
        <div class="tag">कस्तो देख्छ? 🤔<br />Studio Quality मा हेर्नुस्</div>
        <img src="${qr}" alt="" />
        <div class="scan">scan to open the counter</div>
        <div class="site">www.peeq.fashion</div>
      </div>`;
    /* Two per page: the upright card, rotated by us onto a portrait sheet —
       the pair stacks top and bottom as landscape footprints, pinned at
       absolute mm coordinates on one fixed-height sheet. The centres are
       placed so each card's UN-rotated box also fits inside the page: print
       engines fragment by the pre-rotation box, and a box crossing the page
       edge gets sliced into fragments that each rotate separately. */
    const H = w * 1.4;
    const SHEET_W = 194, SHEET_H = 279; // A4 minus the 8mm page margins, with a hair of slack
    const slack = (SHEET_H - (2.4 * w + 6)) / 2; // un-rotated span: H + w + 6 + H-overlap = 2.4w + 6
    const y1 = slack + H / 2; // footprint centres, 6mm apart
    const y2 = y1 + w + 6;
    const left = (SHEET_W - w) / 2;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>peeq counter qr</title>
      <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Mukta:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        /* Print preview strips backgrounds and mutes fills by default, which
           turns the butter ee grey — exact says print what's authored. */
        * { box-sizing: border-box; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: A4; margin: 8mm; }
        body { font-family: 'Mukta', sans-serif; background: #fff; }
        .sheet { display: flex; flex-wrap: wrap; gap: 6mm; justify-content: center; align-content: center; min-height: 96vh; }
        .sheet2 { position: relative; width: ${SHEET_W}mm; height: ${SHEET_H}mm; }
        .sheet2 .card { position: absolute; left: ${left}mm; transform: rotate(90deg); }
        .sheet2 .c1 { top: ${y1 - H / 2}mm; }
        .sheet2 .c2 { top: ${y2 - H / 2}mm; }
        .card { width: ${w}mm; height: ${H}mm; font-size: ${w * 0.045}mm; background: #FAF6F0; border: 1px solid #e6dfd1; border-radius: 1.2em; padding: 2em 1.4em; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .wm { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 2.2em; letter-spacing: -0.03em; line-height: 1; color: #1A1714; }
        .wm span { color: #C9A94E; }
        .kicker { font-size: .8em; font-weight: 600; letter-spacing: .14em; color: #123A2E; margin-top: .6em; }
        .tag { font-size: 1.3em; font-weight: 700; color: #1A1714; margin-top: 1.4em; line-height: 1.35; }
        img { width: 60%; margin-top: 1.4em; }
        .scan { font-weight: 600; font-size: .85em; letter-spacing: .04em; color: #1A1714; margin-top: 1.8em; }
        .site { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: .8em; letter-spacing: .02em; color: #C9A94E; margin-top: .6em; }
      </style></head><body>
      ${per === 2
        ? `<div class="sheet2">${card.replace('class="card"', 'class="card c1"')}${card.replace('class="card"', 'class="card c2"')}</div>`
        : `<div class="sheet">${card.repeat(per)}</div>`}
      <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { setBlocked(true); return; }
    setBlocked(false);
    win.document.write(html);
    win.document.close();
  };

  /* A thumbnail of the A4 sheet: grey rectangles where the cards land —
     upright for 4 and 1, rotated (landscape, stacked) for 2. */
  const Mini = ({ n }: { n: 1 | 2 | 4 }) => (
    <div style={{ width: 64, height: 90, border: "1px solid var(--line)", borderRadius: 4, background: "var(--card)", display: "grid", gridTemplateColumns: n === 4 ? "1fr 1fr" : "1fr", gridTemplateRows: n === 1 ? "1fr" : "1fr 1fr", gap: 4, padding: 6, alignItems: "center", justifyItems: "center" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ width: n === 1 ? "58%" : "88%", aspectRatio: n === 2 ? "14 / 10" : "10 / 14", background: "var(--line)", borderRadius: 2 }} />
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "30px 18px", textAlign: "center" }}>
      <div className="wordmark" style={{ fontSize: 30 }}>p<span className="ee">ee</span>q</div>
      <div className="ph-display" style={{ fontSize: 20, color: "var(--ink)", marginTop: 8 }}>counter qr</div>
      <div style={{ fontSize: 13, color: "var(--stone)", maxWidth: 340, lineHeight: 1.55, marginTop: 2 }}>
        Scanning it opens the counter on the signed-in device. Pick how many cards per A4 sheet.
      </div>
      {qr ? (
        <img src={qr} alt="QR code linking to the counter" style={{ width: 148, height: 148, display: "block", margin: "16px 0", borderRadius: 8, border: "1px solid var(--line)" }} />
      ) : (
        <div style={{ height: 148, margin: "16px 0" }} />
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {([4, 2, 1] as const).map((n) => (
          <button key={n} type="button" onClick={() => setPer(n)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 8, cursor: "pointer", background: "var(--card)", border: per === n ? "2px solid var(--ink)" : "1px solid var(--line)", borderRadius: "var(--radius-card)" }}>
            <Mini n={n} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: per === n ? "var(--ink)" : "var(--stone)" }}>
              {n} per page
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
        {qr && (
          <a className="ph-btn" href={qr} download="peeq-counter-qr.png"
            style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, border: "1px solid var(--line-strong)", borderRadius: "var(--radius-btn)", color: "var(--ink)", textDecoration: "none" }}>
            download qr
          </a>
        )}
        <button className="ph-btn btn-solid" disabled={!qr} onClick={print}
          style={{ padding: "10px 18px", fontSize: 12, fontWeight: 600 }}>
          <Icon name="print" /> print
        </button>
      </div>
      {blocked && (
        <div style={{ fontSize: 12, color: "var(--warn)", marginTop: 10 }}>
          Allow pop-ups for this site to print the QR.
        </div>
      )}
    </div>
  );
}

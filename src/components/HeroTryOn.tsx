"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

/* Landing hero — a hands-on taste of the product. The rail shows the four
   outfits as flat-lay cards; picking one plays the ee "looking…" blink, then
   the model hard-cuts into that fit. Left alone it auto-cycles; a tap pauses
   the cycle for a few seconds so the visitor stays in control.

   Three things the auto-cycle had to grow up about:

   1. A pause control. It advanced every 3s forever with no way to stop it —
      WCAG 2.2.2 asks that anything moving for more than five seconds can be
      paused, and "wait 8 seconds after a tap" is not a control.
   2. prefers-reduced-motion. HeroCarousel next door checks it properly; this
      one ignored it entirely, so the page had two carousels with two
      different answers to the same question.
   3. The alt text. All four photos sat in the DOM at once, hidden only by
      opacity, each with alt="You wearing this fit" — so a screen reader
      announced four identical images, and the claim was false anyway: these
      are stock models, not the reader. Only the live slide is exposed now,
      and it says what it is. */

const FITS = [
  { photo: "/hero/hero-a.jpg", fit: "/hero/fit-a.jpg", line: "same you.", name: "a printed kurta" },
  { photo: "/hero/hero-b.jpg", fit: "/hero/fit-b.jpg", line: "new fit.", name: "a denim jacket" },
  { photo: "/hero/hero-c.jpg", fit: "/hero/fit-c.jpg", line: "no trial room.", name: "a party dress" },
  { photo: "/hero/hero-d.jpg", fit: "/hero/fit-d.jpg", line: "just a peeq.", name: "a formal shirt" },
];

const PEEQ_MS = 650; // the "looking…" blink before a picked fit lands
const CYCLE_MS = 3000; // idle auto-advance
const IDLE_RESUME_MS = 8000; // how long a tap holds off the auto-cycle

export default function HeroTryOn() {
  const [active, setActive] = useState(0);
  const [peeqing, setPeeqing] = useState(false);
  const [touched, setTouched] = useState(false); // stop the "tap me" nudge after first play
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const lastTouch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Same check HeroCarousel does, and it stays live: someone who turns the
     setting on mid-session gets the cycle stopped, not on the next reload. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const select = (i: number) => {
    if (i === active || peeqing) return;
    lastTouch.current = Date.now();
    setTouched(true);
    setPeeqing(true);
    timer.current = setTimeout(() => {
      setActive(i);
      setPeeqing(false);
    }, PEEQ_MS);
  };

  const cycling = !paused && !reduced;

  useEffect(() => {
    if (!cycling) return;
    const iv = setInterval(() => {
      if (Date.now() - lastTouch.current < IDLE_RESUME_MS) return;
      setActive((a) => (a + 1) % FITS.length); // auto: plain hard cut, no blink
    }, CYCLE_MS);
    return () => clearInterval(iv);
  }, [cycling]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="hero2-right">
      <div className="hero2-visual">
        {FITS.map((f, i) => (
          /* Stays a plain <img>: all four are stacked absolutely and
             cross-faded by opacity, which next/image's wrapper fights. They do
             now declare their intrinsic size so the 2:3 frame is reserved
             before the first byte lands. */
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f.photo} src={f.photo} width={800} height={1200}
            alt={i === active ? `A model wearing ${f.name}` : ""}
            aria-hidden={i !== active} loading={i === 0 ? "eager" : "lazy"}
            style={{ opacity: i === active ? 1 : 0 }} />
        ))}
        {peeqing ? (
          <div className="hero2-peeqing">
            <span className="ee-mark ee-looking" style={{ fontSize: 48, color: "#fff" }}><span>ee</span></span>
          </div>
        ) : (
          <span key={active} className="hero2-line peek">{FITS[active].line}</span>
        )}
        {/* WCAG 2.2.2. Hidden when reduced motion has already stopped the
            cycle — there is nothing left to pause. */}
        {!reduced && (
          <button className="ph-btn" onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the fit slideshow" : "Pause the fit slideshow"}
            aria-pressed={paused}
            style={{
              position: "absolute", right: 10, top: 10, zIndex: 4,
              width: 34, height: 34, borderRadius: "var(--radius-pill)",
              background: "rgba(13,11,10,.55)", color: "#fff",
              border: "1px solid rgba(255,255,255,.35)", backdropFilter: "blur(6px)",
              fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {paused ? "▶" : "❙❙"}
          </button>
        )}
      </div>
      <div className="hero2-rail">
        <span className="hero2-rail-hint"><Icon name="point-down" /> tap a fit — see it on you</span>
        {FITS.map((f, i) => (
          /* The visible label became "on you ✓" while the aria-label stayed
             "try fit 1", so the announced name and the read name disagreed on
             exactly the card whose state had changed. One label, both ways. */
          <button key={f.fit} onClick={() => select(i)}
            className={"hero2-fitcard" + (i === active ? " on" : "") + (!touched && i !== active ? " nudge" : "")}
            aria-label={i === active ? `${f.name} — on you` : `Try ${f.name}`} aria-pressed={i === active}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.fit} alt="" width={200} height={200} loading="lazy" />
            <span className="hero2-fitlabel">{i === active ? <>on you <Icon name="check" /></> : "fit 0" + (i + 1)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

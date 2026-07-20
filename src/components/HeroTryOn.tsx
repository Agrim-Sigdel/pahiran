"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

/* Landing hero — a hands-on taste of the product. The rail shows the four
   outfits as flat-lay cards; picking one plays the ee "looking…" blink, then
   the model hard-cuts into that fit. Left alone it auto-cycles; a tap pauses
   the cycle for a few seconds so the visitor stays in control. */

const FITS = [
  { photo: "/hero/hero-a.jpg", fit: "/hero/fit-a.jpg", line: "same you." },
  { photo: "/hero/hero-b.jpg", fit: "/hero/fit-b.jpg", line: "new fit." },
  { photo: "/hero/hero-c.jpg", fit: "/hero/fit-c.jpg", line: "no trial room." },
  { photo: "/hero/hero-d.jpg", fit: "/hero/fit-d.jpg", line: "just a peeq." },
];

const PEEQ_MS = 650; // the "looking…" blink before a picked fit lands
const CYCLE_MS = 3000; // idle auto-advance
const IDLE_RESUME_MS = 8000; // how long a tap holds off the auto-cycle

export default function HeroTryOn() {
  const [active, setActive] = useState(0);
  const [peeqing, setPeeqing] = useState(false);
  const [touched, setTouched] = useState(false); // stop the "tap me" nudge after first play
  const lastTouch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() - lastTouch.current < IDLE_RESUME_MS) return;
      setActive((a) => (a + 1) % FITS.length); // auto: plain hard cut, no blink
    }, CYCLE_MS);
    return () => {
      clearInterval(iv);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="hero2-right">
      <div className="hero2-visual">
        {FITS.map((f, i) => (
          <img key={f.photo} src={f.photo} alt="You wearing this fit"
            style={{ opacity: i === active ? 1 : 0 }} />
        ))}
        {peeqing ? (
          <div className="hero2-peeqing">
            <span className="ee-mark ee-looking" style={{ fontSize: 48, color: "#fff" }}><span>ee</span></span>
          </div>
        ) : (
          <span key={active} className="hero2-line peek">{FITS[active].line}</span>
        )}
      </div>
      <div className="hero2-rail">
        <span className="hero2-rail-hint"><Icon name="point-down" /> tap a fit — see it on you</span>
        {FITS.map((f, i) => (
          <button key={f.fit} onClick={() => select(i)}
            className={"hero2-fitcard" + (i === active ? " on" : "") + (!touched && i !== active ? " nudge" : "")}
            aria-label={"try fit " + (i + 1)} aria-pressed={i === active}>
            <img src={f.fit} alt="" />
            <span className="hero2-fitlabel">{i === active ? <>on you <Icon name="check" /></> : "fit 0" + (i + 1)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

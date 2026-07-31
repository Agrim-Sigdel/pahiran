"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import GarmentImage from "@/components/GarmentImage";
import { npr } from "@/lib/constants";

/* The storefront hero, sliding through the collection instead of committing
   the whole landing page to one piece.

   The frame is one fixed size for every slide so the cross-fade is the only
   thing that moves. Vendors shoot portrait, square and landscape, so each
   photo is shown whole inside that frame rather than cropped to fill it, with
   the same photo blurred behind to fill the leftover space (see .hero-fill).

   Auto-advance is a hint that there is more to see, not a ride: it stops for
   good the moment the shopper takes over, and never starts for a visitor who
   asked for reduced motion. */

/* A slide, not a Garment: a shop can now put its own photo in the hero — a
   banner, the shopfront — and that picture has no name, no price and no
   product page. name "" and price null render as silence, not as placeholders. */
export type HeroSlide = {
  id: string;
  image: string;
  name: string; // label + alt; "" on an uploaded banner
  href: string; // a product page, or "#collection" for a banner
  price: number | null; // null = no price line
};

const ADVANCE_MS = 5000;
const SWIPE_PX = 40;

export default function HeroCarousel({ slides, priority = true, className = "hero-visual", caption = true }: {
  slides: HeroSlide[];
  priority?: boolean;
  /** The frame. Defaults to the framed picture beside the copy; the lookbook
      layout passes .hero-bleed-visual, which is the same carousel filling the
      top of the page instead. */
  className?: string;
  /** Whether the bar names the current piece. Off where the layout already
      carries words over the photo (lookbook), so the caption doesn't argue
      with the headline sitting on top of it. The dots are not part of this —
      they stay whenever there is more than one slide, because they are the
      only thing that says the photo is a slideshow at all. */
  caption?: boolean;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState(false); // shopper drove it; stop advancing
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const touchX = useRef<number | null>(null);

  /* A landing page shouldn't pay for five hero photos before the visitor has
     asked for the second one. Mount the current slide and the next, and keep
     whatever has been shown — so the first paint fetches one photo, and each
     advance has its successor already warm. */
  const [mounted, setMounted] = useState<Set<number>>(() => new Set(count > 1 ? [0, 1] : [0]));

  const current = Math.min(index, Math.max(0, count - 1));

  useEffect(() => {
    setMounted((prev) => {
      const next = (current + 1) % count;
      if (prev.has(current) && prev.has(next)) return prev; // same set — don't re-render
      const grown = new Set(prev);
      grown.add(current);
      grown.add(next);
      return grown;
    });
  }, [current, count]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* Keyed on `index`, so every advance — automatic or not — restarts the clock
     rather than inheriting whatever was left of the previous tick. */
  useEffect(() => {
    if (taken || hovered || hidden || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [index, taken, hovered, hidden, count]);

  const go = (next: number) => {
    setTaken(true);
    setIndex(((next % count) + count) % count);
  };

  if (count === 0) return null;

  return (
    <div className={className} role="group" aria-roledescription="carousel" aria-label="Featured pieces"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        touchX.current = null;
        if (from === null || count < 2) return;
        const dx = e.changedTouches[0].clientX - from;
        if (Math.abs(dx) > SWIPE_PX) go(current + (dx < 0 ? 1 : -1));
      }}>

      {slides.map((g, i) => {
        const on = i === current;
        return (
          <Link key={g.id} href={g.href}
            className="hero-slide" aria-hidden={!on} tabIndex={on ? 0 : -1}
            style={{ opacity: on ? 1 : 0, pointerEvents: on ? "auto" : "none" }}>
            {mounted.has(i) && (
              <>
                {/* Same src and sizes as the photo in front, so the blurred
                    fill costs a cache hit rather than a second download. */}
                {/* blend={false}: this copy exists to fill the frame corner
                    to corner, and feathering it just puts the dead margin it
                    was added to cover back again. */}
                <div className="hero-fill" aria-hidden>
                  <GarmentImage src={g.image} alt="" priority={priority && i === 0} blend={false}
                    sizes="(max-width: 1200px) 100vw, 460px" />
                </div>
                <div className="hero-fit">
                  <GarmentImage src={g.image} alt={g.name} objectFit="contain"
                    priority={priority && i === 0} sizes="(max-width: 900px) 100vw, 460px" />
                </div>
              </>
            )}
          </Link>
        );
      })}

      {/* name, price and the dots share one scrim — a slideshow with no label
          leaves the shopper looking at a piece they can't name. A banner slide
          has nothing to say there, so the bar only appears when the current
          slide has words or there are dots to show. */}
      {((caption && (slides[current].name !== "" || slides[current].price !== null)) || count > 1) && (
      <div className="hero-bar">
        <div style={{ minWidth: 0 }}>
          {caption && slides[current].name !== "" && (
            <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {slides[current].name}
            </div>
          )}
          {caption && slides[current].price !== null && (
            <div style={{ fontSize: 12.5, opacity: 0.85 }}>{npr(slides[current].price)}</div>
          )}
        </div>

        {count > 1 && (
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
            {slides.map((g, i) => (
              <button key={g.id} className="hero-dot" onClick={() => go(i)}
                aria-label={g.name ? `Show ${g.name}` : `Show slide ${i + 1}`} aria-current={i === current}
                data-on={i === current ? "" : undefined} />
            ))}
          </div>
        )}
      </div>
      )}

      {count > 1 && (
        <>
          <button className="hero-arrow hide-sm" style={{ left: 10 }} onClick={() => go(current - 1)} aria-label="Previous piece">‹</button>
          <button className="hero-arrow hide-sm" style={{ right: 10 }} onClick={() => go(current + 1)} aria-label="Next piece">›</button>
        </>
      )}
    </div>
  );
}

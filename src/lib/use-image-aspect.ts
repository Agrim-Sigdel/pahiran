"use client";

import { useEffect, useState } from "react";

/* Natural aspect ratio of an image src.

   Lets a box adopt the picture's own shape instead of cropping the picture
   into a shape the layout picked. Vendors shoot on phones — portrait, square
   and landscape all arrive in the same catalog — so any fixed-ratio frame
   beheads somebody's photo sooner or later.

   Returns null until the image header has loaded; callers should carry a
   sensible default ratio until then so nothing jumps on arrival. */
export function useImageAspect(src: string | null): number | null {
  const [ar, setAr] = useState<number | null>(null);
  useEffect(() => {
    if (!src) { setAr(null); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setAr(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return ar;
}

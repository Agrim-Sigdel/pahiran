/* The heading faces a shop can choose between (STOREFRONT_FONTS).

   Loaded here rather than in app/layout.tsx on purpose. next/font emits a
   preload for every family a rendered route references, so declaring these
   globally would make the landing page, the kiosk and the whole vendor console
   fetch two typefaces they never set. Only the storefront route and the
   storefront editor import this module, so only those pages pay for it.

   Only the DISPLAY face changes. Body text stays Mukta in every choice,
   because it carries Devanagari and a shop name or a piece written in Nepali
   has to render in the paragraph face as well as the heading one — a Latin-only
   body face would silently fall back mid-sentence.

   Each family lands on its own variable and globals.css re-points
   --font-display inside .sf-font-{id}, so the choice reaches every heading,
   button and price on the page through the token they already use. */

import { Playfair_Display, Outfit } from "next/font/google";

const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sf-serif",
  display: "swap",
});

const modern = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sf-modern",
  display: "swap",
});

/** Put on any element that contains a storefront (the public page, the
    editor's preview) so the chosen face is in scope for .sf-font-* to name. */
export const storefrontFontVars = `${serif.variable} ${modern.variable}`;

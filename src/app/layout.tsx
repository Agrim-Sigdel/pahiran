import type { Metadata, Viewport } from "next";
import { Baloo_2, Mukta } from "next/font/google";
import Toaster from "@/components/Toaster";
import "./globals.css";

/* Self-hosted through next/font rather than a CSS @import. The @import was a
   render-blocking request to fonts.googleapis.com that Next could not preload,
   so every page painted in the fallback face and reflowed when Baloo landed.
   These emit preload links and a `font-display: swap` @font-face on the same
   origin, and expose the families as variables so globals.css never names a
   Google URL. */
const display = Baloo_2({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});
const body = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "peeq — a little look before you buy",
  description:
    "try it on, without trying it on. Virtual try-on for clothing shops and shoppers in Nepal. किन्नु अघि एक झलक।",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

/* No maximumScale / userScalable. Pinch-zoom is how people read a price at
   arm's length and how they check a weave — locking it out is WCAG 1.4.4, and
   on a shopping site it removes the one gesture the product is about. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    // Must track --paper in globals.css, or the browser/OS chrome sits at a
    // different colour from the page it is framing.
    { media: "(prefers-color-scheme: light)", color: "#FAF6F0" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1310" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* Light or dark comes straight from the device — there is no in-app switch,
     so no script, no stored preference and nothing to hydrate around. The
     whole theme is the prefers-color-scheme block in globals.css. */
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {/* First thing in the tab order on every page: a keyboard user should
            not have to walk the whole nav to reach the collection. Visually
            hidden until focused (see .skip-link). */}
        <a className="skip-link" href="#main">
          skip to content
        </a>
        {children}
        {/* the app's replacements for alert() and confirm() — one host, so a
            handler anywhere can raise one without a provider above it */}
        <Toaster />
      </body>
    </html>
  );
}

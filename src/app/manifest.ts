import type { MetadataRoute } from "next";

/* PWA manifest: makes the kiosk installable on a shop tablet
   ("Add to Home Screen" → full-screen, no browser chrome). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "peeq — a little look before you buy",
    short_name: "peeq",
    description:
      "try it on, without trying it on. Virtual try-on for clothing shops in Nepal.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF6F0",
    theme_color: "#00372b",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

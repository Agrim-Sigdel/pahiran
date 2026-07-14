import type { MetadataRoute } from "next";

/* PWA manifest: makes the kiosk installable on a shop tablet
   ("Add to Home Screen" → full-screen, no browser chrome). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pahiran — Virtual Try-On",
    short_name: "Pahiran",
    description:
      "Try it on — without trying it on. Virtual try-on for clothing shops in Nepal.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#211423",
    theme_color: "#211423",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

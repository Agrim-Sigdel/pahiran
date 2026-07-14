import type { MetadataRoute } from "next";

/* PWA manifest: makes the kiosk installable on a shop tablet
   ("Add to Home Screen" → full-screen, no browser chrome). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EasyFitCheck — Virtual Try-On",
    short_name: "EasyFitCheck",
    description:
      "Try it on, without trying it on. Virtual try-on for clothing shops in Nepal.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EDEFE0",
    theme_color: "#2A3D2F",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

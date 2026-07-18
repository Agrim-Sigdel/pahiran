import type { Metadata } from "next";
import ProductClient from "./ProductClient";
import { fetchGarmentMeta } from "@/lib/storefront-server";
import { npr } from "@/lib/constants";

/* Server wrapper — per-garment metadata so a pasted product link renders a
   real share card (the garment photo as the OG image) in Supabase mode. Local
   mode falls back to generic metadata; the client renders either way. */

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; garment: string }> }): Promise<Metadata> {
  const { slug, garment: garmentId } = await params;
  const meta = await fetchGarmentMeta(slug, decodeURIComponent(garmentId));
  if (!meta) {
    return {
      title: "Product — peeq",
      description: "See it on you before you buy.",
    };
  }
  const { shop, garment } = meta;
  const title = `${garment.name} · ${npr(garment.price)} — ${shop.name || "peeq"}`;
  const description = `${garment.name} — ${npr(garment.price)} at ${shop.name || "the shop"}. See it on you before you buy, then order in a tap.`;
  const images = garment.image ? [garment.image] : [];
  return {
    title,
    description,
    ...(SITE ? { metadataBase: new URL(SITE) } : {}),
    openGraph: {
      title, description, type: "website",
      url: SITE ? `${SITE}/s/${slug}/${encodeURIComponent(garment.id)}` : undefined,
      images: images.length ? images : undefined,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title, description, images: images.length ? images : undefined,
    },
  };
}

export default function ProductPage() {
  return <ProductClient />;
}

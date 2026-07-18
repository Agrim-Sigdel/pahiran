import type { Metadata } from "next";
import StorefrontClient from "./StorefrontClient";
import { fetchShopMeta } from "@/lib/storefront-server";

/* Server wrapper — provides real per-shop metadata / OG cards (Supabase mode)
   and renders the interactive client storefront. In local mode fetchShopMeta
   returns null and we fall back to generic site metadata. */

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const meta = await fetchShopMeta(slug);
  if (!meta) {
    return {
      title: "Shop — peeq",
      description: "Browse the collection and try it on before you buy.",
    };
  }
  const { shop, cover } = meta;
  const title = `${shop.name || "Shop"} — peeq`;
  const description = `Shop ${shop.name || "the collection"}${shop.area ? ` · ${shop.area}` : ""} on peeq — see any piece on you before you buy.`;
  const images = cover ? [cover.image] : [];
  return {
    title,
    description,
    ...(SITE ? { metadataBase: new URL(SITE) } : {}),
    openGraph: {
      title, description, type: "website",
      url: SITE ? `${SITE}/s/${slug}` : undefined,
      images: images.length ? images : undefined,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title, description, images: images.length ? images : undefined,
    },
  };
}

export default function StorefrontPage() {
  return <StorefrontClient />;
}

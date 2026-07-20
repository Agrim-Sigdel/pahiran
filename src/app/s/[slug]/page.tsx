import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorefrontClient from "./StorefrontClient";
import { fetchStorefront, fetchShopMeta, isServerSupabaseConfigured } from "@/lib/storefront-server";

/* Server wrapper — per-shop metadata / OG cards *and* the catalog itself, so
   the collection is in the initial HTML (indexable, and no spinner on a slow
   connection). The client component stays interactive for cart, wishlist and
   filters; it only self-fetches in local mode, where there's no server data. */

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

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchStorefront(slug);

  // Supabase mode + no such shop = a genuine 404, not a 200 with sad copy
  // (a 200 gets dead shop URLs indexed).
  if (!data && isServerSupabaseConfigured()) notFound();

  return (
    <>
      {data && <StorefrontJsonLd slug={slug} data={data} />}
      <StorefrontClient initialShop={data?.shop ?? null} initialCatalog={data?.catalog ?? null} />
    </>
  );
}

/* Product/Offer structured data for the in-stock collection — this is what
   puts price and availability into search results. */
function StorefrontJsonLd({
  slug,
  data,
}: {
  slug: string;
  data: NonNullable<Awaited<ReturnType<typeof fetchStorefront>>>;
}) {
  const { shop, catalog } = data;
  const url = SITE ? `${SITE}/s/${slug}` : undefined;
  const json = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: shop.name || "Shop",
    ...(url ? { url } : {}),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: catalog.slice(0, 60).map((g, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: g.name,
          category: g.category,
          ...(g.image ? { image: g.image } : {}),
          ...(url ? { url: `${url}/${encodeURIComponent(g.id)}` } : {}),
          offers: {
            "@type": "Offer",
            price: g.price,
            priceCurrency: "NPR",
            availability: g.inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            ...(shop.name ? { seller: { "@type": "Organization", name: shop.name } } : {}),
          },
        },
      })),
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}

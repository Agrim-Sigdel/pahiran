import Image from "next/image";

/* One image component for every garment photo on the storefront.

   Garment photos are two different things depending on the backend: public
   Supabase bucket URLs (Supabase mode) or inline data URLs (local mode).
   next/image can optimise the former and cannot touch the latter, so this
   picks the right renderer per src instead of forcing one everywhere.

   Both branches fill their positioned parent, so callers keep owning the
   aspect ratio exactly as they did with a raw <img>. */

export default function GarmentImage({
  src,
  alt,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px",
  priority = false,
  grayscale = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  grayscale?: boolean;
}) {
  const fit = {
    objectFit: "cover" as const,
    ...(grayscale ? { filter: "grayscale(.7)" } : {}),
  };

  // data: URLs (and any empty src) can't go through the optimiser
  if (!src || src.startsWith("data:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", ...fit }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      style={{ display: "block", ...fit }}
    />
  );
}

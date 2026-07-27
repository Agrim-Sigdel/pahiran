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
  objectFit = "cover",
  blend = true,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  grayscale?: boolean;
  /* "contain" for frames that show the piece whole rather than filling — a
     fixed-size hero can't crop every shape to fit without beheading someone. */
  objectFit?: "cover" | "contain";
  /* Feather the photo's edge into the surface behind it (see --photo-blend).
     On by default: a garment photo is a picture, and every picture in the app
     softens the same way. Off for images whose job is to fill a box edge to
     edge — a blurred backdrop has nothing to blend into but itself. */
  blend?: boolean;
}) {
  const fit = {
    objectFit,
    ...(grayscale ? { filter: "grayscale(.7)" } : {}),
  };
  const cls = blend ? "img-blend" : undefined;

  // data: URLs (and any empty src) can't go through the optimiser
  if (!src || src.startsWith("data:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={cls}
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
      className={cls}
      style={{ display: "block", ...fit }}
    />
  );
}

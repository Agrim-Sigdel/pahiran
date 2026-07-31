/* TEMPORARY — verification harness, deleted after this check. Renders the real
   storefront sections against synthetic config so each layout's markup can be
   inspected without writing test data into a real shop's row. */
"use client";

import { HeroSection, FeaturedSection, PromoSection, ShopCard, type SectionLayout } from "@/components/storefront";
import { storefrontLook } from "@/lib/storefront-theme";
import { defaultStorefront, type Garment, type Shop } from "@/lib/types";

const shop: Shop = {
  id: "t", slug: "t", vendorCode: "T", name: "Test", area: "Patan", whatsapp: "",
  listed: true, status: "approved", statusNote: null, type: "apparel",
  category: "clothing", lat: null, lng: null, storefront: defaultStorefront(),
};

const g = (id: string): Garment => ({
  id, itemCode: null, name: "Piece " + id, category: "Sarees", price: 1000,
  image: "/hero/hero-a.jpg", sizes: ["M"], inStock: true, tryonEnabled: true,
  stitchedToOrder: false,
});
const cat = [g("1"), g("2"), g("3"), g("4")];
const slides = cat.map((x) => ({ id: x.id, image: x.image, name: x.name, href: "#", price: x.price }));
const tryOn = { enabled: true, left: 5 };

export default function Check() {
  return (
    <>
      {(["boutique", "lookbook", "bazaar"] as SectionLayout[]).map((layout) => {
        const cfg = {
          ...defaultStorefront(),
          layout,
          accentHex: "#4a1526",
          toneHex: "#f6efe3",
          corners: "square",
          font: "serif",
        };
        const look = storefrontLook(cfg);
        return (
          <div key={layout} id={"L-" + layout} className={look.className} style={look.style}>
            <HeroSection shop={shop} kicker="a kicker" headline={"look first,\nthen buy"} body="Some body copy."
              slides={slides} tryOn={tryOn} tryonHref="/k/t" layout={layout} />
            <FeaturedSection heading="featured pieces" layout={layout}>
              {cat.map((x) => (
                <ShopCard key={x.id} g={x} slug="t" shop={shop} tryOn={tryOn}
                  saved={false} onToggleSave={() => {}} onAdd={() => {}} />
              ))}
            </FeaturedSection>
            <PromoSection shop={shop} kicker="the trial room" heading="see it on you" body="One photo."
              promo={{ image: "/hero/hero-a.jpg", alt: "x", href: "#" }} tryOn={tryOn} tryonHref="/k/t" layout={layout} />
          </div>
        );
      })}
    </>
  );
}

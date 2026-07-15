"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
import { escapeHtml, OSM_ATTRIBUTION, OSM_TILES, pinIcon } from "@/lib/osm";

/* Landing page directory map — one pin per listed shop that placed a
   location. Popups link to the storefront and kiosk. Leaflet is loaded
   lazily on mount (needs `window`), so this stays a client island under
   the server-rendered landing page. */

export interface MapShop {
  slug: string;
  name: string;
  area: string | null;
  lat: number;
  lng: number;
}

export default function ShopsMap({ shops }: { shops: MapShop[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !boxRef.current || mapRef.current || shops.length === 0) return;
      const map = L.map(boxRef.current, { scrollWheelZoom: false });
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
      for (const s of shops) {
        L.marker([s.lat, s.lng], { icon: pinIcon(L) })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:150px">
              <div style="font-weight:600;font-size:14px">${escapeHtml(s.name)}</div>
              ${s.area ? `<div style="font-size:12px;opacity:.7">${escapeHtml(s.area)}</div>` : ""}
              <div style="margin-top:8px;display:flex;gap:12px;font-size:13px;font-weight:600">
                <a href="/s/${encodeURIComponent(s.slug)}">storefront</a>
                <a href="/k/${encodeURIComponent(s.slug)}">peeq it</a>
              </div>
            </div>`
          );
      }
      map.fitBounds(L.latLngBounds(shops.map((s) => [s.lat, s.lng])).pad(0.25), { maxZoom: 15 });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [shops]);

  if (shops.length === 0) return null;
  return (
    <div ref={boxRef} aria-label="Map of shops near you"
      style={{ height: "min(420px, 55vh)", maxWidth: 1040, margin: "0 auto 26px", borderRadius: "var(--radius-card)", border: "1px solid var(--line)", overflow: "hidden", zIndex: 0, position: "relative" }} />
  );
}

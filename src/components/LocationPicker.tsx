"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import { KATHMANDU, OSM_ATTRIBUTION, OSM_TILES, pinIcon } from "@/lib/osm";

/* Vendor-side map pin picker (Onboarding + Settings). Tap the map or drag
   the dot to place the shop; "use my location" jumps to the device GPS fix;
   the search box moves the view via Nominatim (area-level, pin stays manual).
   Leaflet is loaded lazily on mount — it needs `window`. */

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function LocationPicker({ lat, lng, onChange }: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const placeRef = useRef<((la: number, ln: number) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const hasPin = lat != null && lng != null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !boxRef.current || mapRef.current) return;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : KATHMANDU;
      const map = L.map(boxRef.current).setView(start, lat != null ? 16 : 12);
      L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);

      placeRef.current = (la, ln) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([la, ln]);
        } else {
          markerRef.current = L.marker([la, ln], { draggable: true, icon: pinIcon(L) }).addTo(map);
          markerRef.current.on("dragend", () => {
            const p = markerRef.current!.getLatLng();
            onChangeRef.current(round6(p.lat), round6(p.lng));
          });
        }
        onChangeRef.current(round6(la), round6(ln));
      };
      map.on("click", (e: LeafletMouseEvent) => placeRef.current!(e.latlng.lat, e.latlng.lng));
      if (lat != null && lng != null) placeRef.current(lat, lng);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      placeRef.current = null;
    };
    // mount-only: the map owns the pin afterwards; parent state follows via onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Location isn't available in this browser — tap the map instead.");
      return;
    }
    setStatus("finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
        placeRef.current?.(pos.coords.latitude, pos.coords.longitude);
      },
      () => setStatus("Could not get your location — search or tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const search = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setStatus("");
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=np&q=" +
          encodeURIComponent(q),
        { headers: { Accept: "application/json" } }
      );
      const results: { lat: string; lon: string }[] = await res.json();
      if (results[0]) {
        mapRef.current?.setView([Number(results[0].lat), Number(results[0].lon)], 16);
        setStatus("Now tap your exact shop spot on the map.");
      } else {
        setStatus("No match — try a nearby landmark, or tap the map.");
      }
    } catch {
      setStatus("Search failed — tap the map instead.");
    }
    setSearching(false);
  };

  const clearPin = () => {
    markerRef.current?.remove();
    markerRef.current = null;
    onChangeRef.current(null, null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={query} placeholder="Search a place, e.g. New Road"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          style={{ flex: 1 }} />
        <button type="button" className="ph-btn" onClick={search} disabled={searching}
          style={{ background: "var(--forest-deep)", color: "var(--cream)", padding: "0 16px", fontSize: 11, letterSpacing: ".1em" }}>
          {searching ? "…" : "search"}
        </button>
      </div>
      <div ref={boxRef} aria-label="Map — tap to place your shop pin"
        style={{ height: 240, borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", overflow: "hidden", zIndex: 0, position: "relative" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ph-btn" onClick={useMyLocation}
          style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--forest-deep)", padding: "8px 14px", fontSize: 11, letterSpacing: ".08em" }}>
          ◎ use my location
        </button>
        <span style={{ fontSize: 12, color: "var(--mut)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
          {hasPin ? `pinned ${lat!.toFixed(4)}, ${lng!.toFixed(4)}` : "no pin yet — tap the map"}
        </span>
        {hasPin && (
          <button type="button" className="ph-btn" onClick={clearPin}
            style={{ color: "var(--mut)", fontSize: 11, textDecoration: "underline", textUnderlineOffset: 3 }}>
            remove
          </button>
        )}
      </div>
      {status && (
        <span style={{ fontSize: 12, color: "var(--forest-deep)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>{status}</span>
      )}
    </div>
  );
}

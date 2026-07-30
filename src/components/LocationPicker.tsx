"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";
import Icon from "@/components/Icon";
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
      /* This map sits in the middle of the onboarding form, and it used to
         swallow both gestures a vendor needs to get past it: scrolling the
         page over the map zoomed the map (ShopsMap sets scrollWheelZoom:
         false; this one never did), and on a phone a one-finger drag panned
         the map instead of scrolling the page — so filling in the form got
         stuck at the map with the fields below unreachable.

         Panning is off on touch specifically, not everywhere: on a phone the
         one-finger swipe belongs to the page, and the pin is placed by tapping
         the map or dragging the marker — neither of which needs map panning —
         with the zoom buttons and "use my location" still doing their jobs. */
      const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(boxRef.current, {
        scrollWheelZoom: false,
        dragging: !coarse,
      }).setView(start, lat != null ? 16 : 12);
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
      setStatus("Tap the map instead.");
      return;
    }
    setStatus("finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
        placeRef.current?.(pos.coords.latitude, pos.coords.longitude);
      },
      () => setStatus("Tap the map instead."),
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
        setStatus("No match — tap the map.");
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
        <input value={query} placeholder="Search a place, e.g. New Road" maxLength={100} aria-label="Search for a place"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          style={{ flex: 1 }} />
        <button type="button" className="ph-btn" onClick={search} disabled={searching}
          style={{ background: "var(--ink)", color: "var(--card)", padding: "0 16px", fontSize: 11, letterSpacing: ".1em" }}>
          {searching ? "…" : "search"}
        </button>
      </div>
      <div ref={boxRef} aria-label="Map — tap to place your shop pin"
        style={{ height: 240, borderRadius: "var(--radius-btn)", border: "1px solid var(--line)", overflow: "hidden", zIndex: 0, position: "relative" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ph-btn" onClick={useMyLocation}
          style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", padding: "8px 14px", fontSize: 11, letterSpacing: ".08em" }}>
          <Icon name="locate" /> use my location
        </button>
        <span style={{ fontSize: 12, color: "var(--stone)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
          {hasPin ? `pinned ${lat!.toFixed(4)}, ${lng!.toFixed(4)}` : "no pin yet — tap the map"}
        </span>
        {hasPin && (
          <button type="button" className="ph-btn" onClick={clearPin}
            style={{ color: "var(--stone)", fontSize: 11, textDecoration: "underline", textUnderlineOffset: 3 }}>
            remove
          </button>
        )}
      </div>
      {status && (
        <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>{status}</span>
      )}
    </div>
  );
}

/* Shared OpenStreetMap/Leaflet bits. Leaflet itself is only ever imported
   dynamically inside client components (it touches `window`); this module
   holds the constants and pure helpers both maps share. */

import type * as Leaflet from "leaflet";

export const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/** Default map center when a shop has no pin yet. */
export const KATHMANDU: [number, number] = [27.7172, 85.324];

/** Brand shopping-bag marker with the blinking ee (styles in globals.css). */
export function pinIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: '<div class="peeq-pin"><span>ee</span></div>',
    iconSize: [36, 32],
    iconAnchor: [18, 32],
    popupAnchor: [0, -40],
  });
}

/** Link to the spot on openstreetmap.org (storefront "find us" link). */
export function osmViewUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

/* Popup content is built as an HTML string (Leaflet API), and shop names are
   vendor input — escape them. */
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

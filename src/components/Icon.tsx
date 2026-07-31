/* Inline SVG icon set.

   Replaces the emoji that used to sit in button labels. Emoji were a problem
   here for three reasons: they render as a different typeface (often colour)
   on every OS, they're announced literally by screen readers ("shopping bags
   button"), and several were baked into translation strings, so the Nepali and
   English labels carried their own copies of the same glyph.

   These inherit currentColor and size in `em`, so an icon always matches the
   colour and optical size of the text beside it. Decorative by default
   (aria-hidden) — the adjacent text is the label. When an icon is alone in a
   button, give the *button* an aria-label. */

export type IconName =
  | "bag" | "check" | "heart" | "heart-filled" | "close" | "print" | "ruler"
  | "phone" | "locate" | "reset" | "star" | "edit" | "bolt" | "sparkle"
  | "person" | "eye" | "dice" | "party" | "point-down" | "swap" | "scissors"
  | "copy" | "open" | "camera" | "download" | "search"
  | "globe" | "share" | "back" | "menu"
  /* the dashboard's nav and menu — see the bar in Dashboard.tsx */
  | "home" | "grid" | "cloth" | "hanger" | "plus" | "chevron"
  | "gear" | "wallet" | "store" | "kiosk" | "logout" | "qr";

const PATHS: Record<IconName, React.ReactNode> = {
  bag: <><path d="M4 8h16l-1.2 11.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 8Z" /><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" /></>,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  heart: <path d="M12 20.3S3.8 15 3.8 9.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.2 2.4c0 5.6-8.2 10.9-8.2 10.9Z" />,
  "heart-filled": <path d="M12 20.3S3.8 15 3.8 9.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.2 2.4c0 5.6-8.2 10.9-8.2 10.9Z" fill="currentColor" />,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  print: <><path d="M7 9V3h10v6" /><path d="M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 15h10v6H7z" /></>,
  ruler: <><path d="m15.5 2.5 6 6L8.5 21.5l-6-6z" /><path d="m7 10 2 2" /><path d="m10.5 6.5 2 2" /><path d="m14 3 2 2" /></>,
  phone: <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19.2 19.2 0 0 1-5.9-5.9 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.4 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  locate: <><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
  reset: <><path d="M3 11a9 9 0 1 1 2.6 6.4" /><path d="M3 5.5V11h5.5" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />,
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m15 6 3 3" /></>,
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  sparkle: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18.5 15.5 19 17l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 18l1.5-.5z" /></>,
  person: <><circle cx="12" cy="5" r="2.6" /><path d="M12 8.5V15" /><path d="m9 21 3-6 3 6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  dice: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
  party: <><path d="m3 21 5-13 8 8z" /><path d="M14 3.5c1 1 1 2.5 0 3.5" /><path d="M18 6c1.5 1.5 1.5 4 0 5.5" /><path d="M17.5 2.5 18 4M21 8l-1.5.5M20.5 14l-1.3-.6" /></>,
  "point-down": <><path d="M12 4v13" /><path d="m6.5 11.5 5.5 5.5 5.5-5.5" /></>,
  swap: <><path d="M4 8h15l-3.5-3.5" /><path d="M20 16H5l3.5 3.5" /></>,
  scissors: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5 19 18M19 6 8 16.5" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M5.5 15.5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v.5" /></>,
  open: <><path d="M13.5 4H20v6.5" /><path d="M20 4 10.5 13.5" /><path d="M18.5 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h4.5" /></>,
  camera: <><path d="M3 8.8a2 2 0 0 1 2-2h2.3l1.2-2h6.6l1.2 2H19a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="12.8" r="3.4" /></>,
  download: <><path d="M12 3.5v11" /><path d="m7 10 5 5 5-5" /><path d="M4.5 19.5h15" /></>,
  /* language switcher — the label beside it names the language you'd switch
     TO, written in that language, so the glyph only has to say "language" */
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5Z" /></>,
  share: <><path d="M12 15.5V3.5" /><path d="m7.5 8 4.5-4.5L16.5 8" /><path d="M5.5 13v5.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V13" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m15.8 15.8 4.7 4.7" /></>,
  back: <><path d="M19.5 12h-15" /><path d="m10.5 5.5-6 6.5 6 6.5" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,

  /* ── the dashboard's own vocabulary ──
     One glyph per destination in the nav bar and one per row in the account
     menu. They are drawn at the same optical weight as the set above so a
     26px tab-bar icon and a 1em inline icon read as the same family. */
  home: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.8V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.8" /><path d="M9.8 20.5v-5.2h4.4v5.2" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  /* cloth, not a bolt: three falls of fabric. A rolled bolt drawn at 20px is
     a cylinder, and a cylinder at 20px is a battery. */
  cloth: <><path d="M3 7.2c3-2.2 6-2.2 9 0s6 2.2 9 0" /><path d="M3 12c3-2.2 6-2.2 9 0s6 2.2 9 0" /><path d="M3 16.8c3-2.2 6-2.2 9 0s6 2.2 9 0" /></>,
  /* a hanger — a fit is a finished garment, which is what hangs on one */
  hanger: <><path d="M12 8.2V9.6" /><path d="M12 8.2a2.1 2.1 0 1 1 2.1-2.1" /><path d="m12 9.6 8 5.2a1.6 1.6 0 0 1-.9 3H4.9a1.6 1.6 0 0 1-.9-3l8-5.2Z" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  gear: <><circle cx="12" cy="12" r="3.1" /><path d="M12 2.8h.9l.4 2.3a7.3 7.3 0 0 1 2 .9l1.9-1.4 1.5 1.5-1.4 1.9c.4.6.7 1.3.9 2l2.3.4v2.1l-2.3.4a7.3 7.3 0 0 1-.9 2l1.4 1.9-1.5 1.5-1.9-1.4c-.6.4-1.3.7-2 .9l-.4 2.3h-2.1l-.4-2.3a7.3 7.3 0 0 1-2-.9l-1.9 1.4-1.5-1.5 1.4-1.9a7.3 7.3 0 0 1-.9-2l-2.3-.4v-2.1l2.3-.4c.2-.7.5-1.4.9-2L4.3 6.5l1.5-1.5 1.9 1.4c.6-.4 1.3-.7 2-.9l.4-2.3Z" /></>,
  wallet: <><path d="M3.5 8A2.5 2.5 0 0 1 6 5.5h10.5" /><rect x="3.5" y="8" width="17" height="11.5" rx="2.5" /><circle cx="16" cy="13.8" r="1.3" fill="currentColor" stroke="none" /></>,
  store: <><path d="M4.5 9.8V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V9.8" /><path d="M2.8 9.8 4.6 3.8h14.8l1.8 6" /><path d="M9.3 20.5v-5.7h5.4v5.7" /></>,
  kiosk: <><rect x="4.5" y="3" width="15" height="13.5" rx="2.5" /><path d="M12 16.5v4.2" /><path d="M8.4 20.7h7.2" /></>,
  logout: <><path d="M15.2 8.4V6a2 2 0 0 0-2-2H6.2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2.4" /><path d="M20 12H9.6" /><path d="m16.8 8.8 3.2 3.2-3.2 3.2" /></>,
  /* Three finder squares and a scatter — near enough `grid` to be a cousin,
     which is the point: they are the catalog and the catalog's code. The
     broken bottom-right quadrant is what tells them apart at 14px. */
  qr: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" /><path d="M14 14h3v3h-3z" /><path d="M20.5 14v2M14 20.5h2.5M20 19v1.5h-1.5" /></>,
};

export default function Icon({
  name,
  size = "1em",
  strokeWidth = 1.75,
  label,
  style,
}: {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  /** Only pass when the icon is the sole content of its control. */
  label?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

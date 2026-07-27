"use client";

/* the ee — blinks while the app is "looking" (replaces spinners)

   Lives here rather than inside one screen because it is the brand's whole
   answer to loading: wherever peeq is working on something, the same eyes
   blink over the same dimmed subject. The kiosk dims the shopper's photo; the
   fabric studio dims the cloth. Anything that spins instead is off-brand. */
export default function EeMark({
  size,
  looking,
  color,
}: {
  size: number | string;
  looking?: boolean;
  color?: string;
}) {
  return (
    <span
      className={"ee-mark " + (looking ? "ee-looking" : "ee-blink")}
      style={{ fontSize: size, color: color || "var(--violet)" }}
    >
      <span>ee</span>
    </span>
  );
}

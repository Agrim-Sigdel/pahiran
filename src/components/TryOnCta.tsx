"use client";

import Link from "next/link";
import type { Shop } from "@/lib/types";

/* The "see it on you" button, in its three states. Defined once because the
   storefront alone renders it in four places and the rules are easy to get
   subtly different:

     shop.type !== 'apparel'  → nothing at all. A hardware shop was never
                                offered try-on, so a disabled button would
                                advertise a feature that doesn't apply.
     out of credit            → visible but disabled. The shopper learns the
                                shop has try-on and it's briefly unavailable,
                                which is the nudge that gets the vendor to
                                recharge. Deliberately vague about whose limit
                                it is — "the shop ran out" is the vendor's
                                business, not the shopper's.
     otherwise                → a normal link to the kiosk.

   Callers that lay out their own container should check `offersTryOn()` first
   rather than relying on this returning null, so they don't leave an empty
   flex gap behind. */

export interface TryOnState {
  enabled: boolean;
  left: number;
}

/** Whether try-on applies to this shop at all, ignoring the credit balance. */
export function offersTryOn(shop: Pick<Shop, "type"> | null | undefined): boolean {
  return shop?.type !== "general";
}

/** Whether a shopper can actually start a try-on right now. */
export function canTryOn(shop: Pick<Shop, "type"> | null | undefined, state: TryOnState): boolean {
  return offersTryOn(shop) && state.enabled && state.left > 0;
}

export default function TryOnCta({
  shop, state, href, className, style, children, unavailableStyle,
}: {
  shop: Pick<Shop, "type"> | null | undefined;
  state: TryOnState;
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Extra styling for the disabled variant, for dark surfaces like the footer. */
  unavailableStyle?: React.CSSProperties;
}) {
  if (!offersTryOn(shop)) return null;

  const label = children ?? "see it on you";

  if (!canTryOn(shop, state)) {
    return (
      <span
        aria-disabled="true"
        title="Try-on is unavailable at this shop right now."
        className={className}
        style={{ ...style, opacity: 0.45, cursor: "not-allowed", pointerEvents: "none", ...unavailableStyle }}
      >
        {label} — unavailable
      </span>
    );
  }

  return (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  );
}

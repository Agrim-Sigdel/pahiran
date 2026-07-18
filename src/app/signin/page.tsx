"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthPage from "@/components/AuthPage";

/* Shopper sign-in. Vendors have their own surface at /login; old
   /signin?intent=vendor links forward there. */

function ShopperSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const isVendorLink = params.get("intent") === "vendor";

  useEffect(() => {
    if (isVendorLink) router.replace("/login");
  }, [isVendorLink, router]);

  if (isVendorLink) return null;
  return <AuthPage intent="shopper" />;
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <ShopperSignIn />
    </Suspense>
  );
}

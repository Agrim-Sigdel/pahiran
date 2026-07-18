"use client";

import AuthPage from "@/components/AuthPage";

/* Vendor sign-in — the surface /dashboard, /kiosk and the owner landing page
   funnel to. Shoppers sign in at /signin. */

export default function LoginPage() {
  return <AuthPage intent="vendor" />;
}

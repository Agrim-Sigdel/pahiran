"use client";

import { Suspense } from "react";
import AuthPage from "@/components/AuthPage";

/* Vendor sign-in — the surface /dashboard, /kiosk and the owner landing page
   funnel to. Shoppers sign in at /signin.

   Suspense because AuthPage reads ?mode: the owner page's "create your shop
   free" buttons now arrive as /login?mode=signup, so acquisition traffic
   lands on a form that asks a new vendor to choose a password rather than one
   headed "vendor sign in" demanding a password they have never set. */

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage intent="vendor" />
    </Suspense>
  );
}

import { redirect } from "next/navigation";

/* Vendor sign-in moved into the unified /signin. This route stays for old
   bookmarks / links and forwards with the vendor intent preselected. */

export default function LoginPage() {
  redirect("/signin?intent=vendor");
}

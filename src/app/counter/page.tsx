import { redirect } from "next/navigation";

/* /counter: the address of the counter bench. Typed or bookmarked on the
   shop's own device, it lands in the dashboard with the counter already open.
   Signed out, the dashboard bounces through /login carrying this destination,
   so the vendor signs in once and still lands at the counter. */
export default function CounterPage() {
  redirect("/dashboard?counter=1");
}

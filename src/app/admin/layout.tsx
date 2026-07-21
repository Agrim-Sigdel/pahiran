import AdminShell from "./AdminShell";

/* Wraps every /admin route in the console frame and its auth guard. */

export const metadata = {
  title: "peeq admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

import { notFound } from "next/navigation";
import CompareClient from "./CompareClient";

/* Dev-only provider benchmark page — see api/compare/route.ts. */
export default function ComparePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CompareClient />;
}

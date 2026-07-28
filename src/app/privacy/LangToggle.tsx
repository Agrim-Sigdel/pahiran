"use client";

import { useRouter } from "next/navigation";
import { persistLang, type Lang } from "@/lib/lang";

/* The only interactive thing on /privacy, so it is the only thing that ships
   as a client component. Writes the preference and asks the server for the
   page again — the language is decided server-side now, which is what removes
   the flash of English a Nepali reader used to get. */
export default function LangToggle({ current }: { current: Lang }) {
  const router = useRouter();
  const next: Lang = current === "en" ? "ne" : "en";
  return (
    <button className="ph-btn" lang={next}
      onClick={() => { persistLang(next); router.refresh(); }}
      style={{ color: "var(--violet)", fontSize: 14, fontWeight: 600 }}>
      {current === "en" ? "नेपाली" : "English"}
    </button>
  );
}

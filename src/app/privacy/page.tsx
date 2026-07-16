"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* Plain-language privacy policy with an English ⇄ Nepali switcher (not both
   stacked). Linked from the kiosk consent screen and every footer. Reflects
   the product's real data flow: shopper photos are processed for try-on and
   never kept by the shop; renders live in private storage and on the shopper's
   own device. */

type Lang = "en" | "ne";
const EMAIL = "siliconpeaksvc@gmail.com";
const ul = (items: React.ReactNode[]): React.ReactNode => (
  <ul style={{ paddingLeft: 20, margin: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const mail = <a href={"mailto:" + EMAIL} style={{ color: "var(--violet)" }}>{EMAIL}</a>;

const CONTENT: Record<Lang, { updated: string; sections: { title: string; body: React.ReactNode }[] }> = {
  en: {
    updated: "Last updated 16 July 2026.",
    sections: [
      {
        title: "Your photo",
        body: "When you take or upload a photo to try clothes on, it is used for one thing only: to generate a picture of you wearing the selected garment. To do that, your photo is sent to our try-on AI providers (FASHN, via fal.ai, and OpenAI) purely to create that image. The shop never receives or keeps your photo.",
      },
      {
        title: "What we keep, and where",
        body: ul([
          <><b>Try-on results</b> are stored privately and shown to you through short-lived, signed links — they are not on any public web address.</>,
          <><b>Saved looks and your “remember my photo” photo</b> live only on the device you used, inside your browser. They are never uploaded to our servers. You can delete them anytime from “my looks”, and the remembered photo expires on its own after 7 days.</>,
          <><b>If you tap “I want this,”</b> the name and phone number you enter are sent to that shop so they can reach you about the item. Only then.</>,
          <>We keep an <b>anonymous count</b> of try-ons (no photo, no identity) so shops can see which items are popular.</>,
        ]),
      },
      {
        title: "What we don't do",
        body: "We do not sell your data. We do not use your photo to train AI models. We do not post anything for you — sharing a look only happens when you tap share.",
      },
      {
        title: "Your choices",
        body: <>You can use “forget my saved photo” and “delete all” in <b>my looks</b> to remove everything stored on your device at once. For anything held server-side (a try-on render, a lead you sent a shop), contact us and we'll remove it.</>,
      },
      {
        title: "Vendors",
        body: "Shop accounts store the email you sign up with and the catalog, contact and location details you enter. You can edit these in your dashboard or ask us to close the account.",
      },
      { title: "Contact", body: <>Questions or a deletion request? Email {mail}.</> },
    ],
  },
  ne: {
    updated: "पछिल्लो अद्यावधिक: १६ जुलाई २०२६।",
    sections: [
      {
        title: "तपाईंको फोटो",
        body: "लुगा लगाएर हेर्न फोटो खिच्दा वा अपलोड गर्दा, त्यो एउटै कामका लागि प्रयोग हुन्छ — तपाईंले छानेको लुगा तपाईंमा कस्तो देखिन्छ भन्ने तस्बिर बनाउन। यसका लागि तपाईंको फोटो हाम्रो ट्राई-अन AI सेवा (fal.ai मार्फत FASHN, र OpenAI) मा त्यही तस्बिर बनाउन मात्र पठाइन्छ। पसलले तपाईंको फोटो कहिल्यै पाउँदैन वा राख्दैन।",
      },
      {
        title: "के राखिन्छ, कहाँ",
        body: ul([
          <><b>ट्राई-अन नतिजा</b> निजी रूपमा राखिन्छ र तपाईंलाई छोटो समयका लागि मात्र चल्ने सुरक्षित लिंकबाट देखाइन्छ — कुनै सार्वजनिक ठेगानामा हुँदैन।</>,
          <><b>सेभ गरिएका लुक र “मेरो फोटो सम्झनुहोस्” फोटो</b> तपाईंले प्रयोग गरेको डिभाइसमा, तपाईंको ब्राउजरभित्र मात्र रहन्छ। हाम्रो सर्भरमा अपलोड हुँदैन। “मेरा लुक” बाट जहिले पनि मेटाउन सकिन्छ, र सम्झिएको फोटो ७ दिनमा आफैँ हराउँछ।</>,
          <><b>“मलाई यो चाहियो” थिच्दा</b> मात्र तपाईंले लेखेको नाम र फोन नम्बर पसललाई पठाइन्छ, ताकि तिनीहरूले सम्पर्क गर्न सकून्।</>,
          <>कुन लुगा लोकप्रिय छ भनी पसलले हेर्न सकून् भनेर हामी <b>बेनामी गणना</b> मात्र राख्छौं (फोटो वा पहिचान होइन)।</>,
        ]),
      },
      {
        title: "हामी के गर्दैनौं",
        body: "हामी तपाईंको डाटा बेच्दैनौं। तपाईंको फोटो AI मोडेल तालिम दिन प्रयोग गर्दैनौं। तपाईंको तर्फबाट केही पोस्ट गर्दैनौं — तपाईंले “सेयर” थिचेमा मात्र लुक सेयर हुन्छ।",
      },
      {
        title: "तपाईंका विकल्पहरू",
        body: <><b>मेरा लुक</b> मा “मेरो फोटो मेटाउनुहोस्” र “सबै मेटाउनुहोस्” प्रयोग गरेर यस डिभाइसमा राखिएको सबै एकैचोटि हटाउन सकिन्छ। सर्भरमा रहेको कुनै कुरा (ट्राई-अन तस्बिर, पसललाई पठाएको अनुरोध) हटाउन हामीलाई सम्पर्क गर्नुहोस्।</>,
      },
      {
        title: "पसलहरू",
        body: "पसल खातामा तपाईंले साइन अप गर्दा प्रयोग गरेको इमेल र तपाईंले हाल्नुभएको क्याटलग, सम्पर्क र स्थान विवरण रहन्छ। यी ड्यासबोर्डबाट सम्पादन गर्न वा खाता बन्द गर्न भन्न सक्नुहुन्छ।",
      },
      { title: "सम्पर्क", body: <>प्रश्न वा मेटाउने अनुरोध? {mail} मा इमेल गर्नुहोस्।</> },
    ],
  },
};

export default function PrivacyPage() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    document.title = "Privacy · peeq";
    try {
      const saved = localStorage.getItem("pahiran:lang");
      if (saved === "ne" || saved === "en") setLang(saved);
    } catch {}
  }, []);
  const toggle = () => {
    const next: Lang = lang === "en" ? "ne" : "en";
    setLang(next);
    try { localStorage.setItem("pahiran:lang", next); } catch {}
  };

  const c = CONTENT[lang];
  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <nav className="efc-nav">
        <div className="nav-links"><Link href="/">← home</Link></div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: 24 }}>p<span className="ee">ee</span>q</div>
        </div>
        <div className="nav-tools">
          <button className="ph-btn" onClick={toggle} style={{ color: "var(--violet)", fontSize: 14 }}>
            {lang === "en" ? "नेपाली" : "English"}
          </button>
        </div>
      </nav>

      <article style={{ maxWidth: 720, margin: "0 auto", padding: "20px 22px 70px", lineHeight: 1.7, fontSize: 15.5 }}>
        <h1 className="ph-display" style={{ fontSize: "clamp(30px, 5vw, 40px)", margin: "10px 0 6px" }}>
          {lang === "en" ? "privacy" : "गोपनीयता"}
        </h1>
        <p style={{ color: "var(--stone)", marginTop: 0 }}>{c.updated}</p>

        {c.sections.map((s) => (
          <section key={s.title} style={{ marginTop: 26 }}>
            <h3 className="ph-display" style={{ fontSize: 19, margin: "0 0 6px", color: "var(--ink)" }}>{s.title}</h3>
            <div style={{ color: "var(--stone)" }}>{s.body}</div>
          </section>
        ))}
      </article>

      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.6)", padding: "26px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 22, color: "var(--paper)" }}>p<span className="ee">ee</span>q</div>
      </footer>
    </main>
  );
}

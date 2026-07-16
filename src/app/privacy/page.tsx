import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy · peeq",
  description: "How peeq handles your photo and details. तपाईंको फोटो र विवरण peeq कसरी प्रयोग गर्छ।",
};

/* Plain-language privacy policy, English + Nepali. Linked from the kiosk
   consent screen and every footer. Reflects the product's actual data flow:
   shopper photos are processed for try-on and never kept by the shop; renders
   live in private storage and on the shopper's own device. */

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <nav className="efc-nav">
        <div className="nav-links"><Link href="/">← home</Link></div>
        <div className="nav-logo">
          <div className="wordmark" style={{ fontSize: 24 }}>p<span className="ee">ee</span>q</div>
        </div>
        <div className="nav-tools" />
      </nav>

      <article style={{ maxWidth: 720, margin: "0 auto", padding: "20px 22px 70px", lineHeight: 1.7, fontSize: 15.5 }}>
        <h1 className="ph-display" style={{ fontSize: "clamp(30px, 5vw, 40px)", margin: "10px 0 6px" }}>privacy</h1>
        <p style={{ color: "var(--stone)", marginTop: 0 }}>Last updated 16 July 2026.</p>

        {/* ── English ── */}
        <Section title="Your photo">
          When you take or upload a photo to try clothes on, it is used for one thing only: to
          generate a picture of you wearing the selected garment. To do that, your photo is sent to
          our try-on AI providers (FASHN, via fal.ai, and OpenAI) purely to create that image. The
          shop never receives or keeps your photo.
        </Section>
        <Section title="What we keep, and where">
          <ul style={ulStyle}>
            <li><b>Try-on results</b> are stored privately and shown to you through short-lived,
              signed links — they are not on any public web address.</li>
            <li><b>Saved looks and your “remember my photo” photo</b> live only on the device you
              used, inside your browser. They are never uploaded to our servers. You can delete them
              anytime from “my looks”, and the remembered photo expires on its own after 7 days.</li>
            <li><b>If you tap “I want this,”</b> the name and phone number you enter are sent to that
              shop so they can reach you about the item. Only then.</li>
            <li>We keep an <b>anonymous count</b> of try-ons (no photo, no identity) so shops can see
              which items are popular.</li>
          </ul>
        </Section>
        <Section title="What we don't do">
          We do not sell your data. We do not use your photo to train AI models. We do not post
          anything for you — sharing a look only happens when you tap share.
        </Section>
        <Section title="Your choices">
          You can use “forget my saved photo” and “delete all” in <b>my looks</b> to remove
          everything stored on your device at once. For anything held server-side (a try-on render, a
          lead you sent a shop), contact us and we'll remove it.
        </Section>
        <Section title="Vendors">
          Shop accounts store the email you sign up with and the catalog, contact and location
          details you enter. You can edit these in your dashboard or ask us to close the account.
        </Section>
        <Section title="Contact">
          Questions or a deletion request? Email{" "}
          <a href="mailto:siliconpeaksvc@gmail.com" style={{ color: "var(--violet)" }}>siliconpeaksvc@gmail.com</a>.
        </Section>

        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "40px 0" }} />

        {/* ── नेपाली ── */}
        <h2 className="ph-display" style={{ fontSize: 26, margin: "0 0 10px" }}>गोपनीयता (नेपालीमा)</h2>
        <Section title="तपाईंको फोटो">
          लुगा लगाएर हेर्न फोटो खिच्दा वा अपलोड गर्दा, त्यो एउटै कामका लागि प्रयोग हुन्छ — तपाईंले छानेको लुगा
          तपाईंमा कस्तो देखिन्छ भन्ने तस्बिर बनाउन। यसका लागि तपाईंको फोटो हाम्रो ट्राई-अन AI सेवा (fal.ai मार्फत
          FASHN, र OpenAI) मा त्यही तस्बिर बनाउन मात्र पठाइन्छ। पसलले तपाईंको फोटो कहिल्यै पाउँदैन वा राख्दैन।
        </Section>
        <Section title="के राखिन्छ, कहाँ">
          <ul style={ulStyle}>
            <li><b>ट्राई-अन नतिजा</b> निजी रूपमा राखिन्छ र तपाईंलाई छोटो समयका लागि मात्र चल्ने सुरक्षित लिंकबाट
              देखाइन्छ — कुनै सार्वजनिक ठेगानामा हुँदैन।</li>
            <li><b>सेभ गरिएका लुक र “मेरो फोटो सम्झनुहोस्” फोटो</b> तपाईंले प्रयोग गरेको डिभाइसमा, तपाईंको ब्राउजरभित्र
              मात्र रहन्छ। हाम्रो सर्भरमा अपलोड हुँदैन। “मेरा लुक” बाट जहिले पनि मेटाउन सकिन्छ, र सम्झिएको फोटो ७ दिनमा
              आफैँ हराउँछ।</li>
            <li><b>“मलाई यो चाहियो” थिच्दा</b> मात्र तपाईंले लेखेको नाम र फोन नम्बर पसललाई पठाइन्छ, ताकि तिनीहरूले
              सम्पर्क गर्न सकून्।</li>
            <li>कुन लुगा लोकप्रिय छ भनी पसलले हेर्न सकून् भनेर हामी <b>बेनामी गणना</b> मात्र राख्छौं (फोटो वा पहिचान होइन)।</li>
          </ul>
        </Section>
        <Section title="हामी के गर्दैनौं">
          हामी तपाईंको डाटा बेच्दैनौं। तपाईंको फोटो AI मोडेल तालिम दिन प्रयोग गर्दैनौं। तपाईंको तर्फबाट केही पोस्ट
          गर्दैनौं — तपाईंले “सेयर” थिचेमा मात्र लुक सेयर हुन्छ।
        </Section>
        <Section title="सम्पर्क">
          प्रश्न वा मेटाउने अनुरोध?{" "}
          <a href="mailto:siliconpeaksvc@gmail.com" style={{ color: "var(--violet)" }}>siliconpeaksvc@gmail.com</a> मा इमेल गर्नुहोस्।
        </Section>
      </article>

      <footer style={{ background: "var(--ink)", color: "rgba(250,246,240,.6)", padding: "26px 20px", textAlign: "center" }}>
        <div className="wordmark" style={{ fontSize: 22, color: "var(--paper)" }}>p<span className="ee">ee</span>q</div>
      </footer>
    </main>
  );
}

const ulStyle: React.CSSProperties = { paddingLeft: 20, margin: "8px 0", display: "flex", flexDirection: "column", gap: 8 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h3 className="ph-display" style={{ fontSize: 19, margin: "0 0 6px", color: "var(--ink)" }}>{title}</h3>
      <div style={{ color: "var(--stone)" }}>{children}</div>
    </section>
  );
}

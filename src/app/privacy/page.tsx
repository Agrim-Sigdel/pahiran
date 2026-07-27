import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import LangToggle from "./LangToggle";
import { LANG_COOKIE, isLang, type Lang } from "@/lib/lang";

/* Plain-language privacy policy with an English ⇄ Nepali switcher (not both
   stacked). Linked from the kiosk consent screen and every footer.

   A server component, reading the language from a cookie. It used to be a
   client component that read localStorage in an effect, so a Nepali reader
   was served a screen of English and watched it swap — on the page whose
   whole job is being understood.

   The copy below describes what the code actually does. It previously said
   saved looks and the remembered photo "live only on the device you used …
   they are never uploaded to our servers", which stopped being true when
   accounts landed: lib/looks.ts uploads both to Supabase Storage for a
   signed-in shopper, and the account page advertises exactly that sync two
   screens away. A privacy policy that contradicts the product is worse than
   no policy, so this one distinguishes the two cases the code distinguishes —
   signed in (cloud, yours, deletable) and signed out (device only, 7 days). */

export const metadata: Metadata = {
  title: "Privacy · peeq",
  description: "How peeq handles your photo, your saved looks and your details.",
};

const EMAIL = "contact@agrimsigdel.com.np";
const ul = (items: React.ReactNode[]): React.ReactNode => (
  <ul style={{ paddingLeft: 20, margin: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const mail = <a href={"mailto:" + EMAIL} style={{ color: "var(--violet)" }}>{EMAIL}</a>;

const CONTENT: Record<Lang, { updated: string; sections: { title: string; body: React.ReactNode }[] }> = {
  en: {
    updated: "Last updated 27 July 2026.",
    sections: [
      {
        title: "Your photo",
        body: "When you take or upload a photo to try clothes on, it is used for one thing only: to generate a picture of you wearing the selected garment. To do that, your photo is sent to our try-on AI providers (FASHN, via fal.ai, and OpenAI) purely to create that image. The shop never receives or keeps your photo.",
      },
      {
        title: "What we keep, and where",
        body: (
          <>
            Where your saved looks and your “remember my photo” photo live depends on
            whether you are signed in to a peeq account.
            {ul([
              <><b>Signed out</b> — saved looks and the remembered photo stay on the device you
                used, inside your browser, and are never uploaded to us. The remembered photo
                expires on its own after 7 days.</>,
              <><b>Signed in</b> — so that your looks follow you between your phone and a shop's
                tablet, they are uploaded to private storage on our servers under your account,
                and so is the remembered photo if you ask us to remember it. Only you can see
                them: they are served to you through short-lived signed links and are on no
                public web address. They stay until you delete them — the 7-day expiry applies
                to the device copy, not this one. “delete everything” on your account page
                removes the lot, immediately.</>,
              <><b>Try-on results</b> are stored privately either way and shown to you through
                short-lived, signed links.</>,
              <><b>If you tap “I want this,”</b> the name and phone number you enter are sent to
                that shop so they can reach you about the item. Only then.</>,
              <>We keep an <b>anonymous count</b> of try-ons (no photo, no identity) so shops can
                see which items are popular.</>,
            ])}
          </>
        ),
      },
      {
        title: "Shared shop tablets",
        body: "A tablet in a shop can be put into shared mode, and should be. In shared mode peeq never offers to remember a photo, never keeps saved looks on the device, never pre-fills a name or number, and clears the whole session — including signing out any account used on it — when the shopper walks away or the screen sits idle.",
      },
      {
        title: "What we don't do",
        body: "We do not sell your data. We do not use your photo to train AI models. We do not post anything for you — sharing a look only happens when you tap share.",
      },
      {
        title: "Your choices",
        body: (
          <>
            <b>Signed out:</b> “forget my saved photo” and “delete all” in <b>my looks</b> remove
            everything stored on that device at once.
            {" "}
            <b>Signed in:</b> “delete everything” on your <Link href="/account" style={{ color: "var(--violet)" }}>account page</Link> deletes
            your saved looks and your remembered photo from our servers as well as this device,
            and individual looks can be deleted one at a time. For anything else held
            server-side (a lead you sent a shop, your shop account), email us and we'll remove it.
          </>
        ),
      },
      {
        title: "Vendors",
        body: "Shop accounts store the email you sign up with and the catalog, contact and location details you enter. You can edit these in your dashboard or ask us to close the account.",
      },
      { title: "Contact", body: <>Questions or a deletion request? Email {mail}.</> },
    ],
  },
  ne: {
    updated: "पछिल्लो अद्यावधिक: २७ जुलाई २०२६।",
    sections: [
      {
        title: "तपाईंको फोटो",
        body: "लुगा लगाएर हेर्न फोटो खिच्दा वा अपलोड गर्दा, त्यो एउटै कामका लागि प्रयोग हुन्छ — तपाईंले छानेको लुगा तपाईंमा कस्तो देखिन्छ भन्ने तस्बिर बनाउन। यसका लागि तपाईंको फोटो हाम्रो ट्राई-अन AI सेवा (fal.ai मार्फत FASHN, र OpenAI) मा त्यही तस्बिर बनाउन मात्र पठाइन्छ। पसलले तपाईंको फोटो कहिल्यै पाउँदैन वा राख्दैन।",
      },
      {
        title: "के राखिन्छ, कहाँ",
        body: (
          <>
            तपाईंका सेभ गरिएका लुक र “मेरो फोटो सम्झनुहोस्” फोटो कहाँ रहन्छ भन्ने कुरा
            तपाईं peeq खातामा साइन इन हुनुहुन्छ कि छैन भन्नेमा निर्भर छ।
            {ul([
              <><b>साइन इन नगरेको अवस्थामा</b> — सेभ गरिएका लुक र सम्झिएको फोटो तपाईंले प्रयोग
                गरेको डिभाइसमा, तपाईंको ब्राउजरभित्रै रहन्छ; हामीकहाँ अपलोड हुँदैन। सम्झिएको
                फोटो ७ दिनमा आफैँ हराउँछ।</>,
              <><b>साइन इन गरेको अवस्थामा</b> — तपाईंका लुक तपाईंको फोन र पसलको ट्याब्लेट दुवैमा
                देखियून् भनेर ती हाम्रो सर्भरको निजी भण्डारणमा, तपाईंकै खातामुनि अपलोड हुन्छन्;
                तपाईंले भन्नुभएमा सम्झिएको फोटो पनि। ती तपाईंले मात्र देख्न सक्नुहुन्छ — छोटो
                समय मात्र चल्ने सुरक्षित लिंकबाट देखाइन्छ, कुनै सार्वजनिक ठेगानामा हुँदैन।
                तपाईंले नमेटाएसम्म रहन्छन् — ७ दिनको सीमा डिभाइसको प्रतिलाई मात्र लागू हुन्छ।
                खाता पृष्ठको “सबै मेटाउनुहोस्” ले सबै तुरुन्तै हटाउँछ।</>,
              <><b>ट्राई-अन नतिजा</b> दुवै अवस्थामा निजी रूपमा राखिन्छ र छोटो समय चल्ने
                सुरक्षित लिंकबाट मात्र देखाइन्छ।</>,
              <><b>“मलाई यो चाहियो” थिच्दा</b> मात्र तपाईंले लेखेको नाम र फोन नम्बर पसललाई
                पठाइन्छ, ताकि तिनीहरूले सम्पर्क गर्न सकून्।</>,
              <>कुन लुगा लोकप्रिय छ भनी पसलले हेर्न सकून् भनेर हामी <b>बेनामी गणना</b> मात्र
                राख्छौं (फोटो वा पहिचान होइन)।</>,
            ])}
          </>
        ),
      },
      {
        title: "पसलका साझा ट्याब्लेट",
        body: "पसलमा राखिएको ट्याब्लेटलाई साझा मोडमा राख्न सकिन्छ, र राख्नुपर्छ। साझा मोडमा peeq ले फोटो सम्झने प्रस्ताव गर्दैन, सेभ गरिएका लुक डिभाइसमा राख्दैन, नाम वा नम्बर पहिल्यै भर्दैन, र ग्राहक गएपछि वा स्क्रिन केही बेर नछोइएपछि सम्पूर्ण सत्र मेटाउँछ — त्यसमा प्रयोग गरिएको खाताबाट साइन आउट गरेर।",
      },
      {
        title: "हामी के गर्दैनौं",
        body: "हामी तपाईंको डाटा बेच्दैनौं। तपाईंको फोटो AI मोडेल तालिम दिन प्रयोग गर्दैनौं। तपाईंको तर्फबाट केही पोस्ट गर्दैनौं — तपाईंले “सेयर” थिचेमा मात्र लुक सेयर हुन्छ।",
      },
      {
        title: "तपाईंका विकल्पहरू",
        body: (
          <>
            <b>साइन इन नगरेको भए:</b> <b>मेरा लुक</b> मा “मेरो फोटो मेटाउनुहोस्” र “सबै
            मेटाउनुहोस्” ले त्यस डिभाइसमा राखिएको सबै एकैचोटि हटाउँछ।
            {" "}
            <b>साइन इन गरेको भए:</b> <Link href="/account" style={{ color: "var(--violet)" }}>खाता पृष्ठ</Link> को “सबै
            मेटाउनुहोस्” ले तपाईंका सेभ गरिएका लुक र सम्झिएको फोटो डिभाइस र हाम्रो सर्भर
            दुवैबाट मेटाउँछ; एक-एक लुक छुट्टै पनि मेटाउन सकिन्छ। सर्भरमा रहेको अरू कुरा
            (पसललाई पठाएको अनुरोध, तपाईंको पसल खाता) हटाउन हामीलाई इमेल गर्नुहोस्।
          </>
        ),
      },
      {
        title: "पसलहरू",
        body: "पसल खातामा तपाईंले साइन अप गर्दा प्रयोग गरेको इमेल र तपाईंले हाल्नुभएको क्याटलग, सम्पर्क र स्थान विवरण रहन्छ। यी ड्यासबोर्डबाट सम्पादन गर्न वा खाता बन्द गर्न भन्न सक्नुहुन्छ।",
      },
      { title: "सम्पर्क", body: <>प्रश्न वा मेटाउने अनुरोध? {mail} मा इमेल गर्नुहोस्।</> },
    ],
  },
};

export default async function PrivacyPage() {
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : "en";
  const c = CONTENT[lang];

  return (
    <main lang={lang} style={{ minHeight: "100dvh", background: "var(--paper)", color: "var(--ink)" }}>
      <nav className="efc-nav">
        <div className="nav-links"><Link href="/">← home</Link></div>
        <div className="nav-logo">
          <Link href="/" className="wordmark" style={{ fontSize: 24, textDecoration: "none" }}>
            p<span className="ee">ee</span>q
          </Link>
        </div>
        <div className="nav-tools">
          <LangToggle current={lang} />
        </div>
      </nav>

      <article id="main" style={{ maxWidth: 720, margin: "0 auto", padding: "20px 22px 70px", lineHeight: 1.7, fontSize: 15.5 }}>
        <h1 className="ph-display" style={{ fontSize: "clamp(30px, 5vw, 40px)", margin: "10px 0 6px" }}>
          {lang === "en" ? "privacy" : "गोपनीयता"}
        </h1>
        <p style={{ color: "var(--stone)", marginTop: 0 }}>{c.updated}</p>

        {/* h2, not h3: these are the sections directly under the h1, and
            skipping a level is how a screen-reader user loses the outline. */}
        {c.sections.map((s) => (
          <section key={s.title} style={{ marginTop: 26 }}>
            <h2 className="ph-display" style={{ fontSize: 19, margin: "0 0 6px", color: "var(--ink)" }}>{s.title}</h2>
            <div style={{ color: "var(--stone)" }}>{s.body}</div>
          </section>
        ))}
      </article>

      {/* The footer had no links at all — not even home — on a page reached
          from a kiosk consent screen, where "home" is the only way onward. */}
      <footer style={{ background: "var(--slab)", color: "var(--on-slab-quiet)", padding: "26px 20px", textAlign: "center" }}>
        <Link href="/" className="wordmark" style={{ fontSize: 22, color: "var(--on-slab)", textDecoration: "none" }}>
          p<span className="ee">ee</span>q
        </Link>
        <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", marginTop: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "var(--on-slab-quiet)" }}>{lang === "en" ? "home" : "गृहपृष्ठ"}</Link>
          <Link href="/owner" style={{ color: "var(--on-slab-quiet)" }}>{lang === "en" ? "for shops" : "पसलहरूका लागि"}</Link>
          <a href={"mailto:" + EMAIL} style={{ color: "var(--on-slab-quiet)" }}>{lang === "en" ? "contact" : "सम्पर्क"}</a>
        </div>
      </footer>
    </main>
  );
}

"use client";

/* Kiosk localisation — English + Nepali. Shopper-facing strings only;
   the vendor dashboard stays English. The toggle persists per device. */

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ne";

const en = {
  switchLang: "नेपाली",
  myLooksBtn: (n: number) => `♥ My looks (${n})`,
  startOver: "↺ Start over",
  exitKiosk: "Exit kiosk",

  virtualTrialRoom: "Virtual trial room",
  headline1: "Try it on —",
  headline2: "without trying it on.",
  attractSub: (n: number) =>
    `Take one photo, then browse ${n} piece${n !== 1 ? "s" : ""} from this shop and see them on you.`,
  tapToBegin: "Tap to begin",
  seeItOnYou: "See it on you",

  consentTitle: "Your photo, your call",
  consentB1: "Your photo is used only to show these clothes on you.",
  consentB2: "It is sent securely to our AI try-on service and processed there — the shop never keeps a copy.",
  consentB3: "Nothing is stored unless you choose “Save look” or “Remember my photo” — and that stays on this device only, deletable anytime.",
  consentB4: "No account, no name, no phone number needed.",
  notNow: "Not now",
  agreeTakePhoto: "I agree — take my photo",
  useLastPhoto: "Use my last photo",
  forgetSavedPhoto: "Forget my saved photo",

  standBack: "Stand back so we can see you fully",
  cameraUnavailable: "Camera isn't available here.",
  tapAnywhere: "Tap anywhere in this box",
  uploadInstead: "to upload a full-body photo instead.",
  startingCamera: "Starting camera…",
  takePhoto: "📸 Take photo",
  uploadPhoto: "Upload a photo",
  rememberPhoto: "Remember my photo on this device for 7 days",
  rememberedNote: "Saved only on this device — delete it anytime from the consent screen.",
  notSavedNote: "Your photo stays on this screen — it is never saved.",
  couldNotReadPhoto: "Could not read that photo.",

  genMessages: ["Reading your pose…", "Draping the fabric…", "Matching the light…", "Stitching the details…", "Final touches…"],
  genFooter: "AI try-on · usually 15–30 seconds",

  pickAPiece: "👇 Pick a piece from the rack below",
  sizes: "Sizes:",
  aiResultNote: "✨ AI try-on · ask staff to see it in person",
  iWantThis: "🙋 I want this",
  saveLook: "♡ Save look",
  savedLook: "♥ Saved",
  savingLook: "Saving…",
  previewNotice: "AI try-on unavailable here — showing a positioning preview instead.",
  sizeSlider: "Size",
  dragToPosition: "Drag the garment to position · preview mode",
  retakePhoto: "Retake my photo",

  tellShop: "Tell the shop",
  optionalNote: (g: string, p: string) => `${g} · ${p} — name and number are optional.`,
  yourName: "Your name (optional)",
  phoneOptional: "Phone (optional)",
  sendFailed: "Could not send — please tell the staff directly.",
  cancel: "Cancel",
  sending: "Sending…",
  shopKnows: "The shop knows!",
  shopKnowsDesc: (name: string, size: string) =>
    `${name}${size ? " · size " + size : ""} is saved to the shop's list. Show this screen to staff or keep browsing.`,
  keepBrowsing: "Keep browsing",
  chatWhatsApp: "Chat on WhatsApp",

  myLooksTitle: "My looks",
  myLooksSub: "saved only on this device · show staff your ♥ favourites",
  deleteAll: "Delete all",
  close: "✕ Close",
  nothingSaved: "Nothing saved yet — tap “♡ Save look” after a try-on to keep it here.",
  share: "Share",
  del: "Delete",
  confirmDeleteAll: "Delete all saved looks and your remembered photo from this device?",
};

const ne: typeof en = {
  switchLang: "English",
  myLooksBtn: (n: number) => `♥ मेरा लुक (${n})`,
  startOver: "↺ फेरि सुरु",
  exitKiosk: "बाहिर निस्कनुहोस्",

  virtualTrialRoom: "भर्चुअल ट्रायल रुम",
  headline1: "नलगाईकनै —",
  headline2: "लगाएर हेर्नुहोस्।",
  attractSub: (n: number) =>
    `एउटा फोटो खिच्नुहोस्, अनि यस पसलका ${n} वटा लुगा आफूमा लगाएर हेर्नुहोस्।`,
  tapToBegin: "सुरु गर्न ट्याप गर्नुहोस्",
  seeItOnYou: "आफूमा हेर्नुहोस्",

  consentTitle: "तपाईंको फोटो, तपाईंको निर्णय",
  consentB1: "तपाईंको फोटो यी लुगाहरू तपाईंमा देखाउन मात्र प्रयोग हुन्छ।",
  consentB2: "यो सुरक्षित रूपमा AI सेवामा पठाइन्छ र त्यहीँ प्रोसेस हुन्छ — पसलले कहिल्यै कपी राख्दैन।",
  consentB3: "तपाईंले “लुक सेभ गर्नुहोस्” वा “फोटो सम्झनुहोस्” नरोजेसम्म केही पनि सेभ हुँदैन — रोज्नुभयो भने पनि यही डिभाइसमा मात्र रहन्छ, जहिले पनि मेटाउन सकिन्छ।",
  consentB4: "खाता, नाम वा फोन नम्बर केही चाहिँदैन।",
  notNow: "अहिले होइन",
  agreeTakePhoto: "मन्जुर छ — फोटो खिच्नुहोस्",
  useLastPhoto: "अघिल्लो फोटो प्रयोग गर्नुहोस्",
  forgetSavedPhoto: "सेभ गरेको फोटो मेटाउनुहोस्",

  standBack: "पूरै देखिने गरी अलि पर उभिनुहोस्",
  cameraUnavailable: "यहाँ क्यामेरा उपलब्ध छैन।",
  tapAnywhere: "यो बाकसभित्र जहाँसुकै ट्याप गर्नुहोस्",
  uploadInstead: "र पूरा शरीर देखिने फोटो अपलोड गर्नुहोस्।",
  startingCamera: "क्यामेरा खुल्दैछ…",
  takePhoto: "📸 फोटो खिच्नुहोस्",
  uploadPhoto: "फोटो अपलोड गर्नुहोस्",
  rememberPhoto: "मेरो फोटो यो डिभाइसमा ७ दिनसम्म सम्झनुहोस्",
  rememberedNote: "यही डिभाइसमा मात्र सेभ हुन्छ — जहिले पनि मेटाउन सकिन्छ।",
  notSavedNote: "तपाईंको फोटो यही स्क्रिनमा मात्र रहन्छ — कहिल्यै सेभ हुँदैन।",
  couldNotReadPhoto: "फोटो पढ्न सकिएन।",

  genMessages: ["तपाईंको पोज हेर्दै…", "कपडा ओढाउँदै…", "उज्यालो मिलाउँदै…", "बुट्टा सिलाउँदै…", "अन्तिम टच…"],
  genFooter: "AI ट्राई-अन · प्रायः १५–३० सेकेन्ड",

  pickAPiece: "👇 तलको र्‍याकबाट एउटा लुगा छान्नुहोस्",
  sizes: "साइज:",
  aiResultNote: "✨ AI ट्राई-अन · सक्कली हेर्न स्टाफलाई भन्नुहोस्",
  iWantThis: "🙋 मलाई यो चाहियो",
  saveLook: "♡ लुक सेभ गर्नुहोस्",
  savedLook: "♥ सेभ भयो",
  savingLook: "सेभ हुँदैछ…",
  previewNotice: "AI ट्राई-अन अहिले उपलब्ध छैन — साधारण प्रिभ्यु देखाइँदैछ।",
  sizeSlider: "साइज",
  dragToPosition: "लुगा तानेर मिलाउनुहोस् · प्रिभ्यु मोड",
  retakePhoto: "फेरि फोटो खिच्नुहोस्",

  tellShop: "पसललाई भन्नुहोस्",
  optionalNote: (g: string, p: string) => `${g} · ${p} — नाम र नम्बर वैकल्पिक हो।`,
  yourName: "तपाईंको नाम (वैकल्पिक)",
  phoneOptional: "फोन (वैकल्पिक)",
  sendFailed: "पठाउन सकिएन — कृपया स्टाफलाई सिधै भन्नुहोस्।",
  cancel: "रद्द गर्नुहोस्",
  sending: "पठाउँदै…",
  shopKnows: "पसलले थाहा पायो!",
  shopKnowsDesc: (name: string, size: string) =>
    `${name}${size ? " · साइज " + size : ""} पसलको सूचीमा सेभ भयो। स्टाफलाई यो स्क्रिन देखाउनुहोस् वा हेर्दै गर्नुहोस्।`,
  keepBrowsing: "हेर्दै गर्नुहोस्",
  chatWhatsApp: "WhatsApp मा कुरा गर्नुहोस्",

  myLooksTitle: "मेरा लुकहरू",
  myLooksSub: "यही डिभाइसमा मात्र सेभ · मनपरेको ♥ स्टाफलाई देखाउनुहोस्",
  deleteAll: "सबै मेटाउनुहोस्",
  close: "✕ बन्द गर्नुहोस्",
  nothingSaved: "अहिलेसम्म केही सेभ छैन — ट्राई-अनपछि “♡ लुक सेभ गर्नुहोस्” ट्याप गर्नुहोस्।",
  share: "सेयर",
  del: "मेटाउनुहोस्",
  confirmDeleteAll: "यस डिभाइसबाट सबै सेभ गरिएका लुक र सम्झिएको फोटो मेटाउने?",
};

export type Strings = typeof en;
export const STRINGS: Record<Lang, Strings> = { en, ne };

export const LangContext = createContext<Lang>("en");

export function useT(): Strings {
  return STRINGS[useContext(LangContext)];
}

export function useLangState(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pahiran:lang");
      if (saved === "ne" || saved === "en") setLang(saved);
    } catch {}
  }, []);
  const toggle = () =>
    setLang((l) => {
      const next: Lang = l === "en" ? "ne" : "en";
      try { localStorage.setItem("pahiran:lang", next); } catch {}
      return next;
    });
  return [lang, toggle];
}

"use client";

/* Kiosk localisation — English + Nepali. Shopper-facing strings only;
   the vendor dashboard stays English. The toggle persists per device.
   Voice (peeq brand): lowercase, short, a little cheeky. "peeq" is the
   universal try-on verb. Nepali strings get the same energy, never a
   stiff translation. */

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ne";

const en = {
  switchLang: "नेपाली",
  contact: "contact",
  myLooksLabel: "my looks",
  startOver: "start over",
  exitKiosk: "exit",

  virtualTrialRoom: "a little look before you buy",
  headline1: "try it on,",
  headline2: "without trying it on",
  attractSub: (n: number) =>
    `Take one photo, then browse ${n} piece${n !== 1 ? "s" : ""} from this shop and see them on you.`,
  tapToBegin: "peeq it",
  seeItOnYou: "see it on you",
  continueSaved: "continue with my saved photo",
  forgetSavedPhoto: "forget my saved photo",

  consentTitle: "Your photo, your call.",
  consentBody:
    "Used only to show these clothes on you, never kept by the shop. Saved looks stay on this device.",
  agreeTakePhoto: "agree & take photo",
  agreeUpload: "upload instead",

  uploadTitle: "add a full-body photo of you",
  uploadHint: "A clear, front-facing photo where you're fully visible — head to toe — works best.",
  uploadCta: "upload my photo",
  useCameraInstead: "or take one with the camera",

  standBack: "stand back so we can see you fully",
  waistUpNote: "use a waist-up photo, not a close-up selfie",
  cameraUnavailable: "Camera isn't available here.",
  tapAnywhere: "Tap anywhere in this box",
  uploadInstead: "to upload a full-body photo instead.",
  startingCamera: "opening our eyes…",
  rememberPhoto: "Remember my photo on this device for 7 days",
  rememberedNote: "Saved only on this device — delete it anytime from the consent screen.",
  notSavedNote: "Your photo stays on this screen — it is never saved.",
  couldNotReadPhoto: "Could not read that photo.",

  genMessages: ["taking a peeq…", "draping the fabric…", "matching the light…", "stitching the details…", "final touches…"],
  genFooter: "usually 15–30 seconds",
  genFooterStudio: "the studio takes about a minute — worth it",

  finishQuick: "quick peeq",
  finishQuickSub: "a look in seconds",
  finishStudio: "studio peeq",
  finishStudioSub: "our finest look · ~1 min",

  pickAPiece: "pick a piece below",
  sizes: "sizes:",
  aiResultNote: "AI try-on · ask staff to see it in person",
  holdToCompare: "hold to compare",
  originalPhoto: "your photo",
  thisSession: "peeqed this session",
  sharing: "sharing…",
  iWantThis: "i want this",
  addToBag: "🛍 add to bag",
  addedToBag: "✓ in your bag",
  chooseSize: "choose your size:",
  viewBag: (n: number) => `view bag (${n}) →`,
  saveLook: "♡ save look",
  savedLook: "♥ saved",
  savingLook: "saving…",
  previewNotice: "AI try-on unavailable here — showing a positioning preview instead.",
  sizeSlider: "size",
  dragToPosition: "drag the garment to position · preview mode",
  retakePhoto: "retake my photo",

  findMySize: "find my size",
  mySizeTitle: "find your size",
  mySizePrivacy: "For sizing only. Stays on this device — never sent to the shop.",
  heightCmLabel: "height (cm)",
  weightKgLabel: "weight (kg) — optional",
  forWhomLabel: "who is it for? (optional)",
  genderWomen: "women",
  genderMen: "men",
  showMySize: "show my size",
  skipSize: "skip",
  forgetMySize: "forget my size",
  yourSize: "your size",
  sizeRoughNote: "rough — add weight to sharpen it",
  sizeNearestNote: (s: string) => `closest in stock: ${s}`,
  sizeFree: "free size · one size fits most",
  recommendedForYou: "recommended for you",

  tellShop: "tell the shop",
  leadNote: (g: string, p: string) => `${g} · ${p}. Leave your name and number so the shop can reach you.`,
  yourName: "your name",
  phoneNumber: "phone number",
  errName: "Please enter your name (at least 2 characters).",
  errPhone: "Please enter a valid phone number (at least 7 digits).",
  sendFailed: "Could not send — please tell the staff directly.",
  cancel: "cancel",
  sending: "sending…",
  sendToShop: "send to the shop",
  shopKnows: "sent to the shop",
  shopKnowsDesc: (name: string, size: string) =>
    `${name}${size ? " · size " + size : ""} is on the shop's list. They'll text you — or chat now to arrange pickup or delivery.`,
  keepBrowsing: "keep browsing",
  chatWhatsApp: "chat on WhatsApp",

  myLooksTitle: "my looks",
  myLooksSub: "saved only on this device",
  deleteAll: "delete all",
  close: "✕ close",
  nothingSaved: "nothing here yet — tap “♡ save look” after a try-on to keep it here.",
  share: "share",
  del: "delete",
  confirmDeleteAll: "Delete all saved looks and your remembered photo from this device?",
  privacyLink: "how we handle your photo",
};

const ne: typeof en = {
  switchLang: "English",
  contact: "सम्पर्क",
  myLooksLabel: "मेरा लुक",
  startOver: "फेरि सुरु",
  exitKiosk: "बाहिर",

  virtualTrialRoom: "किन्नु अघि एक झलक",
  headline1: "नलगाईकनै,",
  headline2: "लगाएर हेर्नुहोस्",
  attractSub: (n: number) =>
    `एउटा फोटो खिच्नुहोस्, अनि यस पसलका ${n} वटा लुगा आफूमा लगाएर हेर्नुहोस्।`,
  tapToBegin: "हेरौँ त कस्तो देखिन्छ",
  seeItOnYou: "आफूमा हेर्नुहोस्",
  continueSaved: "सेभ गरेको फोटोसँग जारी राख्नुहोस्",
  forgetSavedPhoto: "सेभ गरेको फोटो मेटाउनुहोस्",

  consentTitle: "तपाईंको फोटो, तपाईंको निर्णय।",
  consentBody:
    "लुगा तपाईंमा देखाउन मात्र प्रयोग हुन्छ, पसलले कहिल्यै राख्दैन। सेभ गरेका लुक यही डिभाइसमा मात्र रहन्छन्।",
  agreeTakePhoto: "मन्जुर, फोटो खिच्नुहोस्",
  agreeUpload: "अपलोड गर्नुहोस्",

  uploadTitle: "आफ्नो पूरा शरीर देखिने फोटो हाल्नुहोस्",
  uploadHint: "टाउकोदेखि खुट्टासम्म पूरै देखिने, अगाडिबाट खिचेको सफा फोटो सबैभन्दा राम्रो हुन्छ।",
  uploadCta: "मेरो फोटो अपलोड गर्नुहोस्",
  useCameraInstead: "वा क्यामेराले खिच्नुहोस्",

  standBack: "पूरै देखिने गरी अलि पर उभिनुहोस्",
  waistUpNote: "कम्मरदेखि माथिको फोटो, नजिकको सेल्फी होइन",
  cameraUnavailable: "यहाँ क्यामेरा उपलब्ध छैन।",
  tapAnywhere: "यो बाकसभित्र जहाँसुकै ट्याप गर्नुहोस्",
  uploadInstead: "र पूरा शरीर देखिने फोटो अपलोड गर्नुहोस्।",
  startingCamera: "आँखा खुल्दैछ…",
  rememberPhoto: "मेरो फोटो यो डिभाइसमा ७ दिनसम्म सम्झनुहोस्",
  rememberedNote: "यही डिभाइसमा मात्र सेभ हुन्छ — जहिले पनि मेटाउन सकिन्छ।",
  notSavedNote: "तपाईंको फोटो यही स्क्रिनमा मात्र रहन्छ — कहिल्यै सेभ हुँदैन।",
  couldNotReadPhoto: "फोटो पढ्न सकिएन।",

  genMessages: ["एक झलक हेर्दै…", "कपडा ओढाउँदै…", "उज्यालो मिलाउँदै…", "बुट्टा सिलाउँदै…", "अन्तिम टच…"],
  genFooter: "प्रायः १५–३० सेकेन्ड",
  genFooterStudio: "स्टुडियो फिनिशलाई एक मिनेट जति लाग्छ — तर लायकको छ",

  finishQuick: "quick peeq",
  finishQuickSub: "सेकेन्डमै एक झलक",
  finishStudio: "studio peeq",
  finishStudioSub: "सबैभन्दा राम्रो लुक · ~१ मिनेट",

  pickAPiece: "तलबाट एउटा लुगा छान्नुहोस्",
  sizes: "साइज:",
  aiResultNote: "AI ट्राई-अन · सक्कली हेर्न स्टाफलाई भन्नुहोस्",
  holdToCompare: "तुलना गर्न थिचिराख्नुहोस्",
  originalPhoto: "तपाईंको फोटो",
  thisSession: "अहिलेसम्म लगाएर हेरेका",
  sharing: "सेयर हुँदैछ…",
  iWantThis: "मलाई यो चाहियो",
  addToBag: "🛍 झोलामा हाल्नुहोस्",
  addedToBag: "✓ झोलामा छ",
  chooseSize: "साइज छान्नुहोस्:",
  viewBag: (n: number) => `झोला हेर्नुहोस् (${n}) →`,
  saveLook: "♡ लुक सेभ गर्नुहोस्",
  savedLook: "♥ सेभ भयो",
  savingLook: "सेभ हुँदैछ…",
  previewNotice: "AI ट्राई-अन अहिले उपलब्ध छैन — साधारण प्रिभ्यु देखाइँदैछ।",
  sizeSlider: "साइज",
  dragToPosition: "लुगा तानेर मिलाउनुहोस् · प्रिभ्यु मोड",
  retakePhoto: "फेरि फोटो खिच्नुहोस्",

  findMySize: "मेरो साइज पत्ता लगाउनुहोस्",
  mySizeTitle: "आफ्नो साइज पत्ता लगाउनुहोस्",
  mySizePrivacy: "साइजका लागि मात्र। यही डिभाइसमा रहन्छ — पसललाई कहिल्यै पठाइँदैन।",
  heightCmLabel: "उचाइ (से.मि.)",
  weightKgLabel: "तौल (के.जी.) — वैकल्पिक",
  forWhomLabel: "कसका लागि? (वैकल्पिक)",
  genderWomen: "महिला",
  genderMen: "पुरुष",
  showMySize: "मेरो साइज देखाउनुहोस्",
  skipSize: "छाड्नुहोस्",
  forgetMySize: "मेरो साइज मेटाउनुहोस्",
  yourSize: "तपाईंको साइज",
  sizeRoughNote: "अन्दाजी — राम्रो नतिजाका लागि तौल थप्नुहोस्",
  sizeNearestNote: (s: string) => `स्टकमा नजिकको: ${s}`,
  sizeFree: "फ्री साइज · सबैलाई मिल्ने",
  recommendedForYou: "तपाईंका लागि सिफारिस",

  tellShop: "पसललाई भन्नुहोस्",
  leadNote: (g: string, p: string) => `${g} · ${p}। पसलले सम्पर्क गर्न सकोस् भनेर आफ्नो नाम र नम्बर लेख्नुहोस्।`,
  yourName: "तपाईंको नाम",
  phoneNumber: "फोन नम्बर",
  errName: "कृपया आफ्नो नाम लेख्नुहोस् (कम्तीमा २ अक्षर)।",
  errPhone: "कृपया सही फोन नम्बर लेख्नुहोस् (कम्तीमा ७ अंक)।",
  sendFailed: "पठाउन सकिएन — कृपया स्टाफलाई सिधै भन्नुहोस्।",
  cancel: "रद्द गर्नुहोस्",
  sending: "पठाउँदै…",
  sendToShop: "पसललाई पठाउनुहोस्",
  shopKnows: "पसलमा पुग्यो",
  shopKnowsDesc: (name: string, size: string) =>
    `${name}${size ? " · साइज " + size : ""} पसलको सूचीमा सेभ भयो। पिकअप वा डेलिभरीका लागि अहिल्यै कुरा गर्नुहोस्।`,
  keepBrowsing: "हेर्दै गर्नुहोस्",
  chatWhatsApp: "WhatsApp मा कुरा गर्नुहोस्",

  myLooksTitle: "मेरा लुकहरू",
  myLooksSub: "यही डिभाइसमा मात्र सेभ",
  deleteAll: "सबै मेटाउनुहोस्",
  close: "✕ बन्द गर्नुहोस्",
  nothingSaved: "अहिलेसम्म केही सेभ छैन — ट्राई-अनपछि “♡ लुक सेभ गर्नुहोस्” ट्याप गर्नुहोस्।",
  share: "सेयर",
  del: "मेटाउनुहोस्",
  confirmDeleteAll: "यस डिभाइसबाट सबै सेभ गरिएका लुक र सम्झिएको फोटो मेटाउने?",
  privacyLink: "तपाईंको फोटो कसरी प्रयोग हुन्छ",
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

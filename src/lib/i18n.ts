"use client";

/* Kiosk localisation — English + Nepali. Shopper-facing strings only;
   the vendor dashboard stays English. The toggle persists per device.
   Voice (peeq brand): lowercase, short, a little cheeky. "peeq" is the
   universal try-on verb. Nepali strings get the same energy, never a
   stiff translation. */

import { createContext, useContext, useEffect, useState } from "react";
import { persistLang, readLang, type Lang } from "@/lib/lang";

export type { Lang };

const en = {
  switchLang: "नेपाली",
  contact: "contact",
  myLooksLabel: "my looks",
  startOver: "start over",
  exitKiosk: "exit",
  stillThere: "still there?",
  stillThereYes: "yes, keep going",

  virtualTrialRoom: "a little look before you buy",
  headline1: "try it on,",
  headline2: "without trying it on",
  attractSub: (n: number) =>
    `one photo — ${n} piece${n !== 1 ? "s" : ""} on you`,
  tapToBegin: "peeq it",
  seeItOnYou: "see it on you",
  continueSaved: "continue with my saved photo",
  forgetSavedPhoto: "forget my saved photo",

  consentTitle: "Your photo, your call.",
  /* "Saved looks stay on this device" was the same claim the privacy page
     made, and it stopped being true for signed-in shoppers the day looks
     started syncing. Both now say what actually happens. */
  consentBody:
    "Used only to show these clothes on you, never kept by the shop. Saved looks stay on this device — or, if you're signed in, privately in your own account.",
  agreeTakePhoto: "agree & take photo",
  agreeUpload: "upload instead",

  uploadTitle: "add a full-body photo",
  uploadHint: "Head to toe, facing forward.",
  uploadCta: "upload my photo",
  useCameraInstead: "or take one with the camera",

  standBack: "stand back — full body",
  waistUpNote: "waist-up, not a selfie",
  cameraUnavailable: "Camera isn't available here.",
  tapAnywhere: "Tap anywhere in this box",
  uploadInstead: "to upload a photo instead.",
  startingCamera: "opening our eyes…",
  rememberPhoto: "Remember my photo on this device for 7 days",
  rememberedNote: "Delete it anytime.",
  notSavedNote: "Your photo is never saved.",
  couldNotReadPhoto: "Could not read that photo.",
  /* The dashed box is the universal drop target, so it now actually accepts a
     drop — before, dropping a photo on it navigated the browser to the file. */
  dropHere: "or drag a photo in",
  dropNow: "drop it",
  notAnImage: "That file isn't an image — pick a photo.",

  genMessages: ["Peeq gardai... 👀", "Lighting milaudai...", "Kapada ramrari fit gardai...", "Pose milaudai...", "Sana sana details milaudai...", "Almost tayar!", "La, sakinai lagyo, ahha la daami cha"],
  genFooter: "ek minute jati laagchha, tara worth it chha hai",
  /* Shown once the wait passes the point where silence starts to read as
     failure. A full outfit genuinely takes longer than a single piece. */
  genSlow: "ali dhilo bhairacha — banirahecha, nabandanus hai",
  /* The beat between "the render landed and is decoded" and it actually
     appearing. Without it the bar sits at 99% while the browser paints. */
  genReady: "la, herum ta!",
  /* Announced to a screen reader, which otherwise got total silence for the
     whole minute-long wait — and read by the cancel button, which did not
     exist at all: a mis-tap used to cost the shopper two minutes and the shop
     a credit with no way out. */
  genAria: (g: string) => `Making your try-on of ${g}. This usually takes about a minute.`,
  genCancel: "stop waiting",
  genCancelled: "stopped — pick anything.",

  pickAPiece: "pick a piece below",
  /* v2 puts the rack beside the stage in landscape, so "below" isn't true */
  pickAny: "pick any piece to see it on you",

  /* Asked before every generation. A tap on the rack costs the shop a try-on
     and the shopper a minute of waiting, and the tiles sit close together —
     so nothing reaches the API until someone means it. */
  confirmTryTitle: "try this on?",
  confirmTryBody: (g: string) => `${g} on you — about a minute.`,
  confirmTryYes: "yes, peeq it",
  sizes: "sizes:",
  /* Shown on pieces the shop stitches rather than stocks — a rendered fabric
     and cut. The shopper is looking at cloth plus a promise, not a photo of
     something hanging in the back, and the tile is where that has to land. */
  madeToOrder: "MADE TO ORDER",
  yourMeasurements: "your measurements",
  aiResultNote: "AI try-on · ask staff",
  holdToCompare: "hold to compare",
  /* Hold-to-compare was pointer-only, so a keyboard user had no way to see
     their original photo at all. Space/Enter toggles it instead of holding. */
  compareHint: "hold — or press Enter",
  showOriginalLabel: "show my original photo",
  showLookLabel: "show the try-on again",
  originalPhoto: "your photo",
  thisSession: "peeqed this session",
  sharing: "sharing…",
  iWantThis: "i want this",
  addToBag: "add to bag",
  addedToBag: "in your bag",
  chooseSize: "choose your size:",
  viewBag: (n: number) => `view bag (${n}) →`,
  saveLook: "save look",
  savedLook: "saved",
  savingLook: "saving…",
  saveImage: "save image",
  /* A failed try-on says so. Pasting the flat garment photo over the shopper's
     picture and calling it a preview looked like a bad result rather than no
     result — shoppers judged the piece on it. */
  tryonFailedTitle: "something went wrong",
  tryonFailedBody: "Try again in a moment.",
  tryAgain: "try again",
  retakePhoto: "retake my photo",
  browseRack: "browse other pieces",

  findMySize: "find my size",
  mySizeTitle: "find your size",
  mySizePrivacy: "Sizing only — never sent.",
  heightCmLabel: "height (cm)",
  weightKgLabel: "weight (kg) — optional",
  forWhomLabel: "who is it for? (optional)",
  genderWomen: "women",
  genderMen: "men",
  showMySize: "show my size",
  skipSize: "skip",
  forgetMySize: "forget my size",
  /* "show my size" used to just sit there at 60% opacity when the numbers
     were out of range, with nothing saying why. Type 300 and nothing at all
     happened. */
  errHeightRange: (lo: number, hi: number) => `Enter your height in cm, between ${lo} and ${hi}.`,
  errWeightRange: (lo: number, hi: number) => `Enter your weight in kg between ${lo} and ${hi}, or leave it blank.`,
  yourSize: "your size",
  sizeRoughNote: "rough — add weight",
  sizeNearestNote: (s: string) => `closest in stock: ${s}`,
  sizeFree: "free size · one size fits most",
  recommendedForYou: "recommended for you",

  tellShop: "tell the shop",
  leadNote: (g: string, p: string) => `${g} · ${p}. Name and number, please.`,
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
    `${name}${size ? " · size " + size : ""} — on the shop's list.`,
  keepBrowsing: "keep browsing",
  chatWhatsApp: "chat on WhatsApp",

  myLooksTitle: "my looks",
  myLooksSub: "private to you",
  deleteAll: "delete all",
  close: "close",
  nothingSaved: "nothing saved yet.",
  share: "share",
  del: "delete",
  confirmDeleteAll: "Delete all saved looks and your remembered photo from this device?",
  /* Individual delete is as irreversible as delete-all, so it asks too. */
  confirmDeleteLook: "Delete this look? This can't be undone.",
  deleteThisLook: "delete this look",
  privacyLink: "how we handle your photo",

  /* Shared-device mode. This decides whether one shopper's face and phone
     number are still on the screen when the next one picks the tablet up, and
     until now the only way to set it was appending ?shared=1 to the URL — a
     privacy-critical switch with no interface at all. */
  sharedBadge: "shop tablet",
  sharedOnNote: "Nothing remembered between shoppers.",
  sharedTurnOn: "using a shop tablet?",
  sharedTurnOnCta: "turn on shared mode",
  sharedTurnOff: "turn off shared mode",
  sharedExplain: "Remembers nothing between shoppers.",
};

const ne: typeof en = {
  switchLang: "English",
  contact: "सम्पर्क",
  myLooksLabel: "मेरा लुक",
  startOver: "फेरि सुरु",
  exitKiosk: "बाहिर",
  stillThere: "अझै हुनुहुन्छ?",
  stillThereYes: "हो, जारी राख्नुहोस्",

  virtualTrialRoom: "किन्नु अघि एक झलक",
  headline1: "नलगाईकनै,",
  headline2: "लगाएर हेर्नुहोस्",
  attractSub: (n: number) =>
    `एउटा फोटो — ${n} वटा लुगा आफूमा`,
  tapToBegin: "हेरौँ त कस्तो देखिन्छ",
  seeItOnYou: "आफूमा हेर्नुहोस्",
  continueSaved: "सेभ गरेको फोटोसँग जारी राख्नुहोस्",
  forgetSavedPhoto: "सेभ गरेको फोटो मेटाउनुहोस्",

  consentTitle: "तपाईंको फोटो, तपाईंको निर्णय।",
  consentBody:
    "लुगा तपाईंमा देखाउन मात्र प्रयोग हुन्छ, पसलले कहिल्यै राख्दैन। सेभ गरेका लुक यही डिभाइसमा — वा साइन इन गर्नुभएको छ भने तपाईंकै निजी खातामा — रहन्छन्।",
  agreeTakePhoto: "मन्जुर, फोटो खिच्नुहोस्",
  agreeUpload: "अपलोड गर्नुहोस्",

  uploadTitle: "पूरा शरीरको फोटो हाल्नुहोस्",
  uploadHint: "टाउकोदेखि खुट्टासम्म, अगाडिबाट।",
  uploadCta: "मेरो फोटो अपलोड गर्नुहोस्",
  useCameraInstead: "वा क्यामेराले खिच्नुहोस्",

  standBack: "पूरै देखिने गरी उभिनुहोस्",
  waistUpNote: "कम्मरमाथिको फोटो, सेल्फी होइन",
  cameraUnavailable: "यहाँ क्यामेरा उपलब्ध छैन।",
  tapAnywhere: "यो बाकसभित्र जहाँसुकै ट्याप गर्नुहोस्",
  uploadInstead: "र फोटो अपलोड गर्नुहोस्।",
  startingCamera: "आँखा खुल्दैछ…",
  rememberPhoto: "मेरो फोटो यो डिभाइसमा ७ दिनसम्म सम्झनुहोस्",
  rememberedNote: "जहिले पनि मेटाउन सकिन्छ।",
  notSavedNote: "तपाईंको फोटो कहिल्यै सेभ हुँदैन।",
  couldNotReadPhoto: "फोटो पढ्न सकिएन।",
  dropHere: "वा फोटो यहाँ तान्नुहोस्",
  dropNow: "यहाँ छाड्नुहोस्",
  notAnImage: "यो फाइल फोटो होइन — कृपया फोटो छान्नुहोस्।",

  genMessages: ["एक झलक हेर्दै…", "कपडा ओढाउँदै…", "उज्यालो मिलाउँदै…", "बुट्टा सिलाउँदै…", "अन्तिम टच…"],
  genFooter: "एक मिनेट जति लाग्छ, तर लायकको छ है",
  genSlow: "अलि ढिलो भइरहेछ — बन्दैछ, बन्द नगर्नुहोस् है",
  genReady: "ल, हेरौँ त!",
  genAria: (g: string) => `${g} तपाईंमा कस्तो देखिन्छ, बन्दैछ। एक मिनेट जति लाग्छ।`,
  genCancel: "पर्खनु पर्दैन",
  genCancelled: "रोकियो — फेरि छान्नुहोस्।",

  pickAPiece: "तलबाट एउटा लुगा छान्नुहोस्",
  pickAny: "कुनै पनि लुगा छान्नुहोस्, आफूमा हेर्नुहोस्",

  confirmTryTitle: "यो लगाएर हेर्ने?",
  confirmTryBody: (g: string) => `${g} तपाईंमा — एक मिनेट जति।`,
  confirmTryYes: "हो, हेरौँ",
  sizes: "साइज:",
  madeToOrder: "अर्डरमा सिलाइने",
  yourMeasurements: "तपाईंको नाप",
  aiResultNote: "AI ट्राई-अन · स्टाफलाई सोध्नुहोस्",
  holdToCompare: "तुलना गर्न थिचिराख्नुहोस्",
  compareHint: "थिचिराख्नुहोस् — वा Enter",
  showOriginalLabel: "मेरो सक्कली फोटो देखाउनुहोस्",
  showLookLabel: "ट्राई-अन फेरि देखाउनुहोस्",
  originalPhoto: "तपाईंको फोटो",
  thisSession: "अहिलेसम्म लगाएर हेरेका",
  sharing: "सेयर हुँदैछ…",
  iWantThis: "मलाई यो चाहियो",
  addToBag: "झोलामा हाल्नुहोस्",
  addedToBag: "झोलामा छ",
  chooseSize: "साइज छान्नुहोस्:",
  viewBag: (n: number) => `झोला हेर्नुहोस् (${n}) →`,
  saveLook: "लुक सेभ गर्नुहोस्",
  savedLook: "सेभ भयो",
  savingLook: "सेभ हुँदैछ…",
  saveImage: "फोटो सेभ गर्नुहोस्",
  tryonFailedTitle: "केही गडबड भयो",
  tryonFailedBody: "केही बेरमा फेरि प्रयास गर्नुहोस्।",
  tryAgain: "फेरि प्रयास गर्नुहोस्",
  retakePhoto: "फेरि फोटो खिच्नुहोस्",
  browseRack: "अरू लुगा हेर्नुहोस्",

  findMySize: "मेरो साइज पत्ता लगाउनुहोस्",
  mySizeTitle: "आफ्नो साइज पत्ता लगाउनुहोस्",
  mySizePrivacy: "साइजका लागि मात्र — पठाइँदैन।",
  heightCmLabel: "उचाइ (से.मि.)",
  weightKgLabel: "तौल (के.जी.) — वैकल्पिक",
  forWhomLabel: "कसका लागि? (वैकल्पिक)",
  genderWomen: "महिला",
  genderMen: "पुरुष",
  showMySize: "मेरो साइज देखाउनुहोस्",
  skipSize: "छाड्नुहोस्",
  forgetMySize: "मेरो साइज मेटाउनुहोस्",
  errHeightRange: (lo: number, hi: number) => `उचाइ से.मि.मा ${lo} देखि ${hi} बीच लेख्नुहोस्।`,
  errWeightRange: (lo: number, hi: number) => `तौल के.जी.मा ${lo} देखि ${hi} बीच लेख्नुहोस्, वा खाली छोड्नुहोस्।`,
  yourSize: "तपाईंको साइज",
  sizeRoughNote: "अन्दाजी — तौल थप्नुहोस्",
  sizeNearestNote: (s: string) => `स्टकमा नजिकको: ${s}`,
  sizeFree: "फ्री साइज · सबैलाई मिल्ने",
  recommendedForYou: "तपाईंका लागि सिफारिस",

  tellShop: "पसललाई भन्नुहोस्",
  leadNote: (g: string, p: string) => `${g} · ${p}। नाम र नम्बर लेख्नुहोस्।`,
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
    `${name}${size ? " · साइज " + size : ""} — पसलको सूचीमा।`,
  keepBrowsing: "हेर्दै गर्नुहोस्",
  chatWhatsApp: "WhatsApp मा कुरा गर्नुहोस्",

  myLooksTitle: "मेरा लुकहरू",
  myLooksSub: "तपाईंले मात्र देख्न सक्ने",
  deleteAll: "सबै मेटाउनुहोस्",
  close: "बन्द गर्नुहोस्",
  nothingSaved: "अहिलेसम्म केही सेभ छैन।",
  share: "सेयर",
  del: "मेटाउनुहोस्",
  confirmDeleteAll: "यस डिभाइसबाट सबै सेभ गरिएका लुक र सम्झिएको फोटो मेटाउने?",
  confirmDeleteLook: "यो लुक मेटाउने? फेरि फर्काउन मिल्दैन।",
  deleteThisLook: "यो लुक मेटाउनुहोस्",
  privacyLink: "तपाईंको फोटो कसरी प्रयोग हुन्छ",

  sharedBadge: "पसलको ट्याब्लेट",
  sharedOnNote: "ग्राहकबीच केही रहँदैन।",
  sharedTurnOn: "पसलको ट्याब्लेट प्रयोग गर्दै?",
  sharedTurnOnCta: "साझा मोड सुरु गर्नुहोस्",
  sharedTurnOff: "साझा मोड बन्द गर्नुहोस्",
  sharedExplain: "ग्राहकबीच केही सम्झिँदैन।",
};

export type Strings = typeof en;
export const STRINGS: Record<Lang, Strings> = { en, ne };

export const LangContext = createContext<Lang>("en");

export function useT(): Strings {
  return STRINGS[useContext(LangContext)];
}

export function useLangState(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { setLang(readLang()); }, []);
  const toggle = () =>
    setLang((l) => {
      const next: Lang = l === "en" ? "ne" : "en";
      /* both stores, so a server-rendered page (see /privacy) agrees with the
         kiosk about which language this device reads */
      persistLang(next);
      return next;
    });
  return [lang, toggle];
}

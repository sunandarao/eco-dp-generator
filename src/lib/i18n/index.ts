import en, { type Dict } from "./en";
import hi from "./hi";
import bn from "./bn";
import mr from "./mr";
import te from "./te";
import ta from "./ta";
import gu from "./gu";
import kn from "./kn";
import ml from "./ml";
import or from "./or";
import pa from "./pa";
import as from "./as";

export type { Dict };

/** English + 11 Indian languages (all in the Eighth Schedule). Non-English texts are DRAFTS pending native/legal review. */
export const LANGS = [
  { code: "en", native: "English" },
  { code: "hi", native: "हिंदी" },
  { code: "bn", native: "বাংলা" },
  { code: "mr", native: "मराठी" },
  { code: "te", native: "తెలుగు" },
  { code: "ta", native: "தமிழ்" },
  { code: "gu", native: "ગુજરાતી" },
  { code: "kn", native: "ಕನ್ನಡ" },
  { code: "ml", native: "മലയാളം" },
  { code: "or", native: "ଓଡ଼ିଆ" },
  { code: "pa", native: "ਪੰਜਾਬੀ" },
  { code: "as", native: "অসমীয়া" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];
export const dict: Record<Lang, Dict> = { en, hi, bn, mr, te, ta, gu, kn, ml, or, pa, as };
export const isLang = (v: unknown): v is Lang => typeof v === "string" && v in dict;

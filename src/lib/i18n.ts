import type { AppRole } from "./roles";

type Dict = Record<string, string>;

/**
 * Minimal translation layer. All UI copy goes through t() so Hindi (and other
 * languages) can be added without touching components.
 */
const en: Dict = {
  "app.name": "DairyOne",
  "app.tagline": "Milk collection, verified end to end.",
  "nav.signin": "Sign in",
  "nav.getStarted": "Get started",
  "auth.title": "Sign in to DairyOne",
  "auth.phone": "Mobile number",
  "auth.sendOtp": "Send OTP",
  "auth.otp": "Enter 6-digit OTP",
  "auth.verify": "Verify & continue",
  "auth.change": "Change number",
  "auth.role": "I am a",
  "auth.roleHint": "Used only the first time you sign in.",
  "role.owner": "Owner",
  "role.manager": "Centre Manager",
  "role.agent": "Collection Agent",
  "role.buyer": "Buyer (Dairy Plant)",
  "role.farmer": "Farmer",
  "role.accountant": "Accountant",
  "common.signout": "Sign out",
  "common.today": "Today",
  "common.litres": "Litres",
  "common.comingSoon": "Coming in the next phase",
};

const hi: Dict = {
  "app.name": "डेयरीवन",
  "app.tagline": "दूध संग्रह, पूरी तरह सत्यापित।",
  "nav.signin": "साइन इन",
  "nav.getStarted": "शुरू करें",
  "auth.title": "डेयरीवन में साइन इन करें",
  "auth.phone": "मोबाइल नंबर",
  "auth.sendOtp": "ओटीपी भेजें",
  "auth.otp": "6 अंकों का ओटीपी डालें",
  "auth.verify": "सत्यापित करें",
  "auth.change": "नंबर बदलें",
  "auth.role": "मैं हूँ",
  "auth.roleHint": "केवल पहली बार साइन इन करते समय उपयोग होता है।",
  "role.owner": "मालिक",
  "role.manager": "केंद्र प्रबंधक",
  "role.agent": "संग्रह एजेंट",
  "role.buyer": "क्रेता (डेयरी प्लांट)",
  "role.farmer": "किसान",
  "role.accountant": "लेखाकार",
  "common.signout": "साइन आउट",
  "common.today": "आज",
  "common.litres": "लीटर",
  "common.comingSoon": "अगले चरण में आ रहा है",
};

const dictionaries: Record<string, Dict> = { en, hi };

export type Language = keyof typeof dictionaries;

export function t(key: string, lang: string = "en"): string {
  return dictionaries[lang]?.[key] ?? en[key] ?? key;
}

export function roleLabel(role: AppRole, lang = "en"): string {
  return t(`role.${role}`, lang);
}

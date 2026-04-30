import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "@/locales/en/common.json";
import auth from "@/locales/en/auth.json";
import onboarding from "@/locales/en/onboarding.json";
import legal from "@/locales/en/legal.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: {
      common,
      auth,
      onboarding,
      legal,
    },
  },
  defaultNS: "common",
  interpolation: { escapeValue: false },
  });
}

export default i18n;

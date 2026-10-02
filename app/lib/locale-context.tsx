import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "./i18n";

export const LOCALE_STORAGE_KEY = "convocerto.locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  text: (ja: string, en: string) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  text: (_ja, en) => en,
});

function preferredLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {}
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const base = language?.toLowerCase().split(/[-_]/)[0];
    if (base === "ja" || base === "en") return base;
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrentLocale] = useState<Locale>("en");

  useEffect(() => { setCurrentLocale(preferredLocale()); }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setCurrentLocale(next);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch {}
  }, []);
  const text = useCallback((ja: string, en: string) => locale === "ja" ? ja : en, [locale]);
  const value = useMemo(() => ({ locale, setLocale, text }), [locale, setLocale, text]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

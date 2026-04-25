"use client";

import { getOrCreateSettings, saveSettings } from "@/db/settings";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en.json";
import type { AppLanguage, MessageKey } from "./dictionary";
import { translate } from "./dictionary";
import { parseAppLanguage } from "./language";

const STORAGE_KEY = "life-panel-locale";

function readCachedLocale(): AppLanguage {
  if (typeof window === "undefined") return "en";
  return parseAppLanguage(window.localStorage.getItem(STORAGE_KEY));
}

type LocaleContextValue = {
  locale: AppLanguage;
  setLocale: (l: AppLanguage) => void;
  t: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLanguage>(readCachedLocale);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await getOrCreateSettings();
      if (!mounted) return;
      const next = parseAppLanguage(s.language);
      setLocaleState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback((l: AppLanguage) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
    void saveSettings({ language: l });
  }, []);

  const t = useCallback(
    (key: MessageKey) => translate(locale, key),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const v = useContext(LocaleContext);
  if (!v) {
    return {
      locale: "en",
      setLocale: () => {},
      t: (key: MessageKey) => en[key] ?? String(key),
    };
  }
  return v;
}

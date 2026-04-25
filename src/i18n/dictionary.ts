import type { AppLanguage } from "./language";
import { SUPPORTED_LANGUAGES } from "./language";
import en from "./en.json";
import ru from "./ru.json";

export type { AppLanguage } from "./language";
export { SUPPORTED_LANGUAGES };

/** @deprecated use AppLanguage */
export type AppLocale = AppLanguage;

/** @deprecated use SUPPORTED_LANGUAGES */
export const SUPPORTED_LOCALES = SUPPORTED_LANGUAGES;

export type MessageKey = keyof typeof en;

const messages: Record<AppLanguage, Record<MessageKey, string>> = {
  en: en,
  ru: ru,
};

export function translate(
  locale: AppLanguage,
  key: MessageKey,
): string {
  const table = messages[locale] ?? messages.en;
  return table[key] ?? en[key] ?? String(key);
}

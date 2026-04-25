export type AppLanguage = "en" | "ru";

export const SUPPORTED_LANGUAGES: AppLanguage[] = ["en", "ru"];

export function isAppLanguage(x: string | undefined | null): x is AppLanguage {
  return x === "en" || x === "ru";
}

export function parseAppLanguage(x: string | undefined | null): AppLanguage {
  return isAppLanguage(x) ? x : "en";
}

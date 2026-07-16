import {match} from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

export const LOCALE_COOKIE = "pinchana_locale";
export const DEFAULT_LOCALE = "en" as const;

export const SUPPORTED_LOCALES = [
  {code: "en", label: "English", direction: "ltr", flag: "gb"},
  {code: "uk", label: "Українська", direction: "ltr", flag: "ua"},
] as const;

export const APPROVED_LEGAL_LOCALES = ["en", "uk"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]["code"];
export type TextDirection = (typeof SUPPORTED_LOCALES)[number]["direction"];

const localeCodes = SUPPORTED_LOCALES.map(({code}) => code);

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return Boolean(value && localeCodes.includes(value as AppLocale));
}

export function localeDirection(locale: AppLocale): TextDirection {
  return SUPPORTED_LOCALES.find(({code}) => code === locale)?.direction ?? "ltr";
}

export function resolveLocale(
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AppLocale {
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  if (!acceptLanguage) return DEFAULT_LOCALE;

  try {
    const requested = new Negotiator({headers: {"accept-language": acceptLanguage}}).languages();
    return match(requested, localeCodes, DEFAULT_LOCALE) as AppLocale;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function isApprovedLegalLocale(locale: string): locale is AppLocale {
  return APPROVED_LEGAL_LOCALES.includes(locale as (typeof APPROVED_LEGAL_LOCALES)[number]);
}

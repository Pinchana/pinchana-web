import type {AppLocale} from "./config";

const appCatalogs = {
  en: () => import("@/messages/app/en.json").then((catalog) => catalog.default),
  uk: () => import("@/messages/app/uk.json").then((catalog) => catalog.default),
} satisfies Record<AppLocale, () => Promise<Record<string, unknown>>>;

const legalCatalogs = {
  en: () => import("@/messages/legal/en.json").then((catalog) => catalog.default),
  uk: () => import("@/messages/legal/uk.json").then((catalog) => catalog.default),
} satisfies Record<AppLocale, () => Promise<Record<string, unknown>>>;

export function loadAppMessages(locale: AppLocale) {
  return appCatalogs[locale]();
}

export function loadLegalMessages(locale: AppLocale) {
  return legalCatalogs[locale]();
}

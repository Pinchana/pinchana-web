import type {AppLocale} from "./config";

type CatalogEntry = {
  source: string;
  translation: string;
};

type RuntimeCatalog<T> = T extends CatalogEntry
  ? string
  : T extends Record<string, unknown>
    ? {[Key in keyof T]: RuntimeCatalog<T[Key]>}
    : never;

const appCatalogs = {
  en: () => import("@/messages/app/en.json").then((catalog) => catalog.default),
  uk: () => import("@/messages/app/uk.json").then((catalog) => catalog.default),
} satisfies Record<AppLocale, () => Promise<Record<string, unknown>>>;

const legalCatalogs = {
  en: () => import("@/messages/legal/en.json").then((catalog) => catalog.default),
  uk: () => import("@/messages/legal/uk.json").then((catalog) => catalog.default),
} satisfies Record<AppLocale, () => Promise<Record<string, unknown>>>;

function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return Object.keys(entry).length === 2
    && typeof entry.source === "string"
    && typeof entry.translation === "string";
}

function extractTranslations<T extends Record<string, unknown>>(catalog: T): RuntimeCatalog<T> {
  return Object.fromEntries(Object.entries(catalog).map(([key, value]) => {
    if (isCatalogEntry(value)) return [key, value.translation];
    if (value && !Array.isArray(value) && typeof value === "object") {
      return [key, extractTranslations(value as Record<string, unknown>)];
    }
    throw new Error(`Invalid translation catalog entry: ${key}`);
  })) as RuntimeCatalog<T>;
}

export async function loadAppMessages(locale: AppLocale) {
  return extractTranslations(await appCatalogs[locale]());
}

export async function loadLegalMessages(locale: AppLocale) {
  return extractTranslations(await legalCatalogs[locale]());
}

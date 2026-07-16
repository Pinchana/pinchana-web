import {createTranslator} from "next-intl";
import {getLocale} from "next-intl/server";
import {
  DEFAULT_LOCALE,
  isApprovedLegalLocale,
  isSupportedLocale,
  type AppLocale,
} from "./config";
import {loadLegalMessages} from "./messages";

export function resolveLegalLocale(requestedLocale: string): AppLocale {
  return isSupportedLocale(requestedLocale) && isApprovedLegalLocale(requestedLocale)
    ? requestedLocale
    : DEFAULT_LOCALE;
}

export async function getLegalTranslator(forcedLocale?: string) {
  const interfaceLocale = await getLocale() as AppLocale;
  const requestedLocale = isSupportedLocale(forcedLocale) ? forcedLocale : interfaceLocale;
  const locale = resolveLegalLocale(requestedLocale);
  const messages = await loadLegalMessages(locale);

  return {
    locale,
    isCommunityTranslation: locale !== DEFAULT_LOCALE,
    isFallback: locale === DEFAULT_LOCALE && requestedLocale !== DEFAULT_LOCALE,
    t: createTranslator({locale, messages}),
  };
}

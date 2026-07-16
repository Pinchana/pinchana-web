import {NextIntlClientProvider} from "next-intl";
import {getLocale} from "next-intl/server";
import Home from "./Home";
import type {AppLocale} from "@/i18n/config";
import {loadAppMessages} from "@/i18n/messages";

export default async function Page() {
  const locale = await getLocale() as AppLocale;
  const messages = await loadAppMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Home />
    </NextIntlClientProvider>
  );
}

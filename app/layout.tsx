import type { Metadata } from "next";
import localFont from "next/font/local";
import {getLocale, getTranslations} from "next-intl/server";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "@fontsource-variable/manrope";
import "./globals.css";
import { connection } from "next/server";
import {localeDirection, type AppLocale} from "@/i18n/config";

config.autoAddCss = false;

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
    icons: {icon: "/favicon.svg"},
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const locale = await getLocale() as AppLocale;
  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="paw-field" aria-hidden="true">
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
          <span className="paw" />
        </div>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";
import { connection } from "next/server";

config.autoAddCss = false;

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pinchana",
  description: "A lightweight, private media downloader powered by Pinchana.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`}>
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

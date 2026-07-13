import type { Metadata } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";
import { connection } from "next/server";

config.autoAddCss = false;

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
    <html lang="en" className="h-full antialiased">
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

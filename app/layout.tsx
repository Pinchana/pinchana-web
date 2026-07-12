import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pinchana — Paste. Pinch. Save.",
  description: "A lightweight, private media downloader powered by Pinchana.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

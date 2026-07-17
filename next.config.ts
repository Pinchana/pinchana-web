import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

function webCommit(): string {
  const configured = process.env.NEXT_PUBLIC_PINCHANA_WEB_COMMIT?.trim();
  if (configured) return configured;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "development";
  }
}

const nextConfig: NextConfig = {
  // Keep production builds from overwriting an active development cache.
  // Mixing the two directories can serve stale CSS with fresh client markup.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
  env: {
    NEXT_PUBLIC_PINCHANA_WEB_COMMIT: webCommit(),
  },
  async headers() {
    return [
      {
        source: "/ffmpeg/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

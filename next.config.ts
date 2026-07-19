import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import {resolveSentryBuildConfig} from "./sentry-build-config";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const sentryBuild = resolveSentryBuildConfig(process.env);

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
    NEXT_PUBLIC_SENTRY_MONITORING_ENABLED: String(sentryBuild.enabled),
    NEXT_PUBLIC_SENTRY_TUNNEL_ROUTE: sentryBuild.tunnelRoute ?? "",
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

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  widenClientFileUpload: true,
  tunnelRoute: sentryBuild.tunnelRoute,
  silent: !process.env.CI,
});

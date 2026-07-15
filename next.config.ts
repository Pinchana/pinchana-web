import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

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
};

export default nextConfig;

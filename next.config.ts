import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production builds from overwriting an active development cache.
  // Mixing the two directories can serve stale CSS with fresh client markup.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
};

export default nextConfig;

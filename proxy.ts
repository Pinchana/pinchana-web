import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MOBILE_PLATFORMS = /android|ios|iphone|ipad|ipod|windows phone/i;
const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|windows phone|mobile/i;

function isMobileRequest(request: NextRequest): boolean {
  const mobileHint = request.headers.get("sec-ch-ua-mobile")?.trim();
  const platform = request.headers.get("sec-ch-ua-platform")?.replaceAll('"', "").trim() || "";
  const userAgent = request.headers.get("user-agent") || "";

  return mobileHint === "?1" || MOBILE_PLATFORMS.test(platform) || MOBILE_USER_AGENT.test(userAgent);
}

function withPlatformHints(response: NextResponse): NextResponse {
  response.headers.set("Accept-CH", "Sec-CH-UA-Platform, Sec-CH-UA-Mobile");
  const vary = new Set(
    (response.headers.get("Vary") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const value of ["Accept-Language", "Cookie", "Sec-CH-UA-Platform", "Sec-CH-UA-Mobile", "User-Agent"]) {
    vary.add(value);
  }
  response.headers.set("Vary", [...vary].join(", "));
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = request.nextUrl.pathname === "/" && isMobileRequest(request)
    ? NextResponse.redirect(new URL("/mobile", request.url))
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return withPlatformHints(response);
}

export const config = {
  matcher: ["/((?!api|ffmpeg|_next/static|_next/image|favicon.svg).*)"],
};

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
  response.headers.set("Vary", "Sec-CH-UA-Platform, Sec-CH-UA-Mobile, User-Agent");
  return response;
}

export function proxy(request: NextRequest) {
  if (isMobileRequest(request)) {
    return withPlatformHints(NextResponse.redirect(new URL("/mobile", request.url)));
  }

  return withPlatformHints(NextResponse.next());
}

export const config = {
  matcher: "/",
};

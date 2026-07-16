import {NextResponse} from "next/server";
import {isSupportedLocale, LOCALE_COOKIE} from "@/i18n/config";

export async function POST(request: Request) {
  let locale: unknown;

  try {
    ({locale} = await request.json());
  } catch {
    return NextResponse.json({code: "invalid_json"}, {status: 400});
  }

  if (typeof locale !== "string" || !isSupportedLocale(locale)) {
    return NextResponse.json({code: "unsupported_locale"}, {status: 400});
  }

  const response = new NextResponse(null, {status: 204});
  response.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

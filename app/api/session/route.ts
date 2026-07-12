import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  apiUrl,
  bearer,
  safeJson,
  sessionToken,
} from "@/lib/pinchana";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await sessionToken();
  if (!token) return NextResponse.json({ valid: false }, { status: 401 });

  try {
    const upstream = await fetch(apiUrl("/web/session"), {
      headers: bearer(token),
      cache: "no-store",
    });
    if (upstream.ok) {
      const payload = await safeJson(upstream);
      return NextResponse.json(payload ?? { valid: true });
    }
  } catch {
    return NextResponse.json({ valid: false, unavailable: true }, { status: 503 });
  }

  const response = NextResponse.json({ valid: false }, { status: 401 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  apiUrl,
  safeJson,
  upstreamError,
} from "@/lib/pinchana";

export async function POST(request: Request) {
  let token: string;
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) throw new Error();
    token = body.token;
  } catch {
    return Response.json({ error: "A verification token is required." }, { status: 400 });
  }

  try {
    const upstream = await fetch(apiUrl("/web/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    const payload = (await safeJson(upstream)) as {
      access_token?: unknown;
      expires_at?: unknown;
    } | null;
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    if (typeof payload?.access_token !== "string") {
      return Response.json({ error: "Verification returned an invalid response." }, { status: 502 });
    }

    const response = NextResponse.json({ valid: true, expiresAt: payload.expires_at });
    response.cookies.set(SESSION_COOKIE, payload.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      priority: "high",
    });
    return response;
  } catch {
    return Response.json({ error: "Verification service is unavailable." }, { status: 503 });
  }
}

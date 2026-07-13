import { NextResponse } from "next/server";
import {
  INSTANCE_COOKIE,
  SESSION_COOKIE,
  encodeInstanceCookie,
  instanceConfig,
  verifyInstanceCertificate,
  type InstanceCertificate,
} from "@/lib/pinchana";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await instanceConfig();
    return NextResponse.json({
      custom: config.custom,
      origin: config.custom ? config.origin : "",
      turnstile_site_key: config.siteKey,
      expires_at: config.expiresAt ?? null,
    });
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Instance configuration is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { origin?: unknown; certificate?: unknown };
    if (typeof body.origin !== "string" || !body.certificate || typeof body.certificate !== "object") {
      throw new Error("An API origin and instance certificate are required.");
    }
    const certificate = body.certificate as InstanceCertificate;
    const claims = verifyInstanceCertificate(certificate, body.origin);
    const response = NextResponse.json({
      valid: true,
      custom: true,
      origin: claims.origin,
      turnstile_site_key: claims.turnstile_site_key,
      expires_at: claims.expires_at,
    });
    response.cookies.set(INSTANCE_COOKIE, encodeInstanceCookie(certificate), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: Math.max(1, claims.expires_at - Math.floor(Date.now() / 1000)),
      priority: "high",
    });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (reason) {
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Instance verification failed." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    valid: true,
    custom: false,
    origin: "",
    turnstile_site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  });
  response.cookies.delete(INSTANCE_COOKIE);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

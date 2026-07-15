import { cookies } from "next/headers";
import { createPublicKey, verify } from "node:crypto";

export const SESSION_COOKIE = "pinchana_web_session";
export const INSTANCE_COOKIE = "pinchana_instance";
export const INSTANCE_PROTOCOL = 1;

export type InstanceCertificate = { payload: string; signature: string };
export type InstanceClaims = {
  issuer: "pinchana-project";
  protocol: number;
  origin: string;
  turnstile_site_key: string;
  issued_at: number;
  expires_at: number;
};

function normalizeOrigin(value: string): string {
  const parsed = new URL(value);
  const allowHttp = process.env.NODE_ENV !== "production";
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error("Custom instances must use HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error("Use only the API origin, without a path or credentials.");
  }
  return parsed.origin;
}

function signingPublicKey(): string {
  const value = process.env.PINCHANA_INSTANCE_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!value) throw new Error("Instance verification is not configured.");
  return value;
}

export function verifyInstanceCertificate(
  certificate: InstanceCertificate,
  expectedOrigin?: string,
): InstanceClaims {
  if (!certificate || typeof certificate.payload !== "string" || typeof certificate.signature !== "string") {
    throw new Error("The instance returned an invalid certificate.");
  }
  const payloadBytes = Buffer.from(certificate.payload, "base64url");
  const signatureBytes = Buffer.from(certificate.signature, "base64url");
  const valid = verify(null, payloadBytes, createPublicKey(signingPublicKey()), signatureBytes);
  if (!valid) throw new Error("The instance certificate signature is invalid.");

  const claims = JSON.parse(payloadBytes.toString("utf8")) as Partial<InstanceClaims>;
  if (
    claims.issuer !== "pinchana-project" ||
    claims.protocol !== INSTANCE_PROTOCOL ||
    typeof claims.origin !== "string" ||
    typeof claims.turnstile_site_key !== "string" ||
    !claims.turnstile_site_key ||
    typeof claims.issued_at !== "number" ||
    typeof claims.expires_at !== "number"
  ) {
    throw new Error("The instance certificate has invalid claims.");
  }
  const origin = normalizeOrigin(claims.origin);
  if (expectedOrigin && origin !== normalizeOrigin(expectedOrigin)) {
    throw new Error("The certificate is not issued for this API origin.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.issued_at > now + 300 || claims.expires_at <= now) {
    throw new Error("The instance certificate is expired or not yet valid.");
  }
  return { ...claims, origin } as InstanceClaims;
}

export function encodeInstanceCookie(certificate: InstanceCertificate): string {
  return `${certificate.payload}.${certificate.signature}`;
}

export function decodeInstanceCookie(value: string): InstanceCertificate {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid instance cookie.");
  return { payload, signature };
}

export async function instanceConfig(): Promise<{ origin: string; siteKey: string; custom: boolean; expiresAt?: number }> {
  const value = (await cookies()).get(INSTANCE_COOKIE)?.value;
  if (value) {
    try {
      const claims = verifyInstanceCertificate(decodeInstanceCookie(value));
      return { origin: claims.origin, siteKey: claims.turnstile_site_key, custom: true, expiresAt: claims.expires_at };
    } catch {}
  }
  const origin = process.env.PINCHANA_API_URL?.replace(/\/$/, "");
  if (!origin) throw new Error("PINCHANA_API_URL is not configured");
  return { origin, siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "", custom: false };
}

export async function apiUrl(path: string): Promise<string> {
  return `${(await instanceConfig()).origin}${path}`;
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function upstreamError(status: number, payload: unknown): Response {
  let message = "Pinchana could not complete the request.";
  if (status === 400) message = "This URL is not supported.";
  if (status === 401 || status === 403) message = "Verification expired. Please verify again.";
  if (status === 429) message = "Too many requests. Please try again shortly.";
  if (status >= 500) message = "Pinchana is temporarily unavailable.";

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && status < 500 && status !== 401 && status !== 403) {
      message = detail;
    }
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error) {
      const upstreamMessage = (error as { message?: unknown }).message;
      if (typeof upstreamMessage === "string" && status < 500 && status !== 401 && status !== 403) {
        message = upstreamMessage;
      }
    }
  }
  return Response.json({ error: message }, { status });
}

export function rewriteMediaUrls(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("/web/media/")) {
    return `/api/media/${value.slice("/web/media/".length)}`;
  }
  if (Array.isArray(value)) return value.map(rewriteMediaUrls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteMediaUrls(item)]),
    );
  }
  return value;
}

import { cookies } from "next/headers";

export const SESSION_COOKIE = "pinchana_web_session";

export function apiUrl(path: string): string {
  const base = process.env.PINCHANA_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("PINCHANA_API_URL is not configured");
  return `${base}${path}`;
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

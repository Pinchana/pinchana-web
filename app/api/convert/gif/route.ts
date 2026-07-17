import { apiError } from "@/i18n/api";
import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";
import { parseCachedMediaPath } from "@/lib/media-conversion";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return apiError("verificationRequired", 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("invalidMediaPath", 400);
  }
  const mediaPath = payload && typeof payload === "object" && "mediaPath" in payload
    ? (payload as { mediaPath?: unknown }).mediaPath
    : null;
  const cachedMedia = parseCachedMediaPath(mediaPath);
  if (!cachedMedia) return apiError("invalidMediaPath", 400);

  try {
    const requestHeaders = new Headers(bearer(token));
    requestHeaders.set("Content-Type", "application/json");
    const upstream = await fetch(await apiUrl("/web/convert/gif"), {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(cachedMedia),
      cache: "no-store",
      redirect: "error",
    });
    if (!upstream.ok || !upstream.body) {
      return upstreamError(upstream.status, await safeJson(upstream));
    }
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": upstream.headers.get("content-type") || "image/gif",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-disposition", "content-length"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return apiError("mediaServiceUnavailable", 503);
  }
}

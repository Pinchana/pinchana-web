import {
  apiUrl,
  bearer,
  rewriteMediaUrls,
  safeJson,
  sessionToken,
  upstreamError,
} from "@/lib/pinchana";
import {apiError} from "@/i18n/api";

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return apiError("verificationRequired", 401);

  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const parsed = new URL(body.url);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
  } catch {
    return apiError("validPublicUrl", 400);
  }

  try {
    const upstream = await fetch(await apiUrl("/v1/web/scrape"), {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
      redirect: "error",
    });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(rewriteMediaUrls(payload));
  } catch {
    return apiError("pinchanaUnavailable", 503);
  }
}

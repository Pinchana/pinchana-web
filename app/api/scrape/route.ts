import {
  apiUrl,
  bearer,
  rewriteMediaUrls,
  safeJson,
  sessionToken,
  upstreamError,
} from "@/lib/pinchana";
import {apiError} from "@/i18n/api";

function isV2CandidateHost(hostname: string): boolean {
  return ["instagram.com", "tiktok.com", "threads.com", "threads.net", "twitter.com", "x.com"]
    .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function rollbackCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  if (detail && typeof detail === "object" && typeof (detail as Record<string, unknown>).code === "string") {
    return String((detail as Record<string, unknown>).code);
  }
  const error = record.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string") {
    return String((error as Record<string, unknown>).code);
  }
  return null;
}

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return apiError("verificationRequired", 401);

  let url: string;
  let useV2 = false;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const parsed = new URL(body.url);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
    const hostname = parsed.hostname.toLowerCase();
    // The web proxy only identifies contract-capable hosts. The selected API
    // instance remains authoritative through its flags and capability response.
    useV2 = isV2CandidateHost(hostname);
  } catch {
    return apiError("validPublicUrl", 400);
  }

  try {
    let upstream = await fetch(await apiUrl(useV2 ? "/v2/scrape" : "/v1/web/scrape"), {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
      redirect: "error",
    });
    let payload = await safeJson(upstream);
    if (
      useV2
      && !upstream.ok
      && ["v2_disabled", "v2_capability_unavailable"].includes(rollbackCode(payload) || "")
    ) {
      upstream = await fetch(await apiUrl("/v1/web/scrape"), {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        cache: "no-store",
        redirect: "error",
      });
      payload = await safeJson(upstream);
    }
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(rewriteMediaUrls(payload));
  } catch {
    return apiError("pinchanaUnavailable", 503);
  }
}

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
  return [
    "instagram.com", "tiktok.com", "threads.com", "threads.net", "twitter.com", "x.com",
    "soundcloud.com", "spotify.com", "deezer.com", "deezer.page.link", "link.deezer.com",
    "music.youtube.com",
  ]
    .some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function audioOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const enums: Record<string, readonly string[]> = {
    audioFormat: ["best", "mp3", "ogg", "wav", "opus"],
    audioBitrate: ["320", "256", "128", "96", "64", "8"],
    filenameStyle: ["classic", "basic", "pretty", "nerdy"],
  };
  for (const [name, values] of Object.entries(enums)) {
    if (typeof input[name] === "string" && values.includes(input[name])) result[name] = input[name];
  }
  if (typeof input.preferBetterAudio === "boolean") result.preferBetterAudio = input.preferBetterAudio;
  return result;
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
  let options: Record<string, unknown> = {};
  let useV2 = false;
  try {
    const body = (await request.json()) as { url?: unknown; options?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const parsed = new URL(body.url);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
    options = audioOptions(body.options);
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
      body: JSON.stringify(useV2 ? { url, options } : { url }),
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

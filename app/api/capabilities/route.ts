import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

export const dynamic = "force-dynamic";

const unavailable = { available: false, protocol: null, services: [], qualities: [], codecs: [], containers: [], audioFormats: [], audioBitrates: [], dubLanguages: [], filenameStyles: [], subtitleLanguages: [], betterAudio: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  const token = await sessionToken();
  if (!token) return Response.json({ dlp: unavailable, mediaConversions: { gif: { serverFallback: false } }, services: [] }, { status: 401 });

  let dlpCapabilities: Record<string, unknown> = unavailable;
  let mediaConversions: Record<string, unknown> = { gif: { serverFallback: false } };
  try {
    const upstream = await fetch(await apiUrl("/web/capabilities"), { headers: bearer(token), cache: "no-store", redirect: "error" });
    if (upstream.ok) {
      const payload = await safeJson(upstream);
      if (isRecord(payload) && isRecord(payload.dlp)) {
        dlpCapabilities = payload.dlp;
      }
      if (isRecord(payload) && isRecord(payload.mediaConversions)) {
        mediaConversions = payload.mediaConversions;
      }
    } else if (upstream.status !== 404) {
      const payload = await safeJson(upstream);
      return upstreamError(upstream.status, payload);
    }
  } catch {
    // Fail silently, fallback to unavailable
  }

  let healthyModules: string[] = [];
  try {
    const healthResponse = await fetch(await apiUrl("/health"), { cache: "no-store" });
    const healthData = await safeJson(healthResponse);
    if (isRecord(healthData)) {
      const modules = healthData.modules || healthData.detail;
      if (isRecord(modules)) {
        healthyModules = Object.entries(modules)
          .filter(([, value]) => isRecord(value) && value.status === "healthy")
          .map(([key]) => key);
      }
    }
  } catch {
    // Fail silently on health check
  }

  return Response.json(
    { dlp: dlpCapabilities, mediaConversions, services: healthyModules },
    { headers: { "Cache-Control": "no-store" } },
  );
}

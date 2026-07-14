import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

export const dynamic = "force-dynamic";

const unavailable = { available: false, protocol: null, services: [], qualities: [], codecs: [], containers: [], audioFormats: [], audioBitrates: [], dubLanguages: [], betterAudio: false };

export async function GET() {
  const token = await sessionToken();
  if (!token) return Response.json({ dlp: unavailable }, { status: 401 });
  try {
    const upstream = await fetch(await apiUrl("/web/capabilities"), { headers: bearer(token), cache: "no-store", redirect: "error" });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ dlp: unavailable }, { status: 503 });
  }
}

import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

export async function POST() {
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });
  try {
    const upstream = await fetch(await apiUrl("/web/dlp/jobs"), { method: "POST", headers: bearer(token), cache: "no-store", redirect: "error" });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Private downloads are temporarily unavailable." }, { status: 503 });
  }
}

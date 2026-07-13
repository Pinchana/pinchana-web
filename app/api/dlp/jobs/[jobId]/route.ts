import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

function validJobId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });
  if (!validJobId(jobId)) return Response.json({ error: "Invalid job." }, { status: 400 });
  try {
    const upstream = await fetch(await apiUrl(`/web/dlp/jobs/${jobId}`), { headers: bearer(token), cache: "no-store", redirect: "error" });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Private download status is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });
  if (!validJobId(jobId)) return Response.json({ error: "Invalid job." }, { status: 400 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 320 * 1024) return Response.json({ error: "Request is too large." }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Invalid DLP request." }, { status: 400 }); }
  try {
    const upstream = await fetch(await apiUrl(`/web/dlp/jobs/${jobId}/submit`), {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
    });
    const responsePayload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, responsePayload);
    return Response.json(responsePayload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Private download submission failed." }, { status: 503 });
  }
}

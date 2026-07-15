import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

const REQUEST_HEADERS = ["range", "if-range"] as const;
const RESPONSE_HEADERS = [
  "accept-ranges",
  "content-range",
  "content-type",
  "content-length",
  "content-disposition",
  "etag",
  "last-modified",
] as const;

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Invalid job." }, { status: 400 });
  try {
    const requestHeaders = new Headers(bearer(token));
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) requestHeaders.set(name, value);
    }
    const upstream = await fetch(await apiUrl(`/web/dlp/jobs/${jobId}/file`), { headers: requestHeaders, cache: "no-store", redirect: "error" });
    if (!upstream.ok && upstream.status !== 416) return upstreamError(upstream.status, await safeJson(upstream));
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "Private download file is unavailable." }, { status: 503 });
  }
}

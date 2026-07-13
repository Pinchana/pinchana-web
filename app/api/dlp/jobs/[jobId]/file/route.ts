import { apiUrl, bearer, safeJson, sessionToken, upstreamError } from "@/lib/pinchana";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Invalid job." }, { status: 400 });
  try {
    const upstream = await fetch(await apiUrl(`/web/dlp/jobs/${jobId}/file`), { headers: bearer(token), cache: "no-store", redirect: "error" });
    if (!upstream.ok) return upstreamError(upstream.status, await safeJson(upstream));
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-length", "content-disposition"]) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "Private download file is unavailable." }, { status: 503 });
  }
}

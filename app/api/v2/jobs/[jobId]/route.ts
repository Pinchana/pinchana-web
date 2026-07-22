import { apiUrl, bearer, safeJson, sessionToken } from "@/lib/pinchana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ jobId: string }> }
) {
  const token = await sessionToken();
  if (!token) return new Response(null, { status: 401 });

  const { jobId } = await props.params;
  const targetUrl = await apiUrl(`/v2/jobs/${jobId}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: { ...bearer(token) },
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
    });
    const payload = await safeJson(upstream);
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);

    return Response.json(payload, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response(JSON.stringify({ status: "failed", error: "Job service unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }
}

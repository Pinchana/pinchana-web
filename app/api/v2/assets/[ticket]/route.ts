import { apiUrl, bearer, sessionToken } from "@/lib/pinchana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVED_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "content-disposition",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
  "x-content-type-options",
];

function copyApprovedHeaders(from: Headers, to: Headers) {
  for (const key of APPROVED_HEADERS) {
    const val = from.get(key);
    if (val) {
      to.set(key, val);
    }
  }
}

async function handleAssetProxy(
  request: Request,
  paramsPromise: Promise<{ ticket: string }>
) {
  const token = await sessionToken();
  if (!token) return new Response(null, { status: 401 });

  const { ticket } = await paramsPromise;
  const headers = new Headers(bearer(token));

  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  const ifRange = request.headers.get("if-range");
  if (ifRange) headers.set("if-range", ifRange);

  const targetUrl = await apiUrl(`/v2/assets/${ticket}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
    });

    const responseHeaders = new Headers();
    copyApprovedHeaders(upstream.headers, responseHeaders);

    if (request.method === "HEAD") {
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ ticket: string }> }
) {
  return handleAssetProxy(request, props.params);
}

export async function HEAD(
  request: Request,
  props: { params: Promise<{ ticket: string }> }
) {
  return handleAssetProxy(request, props.params);
}

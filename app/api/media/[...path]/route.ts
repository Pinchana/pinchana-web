import { apiUrl, bearer, sessionToken } from "@/lib/pinchana";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/media/[...path]">,
) {
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });

  const { path } = await context.params;
  if (!path?.length || path.some((part) => !part || part === "." || part === "..")) {
    return Response.json({ error: "Invalid media path." }, { status: 400 });
  }

  try {
    const headers = new Headers(bearer(token));
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);
    const upstream = await fetch(
      await apiUrl(`/web/media/${path.map(encodeURIComponent).join("/")}`),
      { headers, cache: "no-store", redirect: "error" },
    );
    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: upstream.status === 401 ? "Verification expired." : "Media unavailable." },
        { status: upstream.status },
      );
    }

    const responseHeaders = new Headers();
    for (const name of [
      "accept-ranges",
      "content-disposition",
      "content-length",
      "content-range",
      "content-type",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("Cache-Control", "private, no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Media service unavailable." }, { status: 503 });
  }
}

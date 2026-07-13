import {
  apiUrl,
  bearer,
  rewriteMediaUrls,
  safeJson,
  sessionToken,
  upstreamError,
} from "@/lib/pinchana";

export async function POST(request: Request) {
  const token = await sessionToken();
  if (!token) return Response.json({ error: "Verification required." }, { status: 401 });

  let url: string;
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const parsed = new URL(body.url);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
  } catch {
    return Response.json({ error: "Enter a valid public URL." }, { status: 400 });
  }

  try {
    const upstream = await fetch(await apiUrl("/web/scrape"), {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      cache: "no-store",
      redirect: "error",
    });
    const payload = await safeJson(upstream);
    if (!upstream.ok) return upstreamError(upstream.status, payload);
    return Response.json(rewriteMediaUrls(payload));
  } catch {
    return Response.json({ error: "Pinchana is temporarily unavailable." }, { status: 503 });
  }
}

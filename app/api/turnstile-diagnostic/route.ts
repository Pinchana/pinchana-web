type DiagnosticPhase = "background" | "interactive";

function browserFamily(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) return "edge";
  if (/Firefox\//i.test(userAgent)) return "firefox";
  if (/Chrome\//i.test(userAgent)) return "chrome";
  if (/Safari\//i.test(userAgent)) return "safari";
  return "other";
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (fetchSite && fetchSite !== "same-origin") return new Response(null, { status: 403 });
  if (!fetchSite && !origin) return new Response(null, { status: 403 });
  const requestHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim()
    || request.headers.get("host");
  if (origin && requestHost) {
    try {
      if (new URL(origin).host !== requestHost) return new Response(null, { status: 403 });
    } catch {
      return new Response(null, { status: 403 });
    }
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 512) return new Response(null, { status: 413 });

  let body: { code?: unknown; phase?: unknown };
  try {
    body = await request.json() as { code?: unknown; phase?: unknown };
  } catch {
    return new Response(null, { status: 400 });
  }

  const code = typeof body.code === "string" && /^\d{5,6}$/.test(body.code) ? body.code : null;
  const phase: DiagnosticPhase | null = body.phase === "background" || body.phase === "interactive" ? body.phase : null;
  if (!code || !phase) return new Response(null, { status: 400 });

  console.warn("turnstile_client_error", JSON.stringify({
    code,
    phase,
    browser: browserFamily(request.headers.get("user-agent") || ""),
  }));
  return new Response(null, { status: 204 });
}

import { apiUrl, safeJson } from "@/lib/pinchana";
import { sanitizeBuildManifest } from "../../lib/diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = await fetch(await apiUrl("/web/build"), { cache: "no-store", redirect: "error" });
    if (!upstream.ok) throw new Error("Build manifest unavailable");
    return Response.json(sanitizeBuildManifest(await safeJson(upstream)), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(sanitizeBuildManifest(null), { headers: { "Cache-Control": "no-store" } });
  }
}

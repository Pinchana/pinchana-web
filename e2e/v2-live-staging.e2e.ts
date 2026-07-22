import { expect, test, type APIRequestContext } from "@playwright/test";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

type LiveCase = { url: string; moduleOrigin: string };

const REQUIRED_CASES = [
  "instagram_single_video",
  "instagram_carousel",
  "threads_single_image",
  "threads_carousel",
  "twitter_single_image",
  "twitter_album",
  "twitter_video",
  "twitter_gif",
  "tiktok_video",
  "tiktok_photo_carousel",
  "tiktok_video_soundtrack",
] as const;

const CASE_ENV: Record<(typeof REQUIRED_CASES)[number], { url: string; origin: string }> = {
  instagram_single_video: { url: "PINCHANA_LIVE_INSTAGRAM_SINGLE_VIDEO_URL", origin: "PINCHANA_LIVE_INSTAGRAM_ORIGIN" },
  instagram_carousel: { url: "PINCHANA_LIVE_INSTAGRAM_CAROUSEL_URL", origin: "PINCHANA_LIVE_INSTAGRAM_ORIGIN" },
  threads_single_image: { url: "PINCHANA_LIVE_THREADS_IMAGE_URL", origin: "PINCHANA_LIVE_THREADS_ORIGIN" },
  threads_carousel: { url: "PINCHANA_LIVE_THREADS_CAROUSEL_URL", origin: "PINCHANA_LIVE_THREADS_ORIGIN" },
  twitter_single_image: { url: "PINCHANA_LIVE_TWITTER_IMAGE_URL", origin: "PINCHANA_LIVE_TWITTER_ORIGIN" },
  twitter_album: { url: "PINCHANA_LIVE_TWITTER_ALBUM_URL", origin: "PINCHANA_LIVE_TWITTER_ORIGIN" },
  twitter_video: { url: "PINCHANA_LIVE_TWITTER_VIDEO_URL", origin: "PINCHANA_LIVE_TWITTER_ORIGIN" },
  twitter_gif: { url: "PINCHANA_LIVE_TWITTER_GIF_URL", origin: "PINCHANA_LIVE_TWITTER_ORIGIN" },
  tiktok_video: { url: "PINCHANA_LIVE_TIKTOK_VIDEO_URL", origin: "PINCHANA_LIVE_TIKTOK_ORIGIN" },
  tiktok_photo_carousel: { url: "PINCHANA_LIVE_TIKTOK_PHOTO_CAROUSEL_URL", origin: "PINCHANA_LIVE_TIKTOK_ORIGIN" },
  tiktok_video_soundtrack: { url: "PINCHANA_LIVE_TIKTOK_SOUNDTRACK_URL", origin: "PINCHANA_LIVE_TIKTOK_ORIGIN" },
};

function liveConfiguration(): {
  apiOrigin: string;
  session: string;
  cachePath: string;
  cases: Record<string, LiveCase>;
} | null {
  const apiOrigin = process.env.PINCHANA_LIVE_API_ORIGIN;
  const session = process.env.PINCHANA_LIVE_WEB_SESSION;
  const cachePath = process.env.PINCHANA_LIVE_CACHE_PATH;
  const encodedCases = process.env.PINCHANA_LIVE_CASES;
  if (!apiOrigin || !session || !cachePath) return null;
  const cases = encodedCases
    ? JSON.parse(encodedCases) as Record<string, LiveCase>
    : Object.fromEntries(REQUIRED_CASES.flatMap((name) => {
      const source = CASE_ENV[name];
      const url = process.env[source.url];
      const moduleOrigin = process.env[source.origin];
      return url && moduleOrigin ? [[name, { url, moduleOrigin }]] : [];
    }));
  return { apiOrigin: apiOrigin.replace(/\/$/, ""), session, cachePath, cases };
}

async function fileSnapshot(root: string): Promise<string[]> {
  const base = resolve(root);
  const results: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (!path.startsWith(`${base}/`)) throw new Error("cache traversal");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) results.push(`${path.slice(base.length)}:${(await stat(path)).size}`);
    }
  }
  await walk(base);
  return results.sort();
}

function containsProtectedDescriptor(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProtectedDescriptor);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (["upstream_url", "credential_ref", "safe_headers"].some((key) => key in record)) return true;
  return Object.values(record).some(containsProtectedDescriptor);
}

function webPayload(value: Record<string, unknown>): Record<string, unknown> {
  if (value.status === "processing") {
    return { ...value, status_url: `/api${String(value.status_url)}` };
  }
  const assets = Array.isArray(value.assets) ? value.assets : [];
  return {
    ...value,
    assets: assets.map((asset) => {
      const item = asset as Record<string, unknown>;
      const delivery = item.delivery as Record<string, unknown>;
      return { ...item, delivery: { ...delivery, url: `/api${String(delivery.url)}` } };
    }),
  };
}

async function forwardJson(
  request: APIRequestContext,
  target: string,
  session: string,
  data?: unknown,
) {
  const response = data === undefined
    ? await request.get(target, { headers: { authorization: `Bearer ${session}` } })
    : await request.post(target, {
      headers: { authorization: `Bearer ${session}` },
      data,
    });
  return { response, json: await response.json() as Record<string, unknown> };
}

const config = liveConfiguration();

test.describe("opt-in Phase 4A live staging", () => {
  test.skip(!config, "set PINCHANA_LIVE_API_ORIGIN, PINCHANA_LIVE_WEB_SESSION, and PINCHANA_LIVE_CACHE_PATH");

  for (const name of REQUIRED_CASES) {
    test(`${name} preserves zero-cache browser delivery`, async ({ page, request }) => {
      test.skip(!config?.cases[name], `set ${CASE_ENV[name].url} and ${CASE_ENV[name].origin}`);
      test.setTimeout(180_000);
      const live = config!;
      const target = live.cases[name]!;
      const beforeCache = await fileSnapshot(live.cachePath);
      let resolvedPayload: Record<string, unknown> | null = null;
      const assetTransfers: string[] = [];

      await page.route("/api/session", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verified: true, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      }));
      await page.route("/api/scrape", async (route) => {
        const submitted = route.request().postDataJSON();
        const result = await forwardJson(request, `${live.apiOrigin}/v2/scrape`, live.session, submitted);
        resolvedPayload = result.json;
        await route.fulfill({
          status: result.response.status(),
          contentType: "application/json",
          body: JSON.stringify(webPayload(result.json)),
        });
      });
      await page.route(/\/api\/v2\/jobs\/[^/?]+/, async (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
        const result = await forwardJson(request, `${live.apiOrigin}${path}`, live.session);
        resolvedPayload = result.json.status === "ready" ? result.json : resolvedPayload;
        await route.fulfill({
          status: result.response.status(),
          contentType: "application/json",
          body: JSON.stringify(webPayload(result.json)),
        });
      });
      await page.route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
        assetTransfers.push(route.request().url());
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
        const upstream = await request.get(`${live.apiOrigin}${path}`, {
          headers: { authorization: `Bearer ${live.session}` },
        });
        await route.fulfill({
          status: upstream.status(),
          headers: upstream.headers(),
          body: await upstream.body(),
        });
      });

      await page.addInitScript(() => {
        localStorage.setItem("pinchana-settings", JSON.stringify({
          autoSave: false,
          convertTwitterGifs: false,
          zipMultiple: false,
        }));
      });
      await page.goto("/");
      await page.waitForSelector("#media-url:not([disabled])");
      await page.fill("#media-url", target.url);
      await page.click("button[type='submit']");
      await page.waitForSelector(".compact-result-card", { timeout: 120_000 });

      expect(assetTransfers).toHaveLength(0);
      await expect(page.locator(".compact-result-card img, .compact-result-card video, .compact-result-card audio")).toHaveCount(0);
      expect(resolvedPayload).not.toBeNull();
      expect(containsProtectedDescriptor(resolvedPayload)).toBe(false);

      const ready = resolvedPayload!;
      const assets = ready.assets as Array<Record<string, unknown>>;
      expect(assets.length).toBeGreaterThan(0);
      if (name === "twitter_gif") expect(assets.some((asset) => asset.looping === true)).toBe(true);
      if (name === "tiktok_video_soundtrack") {
        expect(assets.some((asset) => asset.role === "soundtrack")).toBe(true);
      }

      const moduleResponse = await request.post(`${target.moduleOrigin.replace(/\/$/, "")}/v2/scrape`, {
        data: { url: target.url },
      });
      expect(moduleResponse.ok()).toBe(true);
      const descriptors = (await moduleResponse.json()).assets as Array<Record<string, unknown>>;
      for (const asset of assets) {
        const descriptor = descriptors.find((candidate) => candidate.asset_id === asset.asset_key);
        const delivery = asset.delivery as Record<string, unknown>;
        if (descriptor?.expires_at) {
          expect(Number(delivery.expires_at)).toBeLessThanOrEqual(Number(descriptor.expires_at) - 60);
        }
        if (descriptor?.supports_range) {
          const path = String(delivery.url);
          const range = await request.get(`${live.apiOrigin}${path}`, {
            headers: {
              authorization: `Bearer ${live.session}`,
              range: "bytes=0-0",
            },
          });
          expect(range.status()).toBe(206);
          expect(range.headers()["content-range"]).toMatch(/^bytes 0-0\//);
          const contentType = range.headers()["content-type"]?.split(";", 1)[0];
          const disposition = range.headers()["content-disposition"] || "";
          if (contentType === "image/webp") expect(disposition).toMatch(/\.webp"?$/i);
          if (contentType === "video/mp4") expect(disposition).toMatch(/\.mp4"?$/i);
        }
      }

      const download = page.waitForEvent("download");
      await page.locator("a.download-asset-btn, button.download-asset-btn").first().click();
      await download;
      await expect.poll(() => assetTransfers.length).toBe(1);
      const afterCache = await fileSnapshot(live.cachePath);
      expect(afterCache).toEqual(beforeCache);
    });
  }
});

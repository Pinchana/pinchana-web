import { expect, test, type APIRequestContext } from "@playwright/test";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

type Availability = "full" | "preview" | "metadata-only";
type AudioLiveCase = {
  url: string;
  moduleOrigin: string;
  availability: Availability;
  collection?: boolean;
};

const AUDIO_CASES = [
  { name: "soundcloud_progressive", url: "PINCHANA_LIVE_SOUNDCLOUD_PROGRESSIVE_URL", origin: "PINCHANA_LIVE_SOUNDCLOUD_ORIGIN", availability: "full" },
  { name: "soundcloud_hls", url: "PINCHANA_LIVE_SOUNDCLOUD_HLS_URL", origin: "PINCHANA_LIVE_SOUNDCLOUD_ORIGIN", availability: "full" },
  { name: "soundcloud_set", url: "PINCHANA_LIVE_SOUNDCLOUD_SET_URL", origin: "PINCHANA_LIVE_SOUNDCLOUD_ORIGIN", availability: "metadata-only", collection: true },
  { name: "spotify_preview", url: "PINCHANA_LIVE_SPOTIFY_PREVIEW_URL", origin: "PINCHANA_LIVE_SPOTIFY_ORIGIN", availability: "preview" },
  { name: "spotify_metadata", url: "PINCHANA_LIVE_SPOTIFY_METADATA_URL", origin: "PINCHANA_LIVE_SPOTIFY_ORIGIN", availability: "metadata-only" },
  { name: "spotify_collection", url: "PINCHANA_LIVE_SPOTIFY_COLLECTION_URL", origin: "PINCHANA_LIVE_SPOTIFY_ORIGIN", availability: "metadata-only", collection: true },
  { name: "deezer_preview", url: "PINCHANA_LIVE_DEEZER_PREVIEW_URL", origin: "PINCHANA_LIVE_DEEZER_ORIGIN", availability: "preview" },
  { name: "deezer_collection", url: "PINCHANA_LIVE_DEEZER_COLLECTION_URL", origin: "PINCHANA_LIVE_DEEZER_ORIGIN", availability: "metadata-only", collection: true },
  { name: "ytmusic_track", url: "PINCHANA_LIVE_YTMUSIC_TRACK_URL", origin: "PINCHANA_LIVE_YTMUSIC_ORIGIN", availability: "full" },
  { name: "ytmusic_playlist", url: "PINCHANA_LIVE_YTMUSIC_PLAYLIST_URL", origin: "PINCHANA_LIVE_YTMUSIC_ORIGIN", availability: "metadata-only", collection: true },
] as const satisfies ReadonlyArray<{
  name: string;
  url: string;
  origin: string;
  availability: Availability;
  collection?: boolean;
}>;

function configuration(): {
  apiOrigin: string;
  session: string;
  cachePath: string;
  cases: Record<string, AudioLiveCase>;
} | null {
  const apiOrigin = process.env.PINCHANA_LIVE_API_ORIGIN;
  const session = process.env.PINCHANA_LIVE_WEB_SESSION;
  const cachePath = process.env.PINCHANA_LIVE_CACHE_PATH;
  const encoded = process.env.PINCHANA_LIVE_AUDIO_CASES;
  if (!apiOrigin || !session || !cachePath) return null;
  const cases = encoded
    ? JSON.parse(encoded) as Record<string, AudioLiveCase>
    : Object.fromEntries(AUDIO_CASES.flatMap((entry) => {
      const url = process.env[entry.url];
      const moduleOrigin = process.env[entry.origin];
      return url && moduleOrigin
        ? [[entry.name, {
          url,
          moduleOrigin,
          availability: entry.availability,
          collection: "collection" in entry ? entry.collection : false,
        }]]
        : [];
    }));
  return { apiOrigin: apiOrigin.replace(/\/$/, ""), session, cachePath, cases };
}

async function cacheSnapshot(root: string): Promise<string[]> {
  const base = resolve(root);
  const files: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (!path.startsWith(`${base}/`)) throw new Error("cache traversal");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(`${path.slice(base.length)}:${(await stat(path)).size}`);
    }
  }
  await walk(base);
  return files.sort();
}

function containsProtectedData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProtectedData);
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (["upstream_url", "credential_ref", "safe_headers"].some((key) => key in record)) return true;
  return Object.values(record).some(containsProtectedData);
}

function proxyPayload(value: Record<string, unknown>): Record<string, unknown> {
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

async function gatewayJson(
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

const live = configuration();

test.describe("opt-in Phase 4B audio staging", () => {
  test.skip(!live, "set PINCHANA_LIVE_API_ORIGIN, PINCHANA_LIVE_WEB_SESSION, PINCHANA_LIVE_CACHE_PATH, and PINCHANA_LIVE_AUDIO_CASES");

  test("live audio case configuration is valid", () => {
    test.skip(Object.keys(live?.cases ?? {}).length === 0, "set at least one PINCHANA_LIVE_* audio case URL");
    expect(Object.keys(live!.cases).length).toBeGreaterThan(0);
  });

  for (const entry of AUDIO_CASES) {
    const name = entry.name;
    test(`${name} preserves truthful preview-free delivery`, async ({ page, request }) => {
      test.skip(!live?.cases[name], `set ${entry.url} and ${entry.origin}`);
      test.setTimeout(240_000);
      const config = live!;
      const audioCase = config.cases[name]!;
      const beforeCache = await cacheSnapshot(config.cachePath);
      const assetTransfers: string[] = [];
      let readyPayload: Record<string, unknown> | null = null;

      const moduleResponse = await request.post(`${audioCase.moduleOrigin.replace(/\/$/, "")}/v2/scrape`, {
        data: { url: audioCase.url },
      });
      expect(moduleResponse.ok()).toBe(true);
      const extracted = await moduleResponse.json() as Record<string, unknown>;
      expect(extracted.availability).toBe(audioCase.availability);

      await page.route("/api/session", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          verified: true,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          dlp_available: new URL(audioCase.url).hostname === "music.youtube.com",
        }),
      }));
      await page.route("/api/scrape", async (route) => {
        const result = await gatewayJson(
          request,
          `${config.apiOrigin}/v2/scrape`,
          config.session,
          route.request().postDataJSON(),
        );
        if (result.json.status === "ready") readyPayload = result.json;
        await route.fulfill({
          status: result.response.status(),
          contentType: "application/json",
          body: JSON.stringify(proxyPayload(result.json)),
        });
      });
      await page.route(/\/api\/v2\/jobs\/[^/?]+/, async (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
        const result = await gatewayJson(request, `${config.apiOrigin}${path}`, config.session);
        if (result.json.status === "ready") readyPayload = result.json;
        await route.fulfill({
          status: result.response.status(),
          contentType: "application/json",
          body: JSON.stringify(proxyPayload(result.json)),
        });
      });
      await page.route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
        assetTransfers.push(route.request().url());
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
        const response = await request.get(`${config.apiOrigin}${path}`, {
          headers: { authorization: `Bearer ${config.session}` },
        });
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: await response.body(),
        });
      });

      await page.addInitScript(() => {
        localStorage.setItem("pinchana-settings", JSON.stringify({
          autoSave: false,
          zipMultiple: false,
        }));
      });
      await page.goto("/");
      await page.waitForSelector("#media-url:not([disabled])");
      await page.fill("#media-url", audioCase.url);
      await page.click("button[type='submit']");
      await page.waitForSelector(".compact-result-card", { timeout: 180_000 });

      expect(assetTransfers).toHaveLength(0);
      await expect(page.locator(".compact-result-card img, .compact-result-card audio, .compact-result-card video")).toHaveCount(0);
      expect(readyPayload).not.toBeNull();
      expect(containsProtectedData(readyPayload)).toBe(false);
      const content = readyPayload!.content as Record<string, unknown>;
      expect(content.availability).toBe(audioCase.availability);
      const assets = readyPayload!.assets as Array<Record<string, unknown>>;
      const collection = readyPayload!.collection as Array<Record<string, unknown>>;

      if (audioCase.collection) {
        expect(collection.length).toBeGreaterThan(0);
        expect(assets).toHaveLength(0);
        await expect(page.locator(".download-asset-btn")).toHaveCount(0);
      } else if (assets.some((asset) => asset.type === "audio")) {
        const audio = assets.find((asset) => asset.type === "audio")!;
        expect(audio.availability).toBe(audioCase.availability);
        const descriptors = Array.isArray(extracted.assets)
          ? extracted.assets as Array<Record<string, unknown>>
          : [];
        const descriptor = descriptors.find((item) => item.asset_id === audio.asset_key);
        const delivery = audio.delivery as Record<string, unknown>;
        if (descriptor?.expires_at) {
          expect(Number(delivery.expires_at)).toBeLessThanOrEqual(Number(descriptor.expires_at) - 60);
        }
        if (descriptor?.supports_range) {
          const range = await request.get(`${config.apiOrigin}${String(delivery.url)}`, {
            headers: {
              authorization: `Bearer ${config.session}`,
              range: "bytes=0-0",
            },
          });
          expect(range.status()).toBe(206);
          expect(range.headers()["content-range"]).toMatch(/^bytes 0-0\//);
          const mime = range.headers()["content-type"]?.split(";", 1)[0];
          const disposition = range.headers()["content-disposition"] || "";
          if (mime === "audio/mpeg") expect(disposition).toMatch(/\.mp3"?$/i);
        }
        const download = page.waitForEvent("download");
        await page.locator("a.download-asset-btn, button.download-asset-btn").first().click();
        await download;
        await expect.poll(() => assetTransfers.length).toBe(1);
      } else {
        await expect(page.locator(".download-asset-btn")).toHaveCount(0);
      }

      expect(await cacheSnapshot(config.cachePath)).toEqual(beforeCache);
    });
  }
});

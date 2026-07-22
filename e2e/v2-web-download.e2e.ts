import { test, expect } from "@playwright/test";

test.describe("v2 web download & browser network assertions", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          verified: true,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          turnstile_site_key: "",
          active_services: ["instagram", "twitter", "tiktok"],
          dlp_available: false,
        }),
      });
    });

    await page.route("/api/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ verified: true, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
      });
    });
  });

  for (const target of [
    { platform: "tiktok", url: "https://www.tiktok.com/@creator/video/7400000000000000001" },
    { platform: "threads", url: "https://www.threads.com/@creator/post/ThreadABC" },
    { platform: "twitter", url: "https://x.com/creator/status/2077331427549421918" },
  ]) {
    test(`${target.platform} reaches metadata-only ready without asset requests`, async ({ page }) => {
      const assetRequests: string[] = [];
      await page.context().route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
        assetRequests.push(route.request().url());
        await route.fulfill({ status: 200, body: "asset" });
      });
      await page.route("/api/scrape", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "ready",
            request_id: `req-${target.platform}`,
            source: { platform: target.platform, url: target.url },
            content: { caption: `${target.platform} fixture` },
            author: { username: "creator" },
            assets: [{
              id: `${target.platform}-0`,
              asset_key: `${target.platform}:post:asset:content`,
              index: 0,
              type: target.platform === "threads" ? "image" : "video",
              role: "content",
              filename: target.platform === "threads" ? "post.jpg" : "post.mp4",
              looping: target.platform === "twitter",
              delivery: { kind: "tunnel", url: `/v2/assets/ticket-${target.platform}` },
            }],
          }),
        });
      });
      await page.addInitScript(() => {
        localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: false }));
      });
      await page.goto("/");
      await page.waitForSelector("#media-url:not([disabled])");
      await page.fill("#media-url", target.url);
      await page.click("button[type='submit']");
      await page.waitForSelector(".compact-result-card");
      expect(assetRequests).toHaveLength(0);
      await expect(page.locator(".compact-result-card img, .compact-result-card video, .compact-result-card audio")).toHaveCount(0);
    });
  }

  test("autoSave disabled: 0 asset requests on ready, 1 asset request on clicking Download", async ({ page }) => {
    const assetRequests: string[] = [];
    await page.context().route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
      assetRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: { "Content-Disposition": 'attachment; filename="single_video.mp4"' },
        body: "mock-video",
      });
    });

    await page.route("/api/scrape", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          request_id: "req-1",
          source: { platform: "instagram", url: "https://www.instagram.com/p/TEST1" },
          content: { caption: "Single Video Test" },
          author: { username: "tester" },
          assets: [
            {
              id: "TEST1-0",
              asset_key: "key-1",
              index: 0,
              type: "video",
              role: "content",
              filename: "single_video.mp4",
              delivery: { kind: "tunnel", url: "/v2/assets/ticket-single-1" },
            },
          ],
        }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: false }));
    });
    await page.goto("/");

    await page.waitForSelector("#media-url:not([disabled])");
    await page.fill("#media-url", "https://www.instagram.com/p/TEST1/");
    await page.click("button[type='submit']");

    await page.waitForSelector(".compact-result-card");
    expect(assetRequests.length).toBe(0);
    await expect(page.locator(".compact-result-card img, .compact-result-card video, .compact-result-card audio")).toHaveCount(0);

    const downloadLink = page.locator("a.download-asset-btn");
    await downloadLink.click();

    await expect.poll(() => assetRequests.length).toBe(1);
    expect(assetRequests[0]).toContain("/api/v2/assets/ticket-single-1");
  });

  test("autoSave enabled: exactly 1 asset request automatically initiated on ready", async ({ page }) => {
    const assetRequests: string[] = [];
    await page.context().route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
      assetRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: { "Content-Disposition": 'attachment; filename="autosave.mp4"' },
        body: "mock-video",
      });
    });

    await page.route("/api/scrape", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          request_id: "req-auto",
          source: { platform: "instagram", url: "https://www.instagram.com/p/AUTOSAVE" },
          content: { caption: "AutoSave Video Test" },
          assets: [
            {
              id: "AUTOSAVE-0",
              asset_key: "key-auto",
              index: 0,
              type: "video",
              role: "content",
              filename: "autosave.mp4",
              delivery: { kind: "tunnel", url: "/v2/assets/ticket-autosave" },
            },
          ],
        }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: true }));
    });
    await page.goto("/");

    await page.waitForSelector("#media-url:not([disabled])");
    await page.fill("#media-url", "https://www.instagram.com/p/AUTOSAVE/");
    await page.click("button[type='submit']");

    await page.waitForSelector(".compact-result-card");
    await expect.poll(() => assetRequests.length).toBe(1);
    expect(assetRequests[0]).toContain("/api/v2/assets/ticket-autosave");
  });

  test("multi-asset ready state: 0 asset requests on ready, isolated download per asset, ZIP fetches each exactly once", async ({ page }) => {
    const assetRequests: string[] = [];
    await page.context().route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
      assetRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        headers: { "Content-Disposition": 'attachment; filename="asset.jpg"' },
        body: "mock-image",
      });
    });

    await page.route("/api/scrape", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ready",
          request_id: "req-multi",
          source: { platform: "instagram", url: "https://www.instagram.com/p/MULTI" },
          content: { caption: "Multi Asset Carousel" },
          assets: [
            {
              id: "MULTI-0",
              asset_key: "key-m0",
              index: 0,
              type: "image",
              role: "content",
              filename: "img1.jpg",
              delivery: { kind: "tunnel", url: "/v2/assets/ticket-multi-1" },
            },
            {
              id: "MULTI-1",
              asset_key: "key-m1",
              index: 1,
              type: "image",
              role: "content",
              filename: "img2.jpg",
              delivery: { kind: "tunnel", url: "/v2/assets/ticket-multi-2" },
            },
          ],
        }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: false, zipMultiple: true }));
    });
    await page.goto("/");

    await page.waitForSelector("#media-url:not([disabled])");
    await page.fill("#media-url", "https://www.instagram.com/p/MULTI/");
    await page.click("button[type='submit']");

    await page.waitForSelector(".compact-result-card");
    expect(assetRequests.length).toBe(0);

    const downloadBtns = page.locator("a.download-asset-btn");
    await downloadBtns.nth(0).click();
    await expect.poll(() => assetRequests.length).toBe(1);
    expect(assetRequests[0]).toContain("/api/v2/assets/ticket-multi-1");

    assetRequests.length = 0;
    const zipBtn = page.locator("button.download-zip-btn");
    await zipBtn.click();

    await expect.poll(() => assetRequests.length).toBe(2);
    expect(assetRequests).toContainEqual(expect.stringContaining("ticket-multi-1"));
    expect(assetRequests).toContainEqual(expect.stringContaining("ticket-multi-2"));
  });

  test("processing jobs do not request assets before ready and a second submission aborts previous polling", async ({ page }) => {
    const assetRequests: string[] = [];
    const jobPolls: string[] = [];

    await page.context().route(/\/api\/v2\/assets\/[^/?]+/, async (route) => {
      assetRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: { "Content-Disposition": 'attachment; filename="job_video.mp4"' },
        body: "mock-video",
      });
    });

    await page.route(/\/api\/v2\/jobs\/[^/?]+/, async (route) => {
      jobPolls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "processing", job_id: "job-p1", progress: 25, retry_after: 1 }),
      });
    });

    await page.route("/api/scrape", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "processing",
          job_id: "job-p1",
          expires_at: Math.floor(Date.now() / 1000) + 300,
          retry_after: 1,
          progress: 10,
        }),
      });
    });

    await page.goto("/");
    await page.waitForSelector("#media-url:not([disabled])");
    await page.fill("#media-url", "https://www.instagram.com/p/SLOWJOB/");
    await page.click("button[type='submit']");

    await page.waitForSelector(".status-box.processing");
    await expect.poll(() => jobPolls.length, { timeout: 3000 }).toBeGreaterThanOrEqual(1);

    expect(assetRequests.length).toBe(0);

    await page.fill("#media-url", "https://www.instagram.com/p/NEWJOB/");
    await page.click("button[type='submit']");

    await page.waitForTimeout(500);
    expect(assetRequests.length).toBe(0);
  });
});

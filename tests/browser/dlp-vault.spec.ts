import { expect, Page, test } from "@playwright/test";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=abcdefghijk";
const COOKIE_MARKER = "COOKIE_MARKER_NEVER_PERSIST";
const COOKIE_FILE = `# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\t${COOKIE_MARKER}\n`;

async function boot(page: Page, dlpAvailable = true) {
  await page.addInitScript(() => localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: false, downloadMode: "media" })));
  await page.route("**/api/instance", (route) => route.fulfill({ json: { custom: false, turnstile_site_key: "" } }));
  await page.route("**/api/session", (route) => route.fulfill({ json: { valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } }));
  await page.route("**/api/capabilities", (route) => route.fulfill({ json: { dlp: {
    available: dlpAvailable,
    protocol: dlpAvailable ? 2 : null,
    qualities: dlpAvailable ? ["best", "8k", "4k", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p", "audio"] : [],
    codecs: dlpAvailable ? ["auto", "h264", "av1", "vp9"] : [],
    containers: dlpAvailable ? ["auto", "mp4", "webm", "mkv"] : [],
  } } }));
  await page.goto("/");
  await expect(page.getByPlaceholder("Paste a link")).toBeEnabled();
}

async function openVault(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("tab", { name: /Cookie Vault/ }).click();
  await expect(page.getByRole("heading", { name: "Cookie Vault" })).toBeVisible();
}

async function createAndImport(page: Page, viaFile = false) {
  await openVault(page);
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByLabel("Profile name").fill("YouTube personal");
  if (viaFile) {
    await page.getByLabel("Choose cookies.txt").setInputFiles({ name: "cookies.txt", mimeType: "text/plain", buffer: Buffer.from(COOKIE_FILE) });
  } else {
    await page.getByLabel("Or paste Netscape cookies.txt").fill(COOKIE_FILE);
    await page.getByRole("button", { name: "Import pasted cookies" }).click();
  }
  await expect(page.getByText("youtube.com", { exact: true })).toBeVisible();
}

async function mockReadyDlp(page: Page, inspectSubmission?: (body: string) => void) {
  const jobId = "12345678-1234-4234-9234-123456789abc";
  const workerPublic = "dGVzdHRlc3R0ZXN0dGVzdHRlc3R0ZXN0dGVzdHRlc3Q=";
  await page.route("**/api/dlp/jobs", (route) => route.fulfill({ json: { jobId, keyId: "wk-browser-test", workerPubKey: workerPublic, expiresAt: Math.floor(Date.now() / 1000) + 300 } }));
  await page.route(`**/api/dlp/jobs/${jobId}/file`, (route) => route.fulfill({ body: "private-media", headers: { "Content-Type": "video/mp4", "Content-Disposition": "attachment; filename=media.mp4" } }));
  await page.route(`**/api/dlp/jobs/${jobId}`, (route) => {
    if (route.request().method() === "POST") {
      inspectSubmission?.(route.request().postData() || "");
      return route.fulfill({ json: { jobId, status: "QUEUED" } });
    }
    return route.fulfill({ json: { jobId, status: "READY", expiresAt: Math.floor(Date.now() / 1000) + 300 } });
  });
}

test("file and paste imports stay encrypted and vault locks after restart", async ({ page }) => {
  await boot(page);
  await createAndImport(page, true);
  const persisted = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("pinchana-cookie-vault"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return await new Promise<string>((resolve, reject) => { const request = database.transaction("vault").objectStore("vault").get("primary"); request.onsuccess = () => resolve(JSON.stringify(request.result)); request.onerror = () => reject(request.error); });
  });
  expect(persisted).not.toContain(COOKIE_MARKER);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(COOKIE_MARKER);
  await page.reload();
  await openVault(page);
  await expect(page.getByRole("button", { name: "Unlock vault" })).toBeVisible();
  await page.getByLabel("Vault passphrase").fill("wrong passphrase value");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.getByText(/passphrase is incorrect/i)).toBeVisible();
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No cookie profiles yet.")).toBeVisible();
});

test("anonymous and authenticated YouTube jobs use DLP with no plaintext network marker", async ({ page }) => {
  await boot(page);
  let anonymousBody = "";
  await mockReadyDlp(page, (body) => { anonymousBody = body; });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: /Private downloads/ }).click();
  await page.getByRole("radio", { name: "4K" }).click();
  await page.getByRole("radio", { name: "AV1 + Opus" }).click();
  await page.getByRole("radio", { name: "MKV" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByPlaceholder("Paste a link").fill(YOUTUBE_URL);
  const anonymousDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Process URL" }).click();
  await anonymousDownload;
  expect(anonymousBody).not.toContain("cookiesEnc");
  expect(JSON.parse(anonymousBody)).toMatchObject({ quality: "4k", codec: "av1", container: "mkv" });

  await createAndImport(page);
  await page.getByRole("button", { name: "Close settings" }).click();
  let authenticatedBody = "";
  await page.unrouteAll({ behavior: "wait" });
  await boot(page);
  await mockReadyDlp(page, (body) => { authenticatedBody = body; });
  await openVault(page);
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: /YouTube personal/ }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByPlaceholder("Paste a link").fill(YOUTUBE_URL);
  const authenticatedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Process URL" }).click();
  await authenticatedDownload;
  expect(authenticatedBody).toContain("cookiesEnc");
  expect(authenticatedBody).not.toContain(COOKIE_MARKER);
});

test("ordinary URLs use scrape unless Private mode is enabled", async ({ page }) => {
  await boot(page);
  let scrapeCalls = 0;
  await page.route("**/api/scrape", (route) => { scrapeCalls += 1; return route.fulfill({ json: { shortcode: "id", caption: "", author: "", media_type: "video", thumbnail_url: "/file.jpg", video_url: "/file.mp4" } }); });
  await page.getByPlaceholder("Paste a link").fill("https://example.com/public-video");
  await page.getByRole("button", { name: "Process URL" }).click();
  await expect.poll(() => scrapeCalls).toBe(1);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: /Private downloads/ }).click();
  await page.getByLabel("Private mode").check();
  await page.getByRole("button", { name: "Close settings" }).click();
  let dlpSubmissions = 0;
  await mockReadyDlp(page, () => { dlpSubmissions += 1; });
  await page.getByPlaceholder("Paste a link").press("Enter");
  await expect.poll(() => dlpSubmissions).toBe(1);
  expect(scrapeCalls).toBe(1);
});

test("custom instances without DLP disable private controls and YouTube submission", async ({ page }) => {
  await boot(page, false);
  await page.getByPlaceholder("Paste a link").fill(YOUTUBE_URL);
  await expect(page.getByRole("button", { name: "Process URL" })).toBeDisabled();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: /Private downloads/ }).click();
  await expect(page.getByLabel("Private mode")).toBeDisabled();
  await expect(page.getByText("Private downloads unavailable")).toBeVisible();
});

test("settings modal navigates responsively and persists preferences instantly", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const trigger = page.getByRole("button", { name: "Settings" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  const generalTab = page.getByRole("tab", { name: /General/ });
  await expect(generalTab).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Reduce motion").check();
  await generalTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Private downloads/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Private downloads" })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("tab", { name: /General/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Reduce motion")).toBeChecked();
});

test("URL vault shortcut opens settings directly on Cookie Vault", async ({ page }) => {
  await boot(page);
  await page.getByPlaceholder("Paste a link").fill(YOUTUBE_URL);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Cookie Vault/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Vault passphrase")).toBeVisible();
});

test("API instance section validates, connects, and restores the default", async ({ page }) => {
  await page.route(/http:\/\/[^/]+\/$/, async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["content-security-policy"];
    await route.fulfill({ response, headers });
  });
  await boot(page);
  await page.unroute("**/api/instance");
  let postAttempts = 0;
  let resetCalls = 0;
  await page.route("https://api.example.com/web/identity", (route) => route.fulfill({
    json: { origin: "https://api.example.com", certificate: "test" },
    headers: { "Access-Control-Allow-Origin": "*" },
  }));
  await page.route("**/api/instance", (route) => {
    if (route.request().method() === "POST") {
      postAttempts += 1;
      if (postAttempts === 1) return route.fulfill({ status: 400, json: { error: "Instance signature rejected." } });
      return route.fulfill({ json: { custom: true, origin: "https://api.example.com", turnstile_site_key: "" } });
    }
    if (route.request().method() === "DELETE") {
      resetCalls += 1;
      return route.fulfill({ json: { custom: false, turnstile_site_key: "" } });
    }
    return route.fulfill({ json: { custom: false, turnstile_site_key: "" } });
  });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: /API instance/ }).click();
  await page.getByLabel("Instance origin").fill("https://api.example.com");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Instance signature rejected.")).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Verified custom Pinchana instance")).toBeVisible();
  await page.getByRole("button", { name: "Use default instance" }).click();
  await expect(page.getByText("Using the default Pinchana API")).toBeVisible();
  expect(resetCalls).toBe(1);
});

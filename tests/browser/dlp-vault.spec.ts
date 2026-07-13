import { expect, Page, test } from "@playwright/test";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=abcdefghijk";
const COOKIE_MARKER = "COOKIE_MARKER_NEVER_PERSIST";
const COOKIE_FILE = `# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\t${COOKIE_MARKER}\n`;

async function boot(page: Page, dlpAvailable = true) {
  await page.addInitScript(() => localStorage.setItem("pinchana-settings", JSON.stringify({ autoSave: false, downloadMode: "media" })));
  await page.route("**/api/instance", (route) => route.fulfill({ json: { custom: false, turnstile_site_key: "" } }));
  await page.route("**/api/session", (route) => route.fulfill({ json: { valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } }));
  await page.route("**/api/capabilities", (route) => route.fulfill({ json: { dlp: { available: dlpAvailable, protocol: dlpAvailable ? 2 : null, qualities: dlpAvailable ? ["best", "audio"] : [] } } }));
  await page.goto("/");
  await expect(page.getByPlaceholder("Paste a link")).toBeEnabled();
}

async function openVault(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Cookie Vault" }).click();
  await expect(page.getByRole("dialog", { name: "Cookie Vault" })).toBeVisible();
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
  await page.getByPlaceholder("Paste a link").fill(YOUTUBE_URL);
  const anonymousDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Process URL" }).click();
  await anonymousDownload;
  expect(anonymousBody).not.toContain("cookiesEnc");

  await createAndImport(page);
  await page.getByRole("button", { name: "Close Cookie Vault" }).click();
  let authenticatedBody = "";
  await page.unrouteAll({ behavior: "wait" });
  await boot(page);
  await mockReadyDlp(page, (body) => { authenticatedBody = body; });
  await openVault(page);
  await page.getByLabel("Vault passphrase").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: /YouTube personal/ }).click();
  await page.getByRole("button", { name: "Close Cookie Vault" }).click();
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
  await page.getByLabel("Private mode").check();
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
  await expect(page.getByLabel("Private mode")).toBeDisabled();
  await expect(page.getByText("This API instance has no DLP capability")).toBeVisible();
});

import { describe, expect, mock, test } from "bun:test";

mock.module("@/lib/pinchana", () => ({
  sessionToken: async () => "session-token-abc",
  bearer: (token: string) => ({ authorization: `Bearer ${token}` }),
  apiUrl: async (path: string) => `http://custom-instance.invalid:8000${path}`,
  safeJson: async (res: Response) => res.json(),
}));

import { GET as handleAssetGet } from "../api/v2/assets/[ticket]/route";
import { GET as handleJobGet } from "../api/v2/jobs/[jobId]/route";

describe("custom-instance binding verification", () => {
  test("resolve, job polling, and asset proxy remain bound to session instance", async () => {
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.includes("/v2/jobs/")) {
        return Response.json({ status: "processing", job_id: "job-999" });
      }
      if (urlStr.includes("/v2/assets/")) {
        return new Response("media-data", { status: 200, headers: { "content-type": "video/mp4" } });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      // 1. Job polling request
      const jobReq = new Request("http://localhost:3000/api/v2/jobs/job-999");
      const jobRes = await handleJobGet(jobReq, { params: Promise.resolve({ jobId: "job-999" }) });
      expect(jobRes.status).toBe(200);

      // 2. Asset proxy request
      const assetReq = new Request("http://localhost:3000/api/v2/assets/ticket-999");
      const assetRes = await handleAssetGet(assetReq, { params: Promise.resolve({ ticket: "ticket-999" }) });
      expect(assetRes.status).toBe(200);

      // Assert that both proxy routes target the bound instance origin (http://custom-instance.invalid:8000)
      expect(fetchedUrls).toContain("http://custom-instance.invalid:8000/v2/jobs/job-999");
      expect(fetchedUrls).toContain("http://custom-instance.invalid:8000/v2/assets/ticket-999");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { describe, expect, mock, test } from "bun:test";

mock.module("@/lib/pinchana", () => ({
  sessionToken: async () => "test-session-token",
  bearer: (token: string) => ({ authorization: `Bearer ${token}` }),
  apiUrl: async (path: string) => `http://127.0.0.1:8000${path}`,
  safeJson: async (res: Response) => res.json(),
}));

import { GET, dynamic, runtime } from "./route";

describe("v2 job polling proxy endpoint", () => {
  test("configures nodejs runtime and force-dynamic execution", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });

  test("proxies GET /v2/jobs/[jobId] with bearer token, preserving Retry-After, status, and no-store headers", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      const headers = new Headers({
        "content-type": "application/json",
        "retry-after": "5",
      });
      return new Response(
        JSON.stringify({
          status: "processing",
          job_id: "job-456",
          retry_after: 5,
          expires_at: 1800000000,
          progress: 45,
        }),
        { status: 202, headers }
      );
    }) as typeof fetch;

    try {
      const req = new Request("http://localhost:3000/api/v2/jobs/job-456");
      const res = await GET(req, { params: Promise.resolve({ jobId: "job-456" }) });

      expect(res.status).toBe(202);
      expect(capturedUrl).toBe("http://127.0.0.1:8000/v2/jobs/job-456");
      expect(capturedHeaders["authorization"]).toBe("Bearer test-session-token");
      expect(res.headers.get("retry-after")).toBe("5");
      expect(res.headers.get("cache-control")).toContain("no-store");

      const body = await res.json();
      expect(body.status).toBe("processing");
      expect(body.job_id).toBe("job-456");
      expect(body.progress).toBe(45);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@/lib/pinchana", () => ({
  sessionToken: async () => "test-session-token",
  bearer: (token: string) => ({ authorization: `Bearer ${token}` }),
  apiUrl: async (path: string) => `${process.env.PINCHANA_TEST_API_ORIGIN || "http://127.0.0.1:8000"}${path}`,
  safeJson: async (response: Response) => response.json(),
  rewriteMediaUrls: (value: unknown) => value,
  upstreamError: (status: number) => Response.json({ error: "upstream" }, { status }),
}));

mock.module("@/i18n/api", () => ({
  apiError: (code: string, status: number) => Response.json({ code }, { status }),
}));

import { POST } from "./route";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PINCHANA_TEST_API_ORIGIN;
});

async function routedPath(url: string): Promise<string> {
  let target = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    target = String(input);
    return Response.json({ status: "ready" });
  }) as typeof fetch;

  const response = await POST(new Request("http://localhost/api/scrape", {
    method: "POST",
    body: JSON.stringify({ url }),
  }));
  expect(response.status).toBe(200);
  return new URL(target).pathname;
}

describe("staged web scrape routing", () => {
  test("routes Instagram through the native zero-cache v2 endpoint", async () => {
    expect(await routedPath("https://www.instagram.com/p/POST123/")).toBe("/v2/scrape");
  });

  test.each([
    "https://www.tiktok.com/@creator/video/123",
    "https://www.threads.com/@creator/post/abc",
    "https://x.com/creator/status/123",
  ])("routes Phase 4A platform through native v2: %s", async (url) => {
    expect(await routedPath(url)).toBe("/v2/scrape");
  });

  test("falls back once to v1 only for an explicit v2 rollback code", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === "/v2/scrape") {
        return Response.json({ detail: { code: "v2_disabled" } }, { status: 409 });
      }
      return Response.json({ data: {}, meta: { api_version: "1" } });
    }) as typeof fetch;

    const response = await POST(new Request("http://localhost/api/scrape", {
      method: "POST",
      body: JSON.stringify({ url: "https://x.com/creator/status/123" }),
    }));
    expect(response.status).toBe(200);
    expect(paths).toEqual(["/v2/scrape", "/v1/web/scrape"]);
  });

  test("falls back for unavailable capability but not for extraction failure", async () => {
    const capabilityPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      capabilityPaths.push(path);
      if (path === "/v2/scrape") {
        return Response.json(
          { detail: { code: "v2_capability_unavailable" } },
          { status: 502 },
        );
      }
      return Response.json({ data: {}, meta: { api_version: "1" } });
    }) as typeof fetch;
    await POST(new Request("http://localhost/api/scrape", {
      method: "POST",
      body: JSON.stringify({ url: "https://x.com/creator/status/123" }),
    }));
    expect(capabilityPaths).toEqual(["/v2/scrape", "/v1/web/scrape"]);

    const extractionPaths: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      extractionPaths.push(new URL(String(input)).pathname);
      return Response.json({ detail: { code: "extraction_failed" } }, { status: 502 });
    }) as typeof fetch;
    const extraction = await POST(new Request("http://localhost/api/scrape", {
      method: "POST",
      body: JSON.stringify({ url: "https://x.com/creator/status/123" }),
    }));
    expect(extraction.status).toBe(502);
    expect(extractionPaths).toEqual(["/v2/scrape"]);
  });

  test("uses the selected custom API instance for v2 and its v1 rollback", async () => {
    process.env.PINCHANA_TEST_API_ORIGIN = "https://custom-api.example";
    const targets: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const target = String(input);
      targets.push(target);
      if (target.endsWith("/v2/scrape")) {
        return Response.json({ detail: { code: "v2_disabled" } }, { status: 409 });
      }
      return Response.json({ data: {}, meta: { api_version: "1" } });
    }) as typeof fetch;

    const response = await POST(new Request("http://localhost/api/scrape", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.threads.com/@creator/post/abc" }),
    }));
    expect(response.status).toBe(200);
    expect(targets).toEqual([
      "https://custom-api.example/v2/scrape",
      "https://custom-api.example/v1/web/scrape",
    ]);
  });
});

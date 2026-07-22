import { describe, expect, mock, test } from "bun:test";

mock.module("@/lib/pinchana", () => ({
  sessionToken: async () => "test-session-token",
  bearer: (token: string) => ({ authorization: `Bearer ${token}` }),
  apiUrl: async (path: string) => `http://127.0.0.1:8000${path}`,
}));

import { GET, HEAD, dynamic, runtime } from "./route";

describe("v2 asset proxy endpoint", () => {
  test("configures nodejs runtime and force-dynamic execution", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });

  test("returns HEAD with approved headers and null body", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      const headers = new Headers({
        "content-type": "video/mp4",
        "content-length": "1048576",
        "content-disposition": "attachment; filename=video.mp4",
        "x-content-type-options": "nosniff",
        "set-cookie": "secret=123",
        "connection": "close",
      });
      return new Response(null, { status: 200, headers });
    }) as typeof fetch;

    try {
      const req = new Request("http://localhost:3000/api/v2/assets/ticket-123", { method: "HEAD" });
      const res = await HEAD(req, { params: Promise.resolve({ ticket: "ticket-123" }) });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("video/mp4");
      expect(res.headers.get("content-length")).toBe("1048576");
      expect(res.headers.get("content-disposition")).toBe("attachment; filename=video.mp4");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("connection")).toBeNull();

      const text = await res.text();
      expect(text).toBe("");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("forwards range request and streams GET response", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders = new Headers();

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      const headers = new Headers({
        "content-type": "video/mp4",
        "content-range": "bytes 0-1023/1048576",
        "content-length": "1024",
      });
      return new Response("stream-content", { status: 206, headers });
    }) as typeof fetch;

    try {
      const req = new Request("http://localhost:3000/api/v2/assets/ticket-123", {
        headers: { range: "bytes=0-1023" },
      });
      const res = await GET(req, { params: Promise.resolve({ ticket: "ticket-123" }) });

      expect(res.status).toBe(206);
      expect(capturedHeaders.get("authorization")).toBe("Bearer test-session-token");
      expect(capturedHeaders.get("range")).toBe("bytes=0-1023");
      expect(res.headers.get("content-range")).toBe("bytes 0-1023/1048576");
      const bodyText = await res.text();
      expect(bodyText).toBe("stream-content");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

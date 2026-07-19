import {describe, expect, test} from "bun:test";
import {redactUrls, sanitizeSentryBreadcrumb, sanitizeSentryEvent} from "./sentry-sanitization";

describe("Sentry sanitization", () => {
  test("redacts URLs from messages and exception values", () => {
    const event = sanitizeSentryEvent({
      message: "Failed https://example.com/private?id=job-123",
      transaction: "/api/scrape?url=private",
      user: {id: "visitor"},
      extra: {filename: "private.mp4"},
      request: {
        method: "POST",
        url: "https://pinchana.test/api/scrape?url=private",
        headers: {cookie: "secret"},
        cookies: {session: "secret"},
        data: {url: "private"},
        query_string: "url=private",
      },
      exception: {values: [{value: "Fetch failed for https://example.com/private"}]},
    });

    expect(event.message).toBe("Failed [redacted-url]");
    expect(event.transaction).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.request).toEqual({method: "POST"});
    expect(event.exception?.values?.[0]?.value).toBe("Fetch failed for [redacted-url]");
  });

  test("drops sensitive breadcrumb fields but keeps coarse status data", () => {
    const breadcrumb = sanitizeSentryBreadcrumb({
      message: "Request https://example.com/private",
      data: {url: "https://example.com/private", method: "GET", status_code: 500, body: "secret"},
    });
    expect(breadcrumb.message).toBe("Request [redacted-url]");
    expect(breadcrumb.data).toEqual({method: "GET", status_code: 500});
    expect(redactUrls("www.example.com/private next")).toBe("[redacted-url] next");
  });
});

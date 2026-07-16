import {describe, expect, test} from "bun:test";
import {POST} from "./route";

describe("locale API", () => {
  test("sets a durable HttpOnly locale cookie", async () => {
    const response = await POST(new Request("http://localhost/api/locale", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({locale: "en"}),
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("pinchana_locale=en");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("httponly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=lax");

    const ukrainian = await POST(new Request("http://localhost/api/locale", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({locale: "uk"}),
    }));
    expect(ukrainian.status).toBe(204);
    expect(ukrainian.headers.get("set-cookie")).toContain("pinchana_locale=uk");
  });

  test("returns stable validation codes", async () => {
    const unsupported = await POST(new Request("http://localhost/api/locale", {
      method: "POST",
      body: JSON.stringify({locale: "de"}),
    }));
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({code: "unsupported_locale"});

    const invalid = await POST(new Request("http://localhost/api/locale", {method: "POST", body: "{"}));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({code: "invalid_json"});
  });
});

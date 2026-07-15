import { describe, expect, test } from "bun:test";
import { commitUrl, identifyBrowser, identifyPlatform, sanitizeBuildManifest } from "./diagnostics";

describe("sanitizeBuildManifest", () => {
  test("keeps public Pinchana source revisions", () => {
    expect(sanitizeBuildManifest({
      version: "preview",
      commits: {
        api: { commit: "A".repeat(40), repository: "https://github.com/Pinchana/pinchana-api" },
        threads: { commit: "b".repeat(40), repository: "https://internal.example/repo" },
      },
    })).toEqual({
      version: "preview",
      commits: {
        api: { commit: "a".repeat(40), repository: "https://github.com/Pinchana/pinchana-api" },
        threads: { commit: "b".repeat(40) },
      },
    });
  });

  test("drops malformed names and revisions", () => {
    expect(sanitizeBuildManifest({ commits: { "bad name": { commit: "a".repeat(40) }, secret: { commit: "nope" } } }))
      .toEqual({ version: "preview", commits: {} });
  });
});

test("identifies only coarse browser and platform information", () => {
  expect(identifyBrowser("Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0 Safari/537.36")).toBe("Chrome 126");
  expect(identifyPlatform("Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0 Safari/537.36")).toBe("Linux");
});

test("builds public commit links", () => {
  expect(commitUrl({ commit: "a".repeat(40), repository: "https://github.com/Pinchana/pinchana-web" }))
    .toBe(`https://github.com/Pinchana/pinchana-web/commit/${"a".repeat(40)}`);
  expect(commitUrl({ commit: "a".repeat(40) })).toBeNull();
});

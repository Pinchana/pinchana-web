import { describe, expect, test } from "bun:test";
import { dlpDownloadPath, formatDownloadSize, isLargeDownload } from "./dlp-download";

describe("private DLP downloads", () => {
  test("builds only same-origin job download paths", () => {
    expect(dlpDownloadPath("12345678-1234-4234-9234-123456789abc"))
      .toBe("/api/dlp/jobs/12345678-1234-4234-9234-123456789abc/file");
    expect(() => dlpDownloadPath("https://example.com/file")).toThrow("Invalid private download job");
  });

  test("formats useful binary file sizes", () => {
    expect(formatDownloadSize(null)).toBeNull();
    expect(formatDownloadSize(512)).toBe("512 B");
    expect(formatDownloadSize(12 * 1024 * 1024)).toBe("12.0 MiB");
    expect(formatDownloadSize(8 * 1024 ** 3)).toBe("8.00 GiB");
  });

  test("marks downloads of at least one GiB as large", () => {
    expect(isLargeDownload(1024 ** 3 - 1)).toBeFalse();
    expect(isLargeDownload(1024 ** 3)).toBeTrue();
  });
});

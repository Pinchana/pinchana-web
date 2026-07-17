import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  FFMPEG_CLASS_WORKER_URL,
  FFMPEG_CORE_URL,
  FFMPEG_CORE_VERSION,
  FFMPEG_VERSION,
  FFMPEG_WASM_URL,
} from "@/app/generated/ffmpeg-assets";

const projectRoot = join(import.meta.dir, "..", "..");

function publicAssetPath(url: string): string {
  expect(url.startsWith("/ffmpeg/")).toBe(true);
  expect(url.includes("..")).toBe(false);
  return join(projectRoot, "public", url.slice(1));
}

test("FFmpeg browser assets use one unchanged, content-addressed package", async () => {
  expect(dirname(FFMPEG_CORE_URL)).toBe(dirname(FFMPEG_CLASS_WORKER_URL));
  expect(dirname(FFMPEG_WASM_URL)).toBe(dirname(FFMPEG_CLASS_WORKER_URL));
  expect(FFMPEG_CLASS_WORKER_URL).toContain(`ffmpeg-${FFMPEG_VERSION}-core-${FFMPEG_CORE_VERSION}-`);

  const [publicWorker, packageWorker, publicConst, packageConst, publicErrors, packageErrors] =
    await Promise.all([
      readFile(publicAssetPath(FFMPEG_CLASS_WORKER_URL)),
      readFile(join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "worker.js")),
      readFile(publicAssetPath(join(dirname(FFMPEG_CLASS_WORKER_URL), "const.js"))),
      readFile(join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "const.js")),
      readFile(publicAssetPath(join(dirname(FFMPEG_CLASS_WORKER_URL), "errors.js"))),
      readFile(join(projectRoot, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "errors.js")),
    ]);

  expect(publicWorker).toEqual(packageWorker);
  expect(publicConst).toEqual(packageConst);
  expect(publicErrors).toEqual(packageErrors);
  expect(publicWorker.toString()).toContain("await import(");
});

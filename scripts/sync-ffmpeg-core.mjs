import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreSource = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const wrapperSource = join(root, "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");
const destination = join(root, "public", "ffmpeg");

await mkdir(destination, { recursive: true });
const originalWorker = await readFile(join(wrapperSource, "worker.js"), "utf8");
const dynamicLoader = `    try {
        if (!_coreURL)
            _coreURL = CORE_URL;
        // when web worker type is \`classic\`.
        importScripts(_coreURL);
    }
    catch {
        if (!_coreURL || _coreURL === CORE_URL)
            _coreURL = CORE_URL.replace('/umd/', '/esm/');
        // when web worker type is \`module\`.
        self.createFFmpegCore = (await import(
        /* @vite-ignore */ _coreURL)).default;
        if (!self.createFFmpegCore) {
            throw ERROR_IMPORT_FAILURE;
        }
    }`;
if (!originalWorker.includes(dynamicLoader)) {
  throw new Error("The installed @ffmpeg/ffmpeg worker changed; update the static-worker patch.");
}
const staticWorker = originalWorker
  .replace('import { ERROR_UNKNOWN_MESSAGE_TYPE, ERROR_NOT_LOADED, ERROR_IMPORT_FAILURE, } from "./errors.js";', 'import { ERROR_UNKNOWN_MESSAGE_TYPE, ERROR_NOT_LOADED } from "./errors.js";\nimport createFFmpegCore from "./ffmpeg-core.js";')
  .replace(dynamicLoader, '    if (!_coreURL)\n        _coreURL = new URL("./ffmpeg-core.js", import.meta.url).href;')
  .replace("ffmpeg = await self.createFFmpegCore({", "ffmpeg = await createFFmpegCore({");

await Promise.all([
  copyFile(join(coreSource, "ffmpeg-core.js"), join(destination, "ffmpeg-core.js")),
  copyFile(join(coreSource, "ffmpeg-core.wasm"), join(destination, "ffmpeg-core.wasm")),
  copyFile(join(wrapperSource, "const.js"), join(destination, "const.js")),
  copyFile(join(wrapperSource, "errors.js"), join(destination, "errors.js")),
  writeFile(join(destination, "ffmpeg-worker.js"), staticWorker),
]);

console.log("Synced the local FFmpeg WebAssembly core and static module worker.");

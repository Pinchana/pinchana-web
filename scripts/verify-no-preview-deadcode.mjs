import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "app");

const FORBIDDEN_TERMS = [
  "MediaPlayers",
  "VideoPlayer",
  "AudioPlayer",
  "CompactAudioPlayer",
  "preloadPreviewAsset",
  "previewAssetsFor",
  "coverUrlFor",
  "soundtrackFor",
  "preview_url",
  "poster",
  "slideIndex",
  "activePlayer",
  "previewMuted",
  "loadingPreview",
  "mediaMorphing",
  "new Image",
  "document.createElement(\"video\")",
  "document.createElement('video')",
];

function getAllFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (/\.(tsx?|jsx?|css)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = getAllFiles(APP_DIR);
let errors = 0;

for (const term of FORBIDDEN_TERMS) {
  let foundInTerm = 0;
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    if (content.includes(term)) {
      console.error(`[DEAD-CODE DETECTED] Term "${term}" found in ${filePath}`);
      foundInTerm++;
      errors++;
    }
  }
  if (foundInTerm === 0) {
    console.log(`✓ Term "${term}": 0 matches`);
  }
}

if (errors > 0) {
  console.error(`FAILED: ${errors} dead-code occurrences found.`);
  process.exit(1);
} else {
  console.log("PASS: Zero preview dead-code found across app/.");
}

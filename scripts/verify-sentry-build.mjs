import {readFile, readdir} from "node:fs/promises";
import {join} from "node:path";

const buildDirectory = ".next-build";
const enabled = process.env.SENTRY_MONITORING_ENABLED?.trim().toLowerCase() === "true";
const tunnelRoute = "/monitoring";

async function listFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : path;
  }));
  return files.flat();
}

const manifest = JSON.parse(await readFile(join(buildDirectory, "routes-manifest.json"), "utf8"));
const rewrites = manifest.rewrites ?? {};
const rewriteEntries = Array.isArray(rewrites)
  ? rewrites
  : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? []), ...(rewrites.fallback ?? [])];
const hasTunnelRewrite = rewriteEntries.some((rewrite) =>
  rewrite.source === tunnelRoute || rewrite.source === `${tunnelRoute}(/?)`,
);

const clientFiles = (await listFiles(join(buildDirectory, "static", "chunks")))
  .filter((path) => path.endsWith(".js"));
const clientSources = await Promise.all(clientFiles.map((path) => readFile(path, "utf8")));
const enabledAssignment = /globalThis\._sentryRewritesTunnelPath=["']\/monitoring["']/;
const disabledAssignment = /globalThis\._sentryRewritesTunnelPath=void 0/;
const hasEnabledClientMetadata = clientSources.some((source) => enabledAssignment.test(source));
const hasDisabledClientMetadata = clientSources.some((source) => disabledAssignment.test(source));

if (enabled && (!hasTunnelRewrite || !hasEnabledClientMetadata)) {
  throw new Error(
    "Sentry monitoring was enabled, but the production build is missing the /monitoring rewrite " +
    "or its client tunnel metadata.",
  );
}

if (!enabled && (hasTunnelRewrite || hasEnabledClientMetadata || !hasDisabledClientMetadata)) {
  throw new Error(
    "Sentry monitoring was disabled, but the production build contains an active tunnel " +
    "or lacks disabled client metadata.",
  );
}

console.log(`Verified Sentry production build: monitoring ${enabled ? "enabled" : "disabled"}.`);

import {readFile, readdir} from "node:fs/promises";
import {join} from "node:path";

const buildDirectory = ".next-build";
const enabled = process.env.SENTRY_MONITORING_ENABLED?.trim().toLowerCase() === "true";

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
const tunnelRewrites = rewriteEntries.filter((rewrite) =>
  typeof rewrite.destination === "string" &&
  rewrite.destination.includes(".ingest.") &&
  rewrite.destination.includes("/envelope/"),
);
const tunnelRoutes = new Set(tunnelRewrites.map((rewrite) => rewrite.source.replace(/\(\/\?\)$/, "")));

const clientFiles = (await listFiles(join(buildDirectory, "static", "chunks")))
  .filter((path) => path.endsWith(".js"));
const clientSources = await Promise.all(clientFiles.map((path) => readFile(path, "utf8")));
const enabledAssignment = /globalThis\._sentryRewritesTunnelPath=["'](\/[^"']+)["']/g;
const disabledAssignment = /globalThis\._sentryRewritesTunnelPath=void 0/;
const clientTunnelRoutes = new Set(clientSources.flatMap((source) =>
  [...source.matchAll(enabledAssignment)].map((match) => match[1]),
));
const hasMatchingClientMetadata = [...tunnelRoutes].some((route) => clientTunnelRoutes.has(route));
const hasDisabledClientMetadata = clientSources.some((source) => disabledAssignment.test(source));

if (enabled && (tunnelRoutes.size !== 1 || !hasMatchingClientMetadata)) {
  throw new Error(
    "Sentry monitoring was enabled, but the production build does not contain exactly one " +
    "randomized tunnel route shared by the server rewrite and browser bundle.",
  );
}

if (!enabled && (tunnelRoutes.size > 0 || clientTunnelRoutes.size > 0 || !hasDisabledClientMetadata)) {
  throw new Error(
    "Sentry monitoring was disabled, but the production build contains an active tunnel " +
    "or lacks disabled client metadata.",
  );
}

console.log(`Verified Sentry production build: monitoring ${enabled ? "enabled" : "disabled"}.`);

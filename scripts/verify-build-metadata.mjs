import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fileEnvironment = loadEnv("production", root, "");
const source = resolveReleaseMetadata({
  root,
  environment: { ...fileEnvironment, ...process.env },
});
const candidates = [
  resolve(root, "dist/client/release.json"),
  resolve(root, "dist/release.json"),
];
let manifest;
let manifestPath;

for (const candidate of candidates) {
  try {
    manifest = JSON.parse(readFileSync(candidate, "utf8"));
    manifestPath = candidate;
    break;
  } catch {
    // Try the next supported Vite output location.
  }
}

if (!manifest || !manifestPath) {
  stop("The production build did not emit release.json.");
}

for (const key of [
  "version",
  "commit",
  "publicConfigFingerprint",
  "releaseId",
  "dirty",
]) {
  if (manifest[key] !== source[key]) {
    stop(
      `Built release metadata does not match the source (${key}: ${String(
        manifest[key],
      )} instead of ${String(source[key])}).`,
    );
  }
}

if (!Number.isFinite(Date.parse(manifest.sourceTimestamp))) {
  stop("Built release metadata has an invalid source timestamp.");
}
if (manifest.sourceTimestamp !== source.sourceTimestamp) {
  stop(
    `Built release metadata has an unexpected source timestamp (${manifest.sourceTimestamp} instead of ${source.sourceTimestamp}).`,
  );
}

console.log(`Build metadata verified: ${manifestPath}`);

function stop(message) {
  console.error(`Build metadata check stopped: ${message}`);
  process.exit(1);
}

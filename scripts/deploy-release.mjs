import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nodeCommand = process.execPath;
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const verificationURL = process.env.RELEASE_VERIFY_URL?.trim();
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

if (!verificationURL) {
  console.error(
    "Set RELEASE_VERIFY_URL to the public Worker or custom-domain URL before deployment.",
  );
  process.exit(1);
}
if (!/^[0-9a-f]{32}$/i.test(cloudflareAccountId ?? "")) {
  console.error(
    "Set CLOUDFLARE_ACCOUNT_ID to the explicitly approved 32-character Cloudflare account ID before deployment.",
  );
  process.exit(1);
}

run(nodeCommand, [resolve(root, "scripts/release-preflight.mjs")]);

const fileEnvironment = loadEnv("production", root, "");
const metadata = resolveReleaseMetadata({
  root,
  environment: { ...fileEnvironment, ...process.env },
});
const manifest = readReleaseManifest();
assertVerifiedManifest(metadata, manifest);

run(npxCommand, [
  "--no-install",
  "wrangler",
  "deploy",
  "--account-id",
  cloudflareAccountId,
  "--tag",
  manifest.releaseId,
  "--message",
  `Rally Hunt ${manifest.releaseId}`,
]);
run(nodeCommand, [
  resolve(root, "scripts/verify-deployment.mjs"),
  verificationURL,
  `--expected-commit=${manifest.commit}`,
  `--expected-version=${manifest.version}`,
  `--expected-source-timestamp=${manifest.sourceTimestamp}`,
  `--expected-config-fingerprint=${manifest.publicConfigFingerprint}`,
  `--expected-release-id=${manifest.releaseId}`,
]);

function run(command, arguments_) {
  execFileSync(command, arguments_, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

function readReleaseManifest() {
  try {
    return JSON.parse(
      readFileSync(resolve(root, "dist/client/release.json"), "utf8"),
    );
  } catch {
    console.error(
      "The verified build manifest is missing or unreadable. Run the release preflight again.",
    );
    process.exit(1);
  }
}

function assertVerifiedManifest(metadata, manifest) {
  const keys = [
    "version",
    "commit",
    "sourceTimestamp",
    "publicConfigFingerprint",
    "releaseId",
    "dirty",
  ];
  if (
    !manifest ||
    typeof manifest !== "object" ||
    keys.some((key) => manifest[key] !== metadata[key]) ||
    manifest.dirty !== false
  ) {
    console.error(
      "Source or public release configuration changed after the verified build. Run the release preflight again.",
    );
    process.exit(1);
  }
}

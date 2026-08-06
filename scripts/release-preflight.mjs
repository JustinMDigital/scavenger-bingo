import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const supportedFlags = new Set([
  "--allow-dirty",
  "--skip-external-config",
  "--help",
]);

if (flags.has("--help")) {
  console.log(`Usage: npm run release:preflight -- [options]

Audits the complete dependency lockfile, then runs all tests, a production
build, the multi-user browser suite, metadata validation, and a Cloudflare
packaging dry run. It never deploys.

--allow-dirty  Permit local verification with uncommitted files. Never use this
               override to approve a production release.
--skip-external-config
               Run local checks without requiring support and Google settings.
               This cannot approve a production release.`);
  process.exit(0);
}

const unknownFlags = [...flags].filter((flag) => !supportedFlags.has(flag));
if (unknownFlags.length > 0) {
  stop(`Unknown option: ${unknownFlags.join(", ")}`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 24) {
  stop(`Node.js 24 is required; found ${process.versions.node}.`);
}

const environment = loadEnv("production", root, "");
const supportEmail = (
  process.env.VITE_SUPPORT_EMAIL ??
  environment.VITE_SUPPORT_EMAIL ??
  ""
).trim();
const googleClientId = (
  process.env.VITE_GOOGLE_CLIENT_ID ??
  environment.VITE_GOOGLE_CLIENT_ID ??
  ""
).trim();
const releaseEnvironment = { ...environment, ...process.env };

const skipExternalConfig = flags.has("--skip-external-config");
if (!skipExternalConfig) {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) ||
    /@example\.(com|org|net)$/i.test(supportEmail) ||
    /\.invalid$/i.test(supportEmail)
  ) {
    stop("Set VITE_SUPPORT_EMAIL to the monitored public support address.");
  }
  if (
    !/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(
      googleClientId,
    ) ||
    googleClientId.toLowerCase().startsWith("your-google-")
  ) {
    stop("Set VITE_GOOGLE_CLIENT_ID to the approved Google OAuth web client.");
  }
}

const retiredEnvironmentNames = Object.keys(environment)
  .filter(
    (name) =>
      name.startsWith("VITE_SUPABASE_") || name.startsWith("VERCEL_"),
  )
  .sort();
if (retiredEnvironmentNames.length > 0) {
  console.warn(
    `Warning: ignored local environment files still contain retired provider settings: ${retiredEnvironmentNames.join(
      ", ",
    )}. Review and remove or rotate them separately.`,
  );
}

const sourceMetadata = resolveReleaseMetadata({
  root,
  environment: releaseEnvironment,
});
const checkoutCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
})
  .trim()
  .toLowerCase();
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(sourceMetadata.version)) {
  stop(`package.json has an invalid release version: ${sourceMetadata.version}`);
}
if (sourceMetadata.commit === "unknown") {
  stop("The current source revision could not be identified.");
}
if (sourceMetadata.commit !== checkoutCommit) {
  stop(
    `Configured release revision ${sourceMetadata.commit} does not match checkout ${checkoutCommit}.`,
  );
}
if (sourceMetadata.dirty && !flags.has("--allow-dirty")) {
  stop(
    "The working tree has uncommitted files. Commit or otherwise checkpoint the intended release, then rerun the preflight.",
  );
}
if (sourceMetadata.dirty) {
  console.warn(
    "Warning: --allow-dirty is active. This run can verify local work but cannot approve a production release.",
  );
}

console.log(
  `Preflight source: ${sourceMetadata.releaseId} (${sourceMetadata.commit})`,
);
console.log(
  `Public configuration fingerprint: ${sourceMetadata.publicConfigFingerprint}`,
);
if (skipExternalConfig) {
  console.warn(
    "Warning: external support and Google configuration were skipped. This run cannot approve a production release.",
  );
} else {
  console.log(`Release contact: ${supportEmail}`);
  console.log(
    "Google OAuth client ID is present; live API access and authorized origins still require verification.",
  );
}

run("git", ["diff", "--check"]);
run(npmCommand(), ["audit", "--audit-level=high"]);
run(npmCommand(), ["run", "test"]);
run(npmCommand(), ["run", "build"]);
run(npmCommand(), ["run", "check:release-metadata"]);
run(npmCommand(), ["run", "test:e2e"]);

const dryRunDirectory = mkdtempSync(
  resolve(tmpdir(), "scavenger-bingo-wrangler-dry-run-"),
);
try {
  run(npxCommand(), [
    "--no-install",
    "wrangler",
    "deploy",
    "--dry-run",
    "--tag",
    sourceMetadata.releaseId,
    "--message",
    `Rally Hunt ${sourceMetadata.releaseId}`,
    "--outdir",
    dryRunDirectory,
  ]);
} finally {
  rmSync(dryRunDirectory, { recursive: true, force: true });
}

const finalMetadata = resolveReleaseMetadata({
  root,
  environment: { ...loadEnv("production", root, ""), ...process.env },
});
if (!sameReleaseMetadata(sourceMetadata, finalMetadata)) {
  stop(
    "Source or public release configuration changed during preflight. Start again from the intended clean release state.",
  );
}
let finalManifest;
try {
  finalManifest = JSON.parse(
    readFileSync(resolve(root, "dist/client/release.json"), "utf8"),
  );
} catch {
  stop("The verified build manifest is missing or unreadable.");
}
if (!sameReleaseMetadata(finalMetadata, finalManifest)) {
  stop(
    "The built release identity no longer matches the source and public configuration. Start the preflight again.",
  );
}

console.log(
  sourceMetadata.dirty
    ? "Local release preflight passed with the dirty-source override."
    : "Release preflight passed. No deployment was performed.",
);

function run(command, arguments_) {
  console.log(`\n> ${command} ${arguments_.join(" ")}`);
  try {
    execFileSync(command, arguments_, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  } catch (error) {
    process.exit(typeof error.status === "number" ? error.status : 1);
  }
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function stop(message) {
  console.error(`Release preflight stopped: ${message}`);
  process.exit(1);
}

function sameReleaseMetadata(first, second) {
  return [
    "version",
    "commit",
    "sourceTimestamp",
    "publicConfigFingerprint",
    "releaseId",
    "dirty",
  ].every((key) => first[key] === second[key]);
}

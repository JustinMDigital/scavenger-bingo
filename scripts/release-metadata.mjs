import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commitPattern = /^[0-9a-f]{7,64}$/i;
const publicConfigFingerprintLength = 16;

export function resolveReleaseMetadata({
  root = moduleRoot,
  environment = process.env,
} = {}) {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const commit =
    normalizeCommit(environment.RELEASE_COMMIT) ??
    normalizeCommit(environment.GITHUB_SHA) ??
    readGitCommit(root) ??
    "unknown";
  const gitDirty = readGitDirty(root);
  const declaredDirty = readBoolean(environment.RELEASE_DIRTY);
  const dirty =
    gitDirty === true
      ? true
      : gitDirty === false
        ? false
        : declaredDirty ?? true;
  const sourceTimestamp = resolveSourceTimestamp(environment, root, commit);
  const shortCommit = commit === "unknown" ? commit : commit.slice(0, 12);
  const publicConfigFingerprint =
    resolvePublicConfigFingerprint(environment);
  const releaseId = [
    packageJson.version,
    shortCommit,
    `cfg-${publicConfigFingerprint.slice(0, publicConfigFingerprintLength)}`,
    ...(dirty ? ["dirty"] : []),
  ].join("-");

  return Object.freeze({
    version: String(packageJson.version),
    commit,
    sourceTimestamp,
    publicConfigFingerprint,
    releaseId,
    dirty,
  });
}

export function resolvePublicConfigFingerprint(environment = process.env) {
  const canonicalPublicConfig = JSON.stringify({
    schema: 1,
    googleOAuthClientId: normalizePublicConfigValue(
      environment.VITE_GOOGLE_CLIENT_ID,
    ),
    supportEmail: normalizePublicConfigValue(environment.VITE_SUPPORT_EMAIL),
  });

  return createHash("sha256")
    .update(canonicalPublicConfig, "utf8")
    .digest("hex");
}

function normalizeCommit(value) {
  const candidate = value?.trim();
  return candidate && commitPattern.test(candidate) ? candidate.toLowerCase() : null;
}

function normalizePublicConfigValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readGitCommit(root) {
  try {
    return normalizeCommit(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}

function readGitDirty(root) {
  try {
    return (
      execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim().length > 0
    );
  } catch {
    return null;
  }
}

function resolveSourceTimestamp(environment, root, commit) {
  const explicit = environment.RELEASE_SOURCE_TIMESTAMP?.trim();
  if (explicit && Number.isFinite(Date.parse(explicit))) {
    return new Date(explicit).toISOString();
  }

  const epoch = Number(environment.SOURCE_DATE_EPOCH);
  if (Number.isFinite(epoch) && epoch >= 0) {
    return new Date(epoch * 1000).toISOString();
  }

  if (commit !== "unknown") {
    try {
      const commitTime = execFileSync(
        "git",
        ["show", "-s", "--format=%cI", commit],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();
      if (Number.isFinite(Date.parse(commitTime))) {
        return new Date(commitTime).toISOString();
      }
    } catch {
      // Fall through to a stable sentinel when Git metadata is unavailable.
    }
  }

  return new Date(0).toISOString();
}

function readBoolean(value) {
  if (value === undefined) return null;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return null;
}

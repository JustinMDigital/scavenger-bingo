import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  resolvePublicConfigFingerprint,
  resolveReleaseMetadata,
} from "./release-metadata.mjs";

const publicConfig = {
  VITE_SUPPORT_EMAIL: "support@example.test",
  VITE_GOOGLE_CLIENT_ID:
    "123456789-release.apps.googleusercontent.com",
};

test("public configuration fingerprint is deterministic and changes with either public setting", () => {
  const original = resolvePublicConfigFingerprint(publicConfig);
  const repeated = resolvePublicConfigFingerprint({ ...publicConfig });
  const whitespaceOnly = resolvePublicConfigFingerprint({
    VITE_SUPPORT_EMAIL: ` ${publicConfig.VITE_SUPPORT_EMAIL} `,
    VITE_GOOGLE_CLIENT_ID: ` ${publicConfig.VITE_GOOGLE_CLIENT_ID} `,
  });
  const changedSupport = resolvePublicConfigFingerprint({
    ...publicConfig,
    VITE_SUPPORT_EMAIL: "help@example.test",
  });
  const changedGoogleClient = resolvePublicConfigFingerprint({
    ...publicConfig,
    VITE_GOOGLE_CLIENT_ID:
      "987654321-release.apps.googleusercontent.com",
  });

  assert.match(original, /^[0-9a-f]{64}$/);
  assert.equal(repeated, original);
  assert.equal(whitespaceOnly, original);
  assert.notEqual(changedSupport, original);
  assert.notEqual(changedGoogleClient, original);
});

test("release identity includes the fingerprint without exposing public config values", (context) => {
  const root = mkdtempSync(resolve(tmpdir(), "scavenger-release-metadata-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({ version: "9.8.7" })}\n`,
  );

  const metadata = resolveReleaseMetadata({
    root,
    environment: {
      ...publicConfig,
      RELEASE_COMMIT: "b".repeat(40),
      RELEASE_DIRTY: "false",
      RELEASE_SOURCE_TIMESTAMP: "2026-07-27T12:34:56Z",
    },
  });

  assert.equal(metadata.sourceTimestamp, "2026-07-27T12:34:56.000Z");
  assert.match(metadata.publicConfigFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(
    metadata.releaseId,
    `9.8.7-${"b".repeat(12)}-cfg-${metadata.publicConfigFingerprint.slice(
      0,
      16,
    )}`,
  );
  assert.equal(metadata.dirty, false);
  assert.doesNotMatch(
    JSON.stringify(metadata),
    /support@example\.test|googleusercontent\.com/,
  );
});

test("static headers deny framing while allowing the deliberate Google export flow", () => {
  const headers = readFileSync(
    new URL("../public/_headers", import.meta.url),
    "utf8",
  );

  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin-allow-popups/);
  assert.match(headers, /script-src[^;]*https:\/\/accounts\.google\.com/);
  assert.match(headers, /connect-src[^;]*https:\/\/www\.googleapis\.com/);
  assert.doesNotMatch(headers, /connect-src[^;\n]*\bws:/);
  assert.doesNotMatch(headers, /connect-src[^;\n]*\bwss:/);
  assert.match(headers, /\/release\.json\s+Cache-Control: no-store/);
});

test("read-only CI pins official actions and does not persist checkout credentials", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(workflow, /uses:\s+actions\/[^@\s]+@v\d/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.doesNotMatch(workflow, /npm audit[^\n]*--omit=dev/);
});

test("deployment is bound to an explicit account and the verified build manifest", () => {
  const deployScript = readFileSync(
    new URL("./deploy-release.mjs", import.meta.url),
    "utf8",
  );
  const preflightScript = readFileSync(
    new URL("./release-preflight.mjs", import.meta.url),
    "utf8",
  );

  assert.match(deployScript, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deployScript, /\/\^\[0-9a-f\]\{32\}\$\/i/);
  assert.match(deployScript, /"--account-id"/);
  assert.match(deployScript, /dist\/client\/release\.json/);
  assert.match(deployScript, /assertVerifiedManifest\(metadata, manifest\)/);
  assert.match(preflightScript, /const finalMetadata = resolveReleaseMetadata/);
  assert.match(
    preflightScript,
    /Source or public release configuration changed during preflight/,
  );
});

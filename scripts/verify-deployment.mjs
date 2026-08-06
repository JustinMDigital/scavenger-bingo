import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loadEnv } from "vite";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);

if (arguments_.includes("--help")) {
  console.log(`Usage: npm run verify:deployment -- <base-url> [options]

Read-only checks for health, build identity, public pages, browser errors, and
an unknown API route. It never creates, joins, changes, or deletes a room.

Options:
  --expected-commit=<sha>   Revision that must be deployed (defaults to checkout)
  --expected-version=<ver>  App version that must be deployed (defaults to checkout)
  --expected-source-timestamp=<iso>
                            Source timestamp that must be deployed
  --expected-config-fingerprint=<sha256>
                            Public build configuration that must be deployed
  --expected-release-id=<id>
                            Exact deployment/build identifier that must match
  --allow-dirty             Permit a dirty release manifest for local verification`);
  process.exit(0);
}

const positional = arguments_.filter((argument) => !argument.startsWith("--"));
if (positional.length !== 1) {
  stop("Provide exactly one deployed base URL.");
}

const allowedOptions = new Set([
  "--allow-dirty",
  ...arguments_.filter(
    (argument) =>
      argument.startsWith("--expected-commit=") ||
      argument.startsWith("--expected-version=") ||
      argument.startsWith("--expected-source-timestamp=") ||
      argument.startsWith("--expected-config-fingerprint=") ||
      argument.startsWith("--expected-release-id="),
  ),
]);
const unknownOptions = arguments_.filter(
  (argument) => argument.startsWith("--") && !allowedOptions.has(argument),
);
if (unknownOptions.length > 0) {
  stop(`Unknown option: ${unknownOptions.join(", ")}`);
}

const baseURL = parseBaseURL(positional[0]);
const fileEnvironment = loadEnv("production", root, "");
const sourceMetadata = resolveReleaseMetadata({
  root,
  environment: { ...fileEnvironment, ...process.env },
});
const expectedCommit = (
  readOption("--expected-commit=") ??
  process.env.RELEASE_COMMIT?.trim() ??
  process.env.GITHUB_SHA?.trim() ??
  sourceMetadata.commit
).toLowerCase();
const expectedVersion =
  readOption("--expected-version=") ?? sourceMetadata.version;
const allowDirty = arguments_.includes("--allow-dirty");
const expectedSourceTimestamp =
  readOption("--expected-source-timestamp=") ??
  sourceMetadata.sourceTimestamp;
if (!Number.isFinite(Date.parse(expectedSourceTimestamp))) {
  stop("The expected source timestamp is invalid.");
}
const expectedPublicConfigFingerprint = (
  readOption("--expected-config-fingerprint=") ??
  sourceMetadata.publicConfigFingerprint
).toLowerCase();
if (!/^[0-9a-f]{64}$/.test(expectedPublicConfigFingerprint)) {
  stop("The expected public configuration fingerprint is invalid.");
}
const expectedReleaseId =
  readOption("--expected-release-id=") ??
  formatReleaseId({
    version: expectedVersion,
    commit: expectedCommit,
    publicConfigFingerprint: expectedPublicConfigFingerprint,
    dirty: allowDirty && sourceMetadata.dirty,
  });

const health = await getJson("/api/health");
if (health.response.status !== 200) {
  stop(`/api/health returned ${health.response.status}.`);
}
if (
  health.body?.ok !== true ||
  health.body?.backend !== "cloudflare-durable-objects"
) {
  stop("/api/health returned an unexpected response.");
}
if (!isLocalURL(baseURL)) {
  const deployment = health.body?.deployment;
  if (
    !deployment ||
    typeof deployment.id !== "string" ||
    typeof deployment.tag !== "string" ||
    !Number.isFinite(Date.parse(deployment.timestamp))
  ) {
    stop("/api/health is missing valid Cloudflare deployment identity.");
  }
  pass(
    `Cloudflare deployment ${deployment.id}${
      deployment.tag ? ` (${deployment.tag})` : ""
    }`,
  );
}
requireNoStore(health.response, "/api/health");
pass("Health endpoint");

const manifestResult = await getJson(`/release.json?verify=${Date.now()}`);
if (manifestResult.response.status !== 200) {
  stop(`/release.json returned ${manifestResult.response.status}.`);
}
requireNoStore(manifestResult.response, "/release.json");
validateReleaseManifest(manifestResult.body);
if (
  !isLocalURL(baseURL) &&
  health.body.deployment.tag !== manifestResult.body.releaseId
) {
  stop(
    `Cloudflare deployment tag ${health.body.deployment.tag} does not match build identity ${manifestResult.body.releaseId}.`,
  );
}
pass(
  `Build identity ${manifestResult.body.releaseId} (${manifestResult.body.sourceTimestamp})`,
);

const missingApiPath = `/api/release-verifier-not-found-${Date.now()}`;
const missingResponse = await fetchURL(missingApiPath);
if (missingResponse.status !== 404) {
  stop(`Unknown API route returned ${missingResponse.status} instead of 404.`);
}
pass("Unknown API route returns 404");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: baseURL.href,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

const publicPages = [
  ["/", "Join a scavenger hunt"],
  ["/host", "Create or reopen a hunt."],
  ["/templates", "Pick a hunt that fits the moment."],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/support", "Support"],
];

try {
  let securityHeadersChecked = false;
  for (const [path, heading] of publicPages) {
    const response = await page.goto(new URL(path, baseURL).href, {
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok()) {
      stop(`${path} returned ${response?.status() ?? "no response"}.`);
    }
    if (!isLocalURL(baseURL) && !securityHeadersChecked) {
      requireBaselineSecurityHeaders(response);
      securityHeadersChecked = true;
      pass("Baseline browser security headers");
    }
    const visibleHeading = page.getByRole("heading", {
      level: 1,
      name: heading,
      exact: true,
    });
    await visibleHeading.waitFor({ state: "visible", timeout: 10_000 });
    const bodyText = (await page.locator("body").innerText()).trim();
    if (bodyText.length < 40) {
      stop(`${path} rendered an unexpectedly empty page.`);
    }
    pass(`${path} rendered`);
  }
} finally {
  await context.close();
  await browser.close();
}

if (browserErrors.length > 0) {
  stop(`Public pages logged browser errors:\n${browserErrors.join("\n")}`);
}
pass("Public pages have no browser errors");
console.log("Read-only deployment verification passed. No room data was changed.");

function validateReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    stop("/release.json is not a JSON object.");
  }
  if (manifest.version !== expectedVersion) {
    stop(
      `Deployed version ${String(manifest.version)} does not match ${expectedVersion}.`,
    );
  }
  if (manifest.commit !== expectedCommit) {
    stop(
      `Deployed revision ${String(manifest.commit)} does not match ${expectedCommit}.`,
    );
  }
  if (!Number.isFinite(Date.parse(manifest.sourceTimestamp))) {
    stop("The deployed source timestamp is invalid.");
  }
  if (manifest.sourceTimestamp !== expectedSourceTimestamp) {
    stop(
      `Deployed source timestamp ${manifest.sourceTimestamp} does not match ${expectedSourceTimestamp}.`,
    );
  }
  if (
    typeof manifest.publicConfigFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(manifest.publicConfigFingerprint)
  ) {
    stop("The deployed public configuration fingerprint is invalid.");
  }
  if (manifest.publicConfigFingerprint !== expectedPublicConfigFingerprint) {
    stop(
      `Deployed public configuration fingerprint ${manifest.publicConfigFingerprint} does not match ${expectedPublicConfigFingerprint}.`,
    );
  }
  if (typeof manifest.dirty !== "boolean") {
    stop("The deployed dirty-source flag is missing.");
  }
  if (
    typeof manifest.releaseId !== "string" ||
    manifest.releaseId !==
      formatReleaseId({
        version: manifest.version,
        commit: manifest.commit,
        publicConfigFingerprint: manifest.publicConfigFingerprint,
        dirty: manifest.dirty,
      })
  ) {
    stop("The deployed release identifier is invalid.");
  }
  if (manifest.releaseId !== expectedReleaseId) {
    stop(
      `Deployed release identifier ${manifest.releaseId} does not match ${expectedReleaseId}.`,
    );
  }
  if (manifest.dirty === true && !allowDirty) {
    stop("The deployed build reports uncommitted source changes.");
  }
}

function formatReleaseId({
  version,
  commit,
  publicConfigFingerprint,
  dirty,
}) {
  return [
    version,
    commit.slice(0, 12),
    `cfg-${publicConfigFingerprint.slice(0, 16)}`,
    ...(dirty ? ["dirty"] : []),
  ].join("-");
}

function requireBaselineSecurityHeaders(response) {
  const headers = response.headers();
  const contentSecurityPolicy = headers["content-security-policy"] ?? "";
  if (
    !/(?:^|;)\s*frame-ancestors\s+'none'(?:\s*;|$)/i.test(
      contentSecurityPolicy,
    )
  ) {
    stop("Public pages are missing CSP frame-ancestors 'none'.");
  }
  if ((headers["x-frame-options"] ?? "").toUpperCase() !== "DENY") {
    stop("Public pages are missing X-Frame-Options: DENY.");
  }
  if ((headers["x-content-type-options"] ?? "").toLowerCase() !== "nosniff") {
    stop("Public pages are missing X-Content-Type-Options: nosniff.");
  }
  if ((headers["referrer-policy"] ?? "").toLowerCase() !== "no-referrer") {
    stop("Public pages are missing Referrer-Policy: no-referrer.");
  }
  if (
    (headers["cross-origin-opener-policy"] ?? "").toLowerCase() !==
    "same-origin-allow-popups"
  ) {
    stop(
      "Public pages must use Cross-Origin-Opener-Policy: same-origin-allow-popups.",
    );
  }
}

async function getJson(path) {
  const response = await fetchURL(path);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    stop(`${path} did not return JSON.`);
  }
  try {
    return { response, body: await response.json() };
  } catch {
    stop(`${path} returned invalid JSON.`);
  }
}

async function fetchURL(path) {
  const delays = [0, 500, 1_500];
  let lastError;

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
    }
    try {
      const response = await fetch(new URL(path, baseURL), {
        cache: "no-store",
        headers: {
          accept: "application/json,text/html;q=0.9",
          "cache-control": "no-cache",
          "user-agent": "RallyHunt-ReadOnlyReleaseVerifier/1",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  stop(`Could not read ${path}: ${lastError?.message ?? "unknown error"}`);
}

function requireNoStore(response, path) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.toLowerCase().includes("no-store")) {
    stop(`${path} must return Cache-Control: no-store.`);
  }
}

function parseBaseURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    stop(`Invalid base URL: ${value}`);
  }

  const isLocal = isLocalURL(url);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    stop("Use HTTPS for deployed sites; HTTP is allowed only for localhost.");
  }
  if (url.username || url.password) {
    stop("Do not put credentials in the verification URL.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function isLocalURL(url) {
  return (
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1"
  );
}

function readOption(prefix) {
  return arguments_
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function stop(message) {
  console.error(`Deployment verification stopped: ${message}`);
  process.exit(1);
}

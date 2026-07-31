import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolveReleaseMetadata } from "./scripts/release-metadata.mjs";

export default defineConfig(({ mode }) => {
  const fileEnvironment = loadEnv(mode, process.cwd(), "");
  const releaseMetadata = resolveReleaseMetadata({
    environment: { ...fileEnvironment, ...process.env },
  });

  return {
    define: {
      __SCAVENGER_RELEASE__: JSON.stringify(releaseMetadata),
    },
    plugins: [
      react(),
      releaseManifest(releaseMetadata),
      cloudflare({
        persistState: process.env.SCAVENGER_E2E === "1" ? false : true,
        inspectorPort: process.env.SCAVENGER_E2E === "1" ? false : undefined,
      }),
    ],
  };
});

function releaseManifest(metadata: ReturnType<typeof resolveReleaseMetadata>): Plugin {
  return {
    name: "scavenger-release-manifest",
    apply: "build",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: `${JSON.stringify(metadata, null, 2)}\n`,
      });
    },
  };
}

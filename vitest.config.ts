import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: [
      "worker/**/*.test.ts",
      "src/playerNameFilter.test.ts",
      "src/slidesExport.test.ts",
      "src/taskCatalog.test.ts",
    ],
  },
});

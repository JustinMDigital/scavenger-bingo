import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPPORT_EMAIL": JSON.stringify(
      "support@example.org",
    ),
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: [
      "src/accessibility.test.tsx",
      "src/pendingProofStore.test.ts",
    ],
  },
});

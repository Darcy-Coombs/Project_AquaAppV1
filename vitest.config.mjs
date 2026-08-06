import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@aqua/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@aqua/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    hookTimeout: 20000,
    testTimeout: 30000
  }
});

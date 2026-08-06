import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@aqua/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
      "@aqua/protocol": fileURLToPath(new URL("../protocol/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173
  }
});

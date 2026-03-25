import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@book/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"]
  }
});

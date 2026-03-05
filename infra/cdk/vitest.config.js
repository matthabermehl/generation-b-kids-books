import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.js"],
    exclude: ["cdk.out/**", "node_modules/**"]
  }
});

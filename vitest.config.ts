import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["plugin/test/**/*.test.ts", "hub/test/**/*.test.ts", "test/**/*.test.ts"]
  }
});

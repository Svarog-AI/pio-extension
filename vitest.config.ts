import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests in Node.js environment (native ESM support)
    environment: "node",
    // Enable global describe/it/expect without explicit imports
    globals: true,
    // Discover collocated tests under src/
    include: ["src/**/*.test.ts"],
  },
});

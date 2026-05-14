import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests in Node.js environment (native ESM support)
    environment: "node",
    // Enable global describe/it/expect without explicit imports
    globals: true,
    // Discover tests under __tests__/ (legacy) and src/ (collocated)
    include: ["__tests__/**/*.test.ts", "__tests__/*.test.ts", "src/**/*.test.ts"],
  },
});

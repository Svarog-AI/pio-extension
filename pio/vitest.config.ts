import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // No test files ship in Step 1; vitest run must exit 0 with zero matches.
    passWithNoTests: true,
  },
});

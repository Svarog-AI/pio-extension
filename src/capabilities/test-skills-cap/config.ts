/**
 * Test-only capability module with skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough.
 * Not registered in index.ts — exists solely for testing.
 */
import type { StaticCapabilityConfig } from "../../types";

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "test-skills.md",
  skills: {
    mandatory: ["tdd", "pio-git"],
    recommended: [{ name: "source-research", condition: "when researching external libraries" }],
  },
  defaultInitialMessage: () => "Test capability with skills",
};

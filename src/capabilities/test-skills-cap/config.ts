/**
 * Test-only capability module with skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough.
 * Not registered in index.ts — exists solely for testing.
 */
import type { StaticCapabilityConfig } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// Default export for new-style config resolution
export default {
  capability: "test-skills-cap",
  skills: {
    mandatory: ["tdd", "pio-git"],
    recommended: [{ name: "source-research", condition: "when researching external libraries" }],
  },
  defaultInitialMessage: () => "Test capability with skills",
} satisfies CapabilityPackageConfig;

// Backward-compat export (removed in Step 23)
export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "test-skills.md",
  skills: {
    mandatory: ["tdd", "pio-git"],
    recommended: [{ name: "source-research", condition: "when researching external libraries" }],
  },
  defaultInitialMessage: () => "Test capability with skills",
};

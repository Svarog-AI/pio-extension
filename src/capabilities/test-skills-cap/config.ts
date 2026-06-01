/**
 * Test-only capability module with skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough.
 * Not registered in index.ts — exists solely for testing.
 */
import type { CapabilityPackageConfig } from "../../capability-package";

const capabilityConfig = {
  capability: "test-skills-cap",
  skills: {
    mandatory: ["tdd", "pio-git"],
    recommended: [{ name: "source-research", condition: "when researching external libraries" }],
  },
  defaultInitialMessage: () => "Test capability with skills",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

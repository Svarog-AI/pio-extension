/**
 * Test-only capability module without skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough
 * when the static config omits the skills field entirely.
 * Not registered in index.ts — exists solely for testing.
 */
import type { StaticCapabilityConfig } from "../../types";
import type { CapabilityPackageConfig } from "../../capability-package";

// Default export for new-style config resolution
export default {
  capability: "test-no-skills-cap",
  defaultInitialMessage: () => "Test capability without skills",
} satisfies CapabilityPackageConfig;

// Backward-compat export (removed in Step 23)
export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "test-no-skills.md",
  defaultInitialMessage: () => "Test capability without skills",
};

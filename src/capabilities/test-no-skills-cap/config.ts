/**
 * Test-only capability module without skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough
 * when the static config omits the skills field entirely.
 * Not registered in index.ts — exists solely for testing.
 */
import type { CapabilityPackageConfig } from "../../capability-package";

const capabilityConfig = {
  capability: "test-no-skills-cap",
  defaultInitialMessage: () => "Test capability without skills",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

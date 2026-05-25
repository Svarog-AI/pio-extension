/**
 * Test-only capability module without skills defined.
 * Used by capability-config.test.ts to verify the skills passthrough
 * when the static config omits the skills field entirely.
 * Not registered in index.ts — exists solely for testing.
 */
import type { StaticCapabilityConfig } from "../types";

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "test-no-skills.md",
  defaultInitialMessage: () => "Test capability without skills",
};

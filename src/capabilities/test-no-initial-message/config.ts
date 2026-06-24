/**
 * Test-only capability module with defaultInitialMessage returning undefined.
 * Used by capability-config.test.ts to verify mandatory param enforcement
 * when neither params.initialMessage nor defaultInitialMessage provides a value.
 * Not registered in index.ts — exists solely for testing.
 */
import type { CapabilityPackageConfig } from "../../capability-package";

const capabilityConfig = {
  capability: "test-no-initial-message",
  contract: {
    inputs: [],
    outputs: [],
  },
  defaultInitialMessage: () => "",
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

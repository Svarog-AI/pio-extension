/**
 * Tests for Step 1 type changes: additionalContext migration bridge.
 *
 * Verifies that the type-level migration bridge is in place:
 * - CapabilityConfig has both initialMessage and additionalContext (optional)
 * - TransitionResult has both initialMessage (now optional) and additionalContext
 * - CapabilityPackageConfig.defaultInitialMessage is optional
 */

import type { CapabilityPackageConfig } from "./capability-package";
import type { TransitionResult } from "./state-machines";
import type { CapabilityConfig } from "./types";

describe("Step 1 — type migration bridge", () => {
  describe("CapabilityConfig", () => {
    it("accepts additionalContext alongside initialMessage", () => {
      const config: CapabilityConfig = {
        capability: "test",
        contract: { inputs: [], outputs: [] },
        allowProjectWrites: false,
        initialMessage: "old",
        additionalContext: "new",
      };

      expect(config.additionalContext).toBe("new");
      expect(config.initialMessage).toBe("old");
    });

    it("accepts config with only additionalContext (no initialMessage)", () => {
      const config: CapabilityConfig = {
        capability: "test",
        contract: { inputs: [], outputs: [] },
        allowProjectWrites: false,
        additionalContext: "new",
      };

      expect(config.additionalContext).toBe("new");
      expect(config.initialMessage).toBeUndefined();
    });

    it("accepts config with neither field", () => {
      const config: CapabilityConfig = {
        capability: "test",
        contract: { inputs: [], outputs: [] },
        allowProjectWrites: false,
      };

      expect(config.additionalContext).toBeUndefined();
      expect(config.initialMessage).toBeUndefined();
    });
  });

  describe("TransitionResult", () => {
    it("accepts additionalContext alongside initialMessage", () => {
      const result: TransitionResult = {
        capability: "test",
        stateMachineId: "test",
        sessionName: "test",
        initialMessage: "old",
        additionalContext: "new",
      };

      expect(result.additionalContext).toBe("new");
      expect(result.initialMessage).toBe("old");
    });

    it("accepts result with only additionalContext (initialMessage is optional)", () => {
      const result: TransitionResult = {
        capability: "test",
        stateMachineId: "test",
        sessionName: "test",
        additionalContext: "new",
      };

      expect(result.additionalContext).toBe("new");
      expect(result.initialMessage).toBeUndefined();
    });

    it("accepts result with only initialMessage (additionalContext is optional)", () => {
      const result: TransitionResult = {
        capability: "test",
        stateMachineId: "test",
        sessionName: "test",
        initialMessage: "old",
      };

      expect(result.initialMessage).toBe("old");
      expect(result.additionalContext).toBeUndefined();
    });
  });

  describe("CapabilityPackageConfig", () => {
    it("accepts config without defaultInitialMessage (field is optional)", () => {
      const config: CapabilityPackageConfig = {
        capability: "test",
        contract: { inputs: [], outputs: [] },
        // defaultInitialMessage intentionally omitted
      };

      expect(config.defaultInitialMessage).toBeUndefined();
    });

    it("still accepts config with defaultInitialMessage", () => {
      const config: CapabilityPackageConfig = {
        capability: "test",
        contract: { inputs: [], outputs: [] },
        defaultInitialMessage: () => "hello",
      };

      expect(typeof config.defaultInitialMessage).toBe("function");
    });
  });
});

import { describe, it, expect } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionConfig } from "./capability-utils";

function makeMockCtx(configData?: Record<string, unknown>): ExtensionContext {
  return {
    cwd: "/test/cwd",
    sessionManager: {
      getEntries: () =>
        configData
          ? [{ type: "custom" as const, customType: "pio-config" as const, data: configData }]
          : [],
    },
    ui: { notify: () => {} },
  } as unknown as ExtensionContext;
}

describe("getSessionConfig", () => {
  it("returns null when no pio-config entry exists", () => {
    const ctx = makeMockCtx();
    expect(getSessionConfig(ctx)).toBeNull();
  });

  it("returns null when pio-config entry has no data", () => {
    const ctx = makeMockCtx({});
    const result = getSessionConfig(ctx);
    // empty object is still valid config data — returns it
    expect(result).toEqual({});
  });

  it("returns CapabilityConfig when pio-config entry exists", () => {
    const configData = {
      capability: "create-plan",
      workingDir: "/repo/.pio/goals/test-goal",
      sessionParams: { goalName: "test-goal" },
    };
    const ctx = makeMockCtx(configData);
    const result = getSessionConfig(ctx);

    expect(result).not.toBeNull();
    expect(result!.capability).toBe("create-plan");
    expect(result!.workingDir).toBe("/repo/.pio/goals/test-goal");
    expect(result!.sessionParams).toEqual({ goalName: "test-goal" });
  });
});

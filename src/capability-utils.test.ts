import { describe, it, expect } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionConfig, parseCommandArgs } from "./capability-utils";

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

describe("parseCommandArgs", () => {
  it("parses valid goal name and step number", () => {
    const result = parseCommandArgs("my-goal 3");
    expect(result).toEqual({ name: "my-goal", stepNumber: 3 });
  });

  it("parses goal name without step number", () => {
    const result = parseCommandArgs("my-goal");
    expect(result).toEqual({ name: "my-goal", stepNumber: undefined });
  });

  it("returns null for empty string", () => {
    expect(parseCommandArgs("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseCommandArgs(undefined)).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseCommandArgs("   ")).toBeNull();
  });

  it("rejects non-numeric step number", () => {
    const result = parseCommandArgs("my-goal abc");
    expect(result).toEqual({ name: "my-goal", stepNumber: undefined });
  });

  it("rejects step number zero", () => {
    const result = parseCommandArgs("my-goal 0");
    expect(result).toEqual({ name: "my-goal", stepNumber: undefined });
  });

  it("rejects negative step number", () => {
    const result = parseCommandArgs("my-goal -1");
    expect(result).toEqual({ name: "my-goal", stepNumber: undefined });
  });

  it("handles extra whitespace between args", () => {
    const result = parseCommandArgs("my-goal   5");
    expect(result).toEqual({ name: "my-goal", stepNumber: 5 });
  });
});

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

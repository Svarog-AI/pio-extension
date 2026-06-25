import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSessionConfig, BASE_TOOL_PARAMS, deriveQueueKey } from "./capability-utils";

// Mock resolveCapabilityConfig to control dynamic import behavior
const mockResolveCapabilityConfig = vi.hoisted(() => vi.fn());

vi.mock("./capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfig,
}));

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

describe("BASE_TOOL_PARAMS", () => {
  it("exports workspacePrefix as required string", () => {
    expect(BASE_TOOL_PARAMS.workspacePrefix).toBeDefined();
  });

  it("exports sessionName as optional string", () => {
    expect(BASE_TOOL_PARAMS.sessionName).toBeDefined();
  });

  it("exports initialMessage as required string", () => {
    expect(BASE_TOOL_PARAMS.initialMessage).toBeDefined();
    // Type.String() produces { type: "string" } — Type.Optional wraps it differently
    expect((BASE_TOOL_PARAMS.initialMessage as any).type).toBe("string");
  });
});

describe("deriveQueueKey", () => {
  it("extracts last segment from simple prefix", () => {
    expect(deriveQueueKey("goals/my-feature")).toBe("my-feature");
  });

  it("extracts last segment from nested prefix", () => {
    expect(deriveQueueKey("goals/my-feature/S03")).toBe("S03");
  });

  it("extracts last segment from deeply nested prefix", () => {
    expect(deriveQueueKey("goals/parent/S03/subgoals/nested")).toBe("nested");
  });

  it("returns empty string for empty prefix", () => {
    expect(deriveQueueKey("")).toBe("");
  });

  it("returns the segment for single-segment prefix", () => {
    expect(deriveQueueKey("research")).toBe("research");
  });
});

describe("getSessionConfig", () => {
  beforeEach(() => {
    mockResolveCapabilityConfig.mockClear();
  });

  it("returns null when no pio-config entry exists", async () => {
    const ctx = makeMockCtx();
    const result = await getSessionConfig(ctx);
    expect(result).toBeNull();
    expect(mockResolveCapabilityConfig).not.toHaveBeenCalled();
  });

  it("returns null when pio-config entry has no capability", async () => {
    const ctx = makeMockCtx({});
    const result = await getSessionConfig(ctx);
    expect(result).toBeNull();
    expect(mockResolveCapabilityConfig).not.toHaveBeenCalled();
  });

  it("returns CapabilityConfig when pio-config entry exists", async () => {
    const expectedConfig = {
      capability: "create-plan",
      workspaceDir: "/repo/.pio/goals/test-goal",
      sessionParams: { goalName: "test-goal" },
      contract: { inputs: [], outputs: [] },
    };
    mockResolveCapabilityConfig.mockResolvedValue(expectedConfig);

    const configData = {
      capability: "create-plan",
      sessionParams: { goalName: "test-goal" },
    };
    const ctx = makeMockCtx(configData);
    const result = await getSessionConfig(ctx);

    expect(result).not.toBeNull();
    expect(result!.capability).toBe("create-plan");
    expect(result!.workspaceDir).toBe("/repo/.pio/goals/test-goal");
    expect(result!.sessionParams).toEqual({ goalName: "test-goal" });
  });

  it("calls resolveCapabilityConfig with correct args", async () => {
    mockResolveCapabilityConfig.mockResolvedValue({
      capability: "evolve-plan",
      workspaceDir: "/test/.pio/goals/my-goal",
      sessionParams: { goalName: "my-goal", stepNumber: 2 },
      contract: { inputs: [], outputs: [] },
    });

    const ctx = makeMockCtx({
      capability: "evolve-plan",
      sessionParams: { goalName: "my-goal", stepNumber: 2 },
    });
    await getSessionConfig(ctx);

    expect(mockResolveCapabilityConfig).toHaveBeenCalledWith(
      "/test/cwd",
      { capability: "evolve-plan", goalName: "my-goal", stepNumber: 2 },
    );
  });

  it("propagates error when resolveCapabilityConfig throws", async () => {
    mockResolveCapabilityConfig.mockRejectedValue(new Error("module not found"));

    const ctx = makeMockCtx({ capability: "missing-cap" });
    await expect(getSessionConfig(ctx)).rejects.toThrow("module not found");
  });

  it("returns null when resolveCapabilityConfig returns undefined", async () => {
    mockResolveCapabilityConfig.mockResolvedValue(undefined);

    const ctx = makeMockCtx({ capability: "missing-cap" });
    const result = await getSessionConfig(ctx);

    expect(result).toBeNull();
  });

  it("returns config with live function fields (requiredWhen is a function)", async () => {
    const requiredWhenFn = () => false;
    mockResolveCapabilityConfig.mockResolvedValue({
      capability: "evolve-plan",
      workspaceDir: "/test/.pio/goals/test-goal",
      sessionParams: { goalName: "test-goal", stepNumber: 1 },
      contract: {
        inputs: [],
        outputs: [
          { file: "S01/TASK.md" },
          { file: "COMPLETION_SUMMARY.md", requiredWhen: requiredWhenFn },
        ],
      },
    });

    const ctx = makeMockCtx({
      capability: "evolve-plan",
      sessionParams: { goalName: "test-goal", stepNumber: 1 },
    });
    const result = await getSessionConfig(ctx);

    expect(result).not.toBeNull();
    const completionSummary = result!.contract.outputs.find(
      (o: any) => typeof o === "object" && "file" in o && o.file === "COMPLETION_SUMMARY.md",
    ) as { requiredWhen?: () => boolean };
    expect(completionSummary.requiredWhen).toBe(requiredWhenFn);
  });
});

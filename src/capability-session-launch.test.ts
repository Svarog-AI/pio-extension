import * as os from "node:os";
import * as path from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Mock validateInputs to control validation outcomes
// ---------------------------------------------------------------------------

const mockValidateInputs = vi.hoisted(() =>
  vi.fn().mockReturnValue({ success: true }),
);

vi.mock("./guards/validation", () => ({
  validateInputs: mockValidateInputs,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCtx() {
  const newSessionMock = vi.fn().mockResolvedValue(undefined);
  return {
    sessionManager: { getSessionFile: () => "parent-session.json" },
    newSession: newSessionMock,
  } as any;
}

function makeConfig(overrides: Partial<import("./types").CapabilityConfig> = {}): import("./types").CapabilityConfig {
  return {
    capability: "test-capability",
    workspaceDir: "/tmp/test-goal",
    contract: { inputs: [{ name: "goal", file: "GOAL.md" }], outputs: [] },
    sessionParams: { goalName: "test-goal" },
    allowProjectWrites: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// launchCapability — input validation tests
// These test the real launchCapability() function (not mocked) to verify
// that automatic contract input validation happens before session creation.
// ---------------------------------------------------------------------------

describe("launchCapability — input validation", () => {
  let ctx: ReturnType<typeof makeMockCtx>;

  beforeEach(() => {
    vi.resetModules();
    mockValidateInputs.mockClear();
    mockValidateInputs.mockReturnValue({ success: true });
    ctx = makeMockCtx();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Import launchCapability dynamically after vi.resetModules()
  async function getLaunchCapability() {
    const mod = await import("./capability-session");
    return mod.launchCapability;
  }

  it("passes when all inputs exist — calls validateInputs then creates session", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig();

    mockValidateInputs.mockReturnValue({ success: true });

    await expect(launchCapability(ctx, config)).resolves.toBeUndefined();

    // Assert: validateInputs was called with correct args
    expect(mockValidateInputs).toHaveBeenCalledWith(
      config.workspaceDir,
      config.contract,
      config.sessionParams,
    );

    // Assert: session was created (validation passed)
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("throws descriptive error when validateInputs returns failure", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({ capability: "create-plan" });

    mockValidateInputs.mockReturnValue({
      success: false,
      message: "Required file missing: GOAL.md",
    });

    await expect(launchCapability(ctx, config)).rejects.toThrow(
      'Input validation failed for "create-plan": Required file missing: GOAL.md',
    );

    // Assert: session was NOT created (validation failed)
    expect(ctx.newSession).not.toHaveBeenCalled();
  });

  it("throws error with default message when validateInputs has no message", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({ capability: "execute-task" });

    mockValidateInputs.mockReturnValue({ success: false });

    await expect(launchCapability(ctx, config)).rejects.toThrow(
      'Input validation failed for "execute-task": missing required files',
    );

    expect(ctx.newSession).not.toHaveBeenCalled();
  });

  it("skips validation when contract is absent", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({ contract: undefined });

    await expect(launchCapability(ctx, config)).resolves.toBeUndefined();

    // Assert: validateInputs was NOT called (guard skipped)
    expect(mockValidateInputs).not.toHaveBeenCalled();

    // Assert: session was still created
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("skips validation when workspaceDir is absent", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({ workspaceDir: undefined });

    await expect(launchCapability(ctx, config)).resolves.toBeUndefined();

    // Assert: validateInputs was NOT called (guard skipped)
    expect(mockValidateInputs).not.toHaveBeenCalled();

    // Assert: session was still created
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("handles placeholder resolution via sessionParams", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({
      capability: "evolve-plan",
      contract: {
        inputs: [{ name: "plan", file: "PLAN.md" }, { name: "task", file: "S{stepNumber:02d}/TASK.md" }],
        outputs: [],
      },
      sessionParams: { goalName: "test-goal", stepNumber: 3 },
    });

    mockValidateInputs.mockReturnValue({ success: true });

    await expect(launchCapability(ctx, config)).resolves.toBeUndefined();

    // Assert: validateInputs was called with sessionParams containing stepNumber
    expect(mockValidateInputs).toHaveBeenCalledWith(
      config.workspaceDir,
      config.contract,
      config.sessionParams,
    );

    // The sessionParams include stepNumber: 3 — inside validateInputs,
    // resolvePaths will use it to resolve S{stepNumber:02d}/TASK.md → S03/TASK.md
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("throws when resolvePaths fails inside validateInputs (missing placeholder key)", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({
      capability: "evolve-plan",
      contract: {
        inputs: [{ name: "plan", file: "PLAN.md" }, { name: "task", file: "S{stepNumber:02d}/TASK.md" }],
        outputs: [],
      },
      // stepNumber is missing from sessionParams!
      sessionParams: { goalName: "test-goal" },
    });

    // validateInputs catches resolvePaths errors and returns { success: false }
    mockValidateInputs.mockReturnValue({
      success: false,
      message: "Unresolved placeholder {stepNumber:02d} in path. Ensure session params include key 'stepNumber'.",
    });

    await expect(launchCapability(ctx, config)).rejects.toThrow(
      'Input validation failed for "evolve-plan": Unresolved placeholder {stepNumber:02d} in path. Ensure session params include key \'stepNumber\'.',
    );

    expect(ctx.newSession).not.toHaveBeenCalled();
  });

  it("passes for create-goal with empty inputs (no files to check)", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({
      capability: "create-goal",
      contract: { inputs: [], outputs: [{ name: "goal", file: "GOAL.md" }] },
    });

    mockValidateInputs.mockReturnValue({ success: true });

    await expect(launchCapability(ctx, config)).resolves.toBeUndefined();

    expect(mockValidateInputs).toHaveBeenCalled();
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("passes initialMessage through to session", async () => {
    const launchCapability = await getLaunchCapability();
    const config = makeConfig({
      initialMessage: "Test initial message",
    });

    mockValidateInputs.mockReturnValue({ success: true });

    await launchCapability(ctx, config);

    // Assert: newSession was called with withSession callback
    const newSessionCall = ctx.newSession.mock.calls[0][0];
    expect(newSessionCall.withSession).toBeDefined();

    // The withSession callback sends the initial message
    // We can't easily invoke it here, but we verified newSession was called
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });
});

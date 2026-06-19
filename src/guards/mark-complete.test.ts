import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-mark-complete-guard-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockValidateOutputs = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
const mockGetMachine = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockEnqueueTask = vi.hoisted(() => vi.fn());

vi.mock("../guards/validation", () => ({
  validateOutputs: mockValidateOutputs,
}));

vi.mock("../state-machines", () => ({
  dispatch: mockDispatch,
  getMachine: mockGetMachine,
  goalDrivenDevelopment: {},
  recordTransition: mockRecordTransition,
}));

vi.mock("../queues", async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueTask: mockEnqueueTask,
}));

const mockResolveCapabilityConfigMC = vi.hoisted(() => vi.fn());

vi.mock("../capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfigMC,
}));

// ---------------------------------------------------------------------------
// pio_mark_complete — tool registration via setupMarkComplete
// ---------------------------------------------------------------------------

describe("mark-complete (setupMarkComplete)", () => {
  let tempDir: string;
  let goalDir: string;
  let registeredTool: { name: string; label: string; execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    // Create a goal directory so path.basename(dir) returns "test-goal"
    goalDir = path.join(tempDir, ".pio", "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    // Clear mock call history and reset return values
    mockValidateOutputs.mockClear().mockReturnValue({ success: true });
    mockDispatch.mockClear();
    mockGetMachine.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockResolveCapabilityConfigMC.mockClear();
    mockResolveCapabilityConfigMC.mockImplementation((_cwd, params) => {
      const cap = typeof params?.capability === "string" ? params.capability : "unknown";
      // getSessionConfig passes { capability, ...sessionParams } to resolveCapabilityConfig.
      // Tests put extra fields in sessionParams for the mock to pick up.
      const { capability: _cap, workingDir, contract, postValidate, postExecute, fileCleanup, prepareSession, ...sessionParams } = params ?? {};
      return {
        capability: cap,
        workingDir: workingDir ?? goalDir,
        sessionParams,
        contract: contract ?? { inputs: [], outputs: [] },
        prepareSession,
        postValidate,
        postExecute,
        fileCleanup,
      };
    });

    registeredTool = undefined;

    // Import and set up
    const mod = await import("./mark-complete");

    const mockPi = {
      registerTool: (tool: { name: string; label: string; execute: Function }) => {
        registeredTool = tool;
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };

    mod.setupMarkComplete(mockPi as any);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("registers as pio_mark_complete via setupMarkComplete", () => {
    expect(registeredTool).toBeDefined();
    expect(registeredTool!.name).toBe("pio_mark_complete");
    expect(registeredTool!.label).toBe("Pio Mark Complete");
  });

  it("file validation failure returns error without terminating", async () => {
    mockValidateOutputs.mockReturnValue({ success: false, message: "Output file 'missing.md' is missing" });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: goalDir,
              contract: { inputs: [], outputs: [{ file: "missing.md" }] },
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.content[0].text).toContain("Validation failed");
    expect(result.content[0].text).toContain("missing.md");
    expect(result.terminate).toBeFalsy();
  });

  it("file validation success continues to postValidate", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    const postValidateMock = vi.fn().mockReturnValue({ success: false, message: "test error" });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: postValidateMock,
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(postValidateMock).toHaveBeenCalledWith(goalDir, expect.objectContaining({ goalName: "test-goal", stepNumber: 1 }));
    expect(result.content[0].text).toContain("test error");
    expect(result.terminate).toBeFalsy();
  });

  it("postValidate failure prevents transitions", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    const postValidateMock = vi.fn().mockReturnValue({ success: false, message: "validation failed" });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: postValidateMock,
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
  });

  it("postValidate success triggers transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).toHaveBeenCalled();
    expect(mockRecordTransition).toHaveBeenCalled();
    expect(result.terminate).toBe(true);
  });

  it("multiple dispatch results do not enqueue task and recommend /pio-transition", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      { capability: "evolve-plan", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 2 } },
      { capability: "execute-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } },
    ]);

    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "review-task",
              workingDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // dispatch was called but no task should be enqueued
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();

    // notification should recommend /pio-transition with available capabilities
    expect(result.content[0].text).toContain("Multiple transitions available");
    expect(result.content[0].text).toContain("evolve-plan");
    expect(result.content[0].text).toContain("execute-task");
    expect(result.content[0].text).toContain("/pio-transition");
    expect(result.terminate).toBe(true);
  });

  it("no dispatch results (terminal state) do not enqueue task", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([]);

    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "finalize-goal",
              workingDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // dispatch was called but no task should be enqueued
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();

    // terminal state — no extra notification, just "Validation passed"
    expect(result.content[0].text).toBe("Validation passed. All expected outputs have been produced.");
    expect(result.terminate).toBe(true);
  });

  it("postExecute runs after transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const callOrder: string[] = [];

    const postValidateMock = vi.fn().mockImplementation(() => {
      callOrder.push("postValidate");
      return { success: true };
    });

    const postExecuteMock = vi.fn().mockImplementation(() => {
      callOrder.push("postExecute");
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: postValidateMock,
      postExecute: postExecuteMock,
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(callOrder).toEqual(["postValidate", "postExecute"]);
    expect(result.terminate).toBe(true);
  });

  it("postExecute errors don't block termination", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const postExecuteMock = vi.fn().mockImplementation(() => {
      throw new Error("postExecute failed");
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
      postExecute: postExecuteMock,
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.terminate).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("cleanup deletes files in fileCleanup", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    // Create a temp file to clean up
    const cleanupFilePath = path.join(tempDir, "to-cleanup.txt");
    fs.writeFileSync(cleanupFilePath, "delete me", "utf-8");

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
      fileCleanup: [cleanupFilePath],
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(fs.existsSync(cleanupFilePath)).toBe(false);
  });

  it("no config entry passes with terminate true", async () => {
    const mockCtx = {
      sessionManager: {
        getEntries: () => [],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.content[0].text).toContain("No validation");
    expect(result.terminate).toBe(true);
  });

  it("missing workingDir passes with terminate true", async () => {
    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      // workingDir is missing
      contract: { inputs: [], outputs: [] },
      sessionParams: {},
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: {},
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.content[0].text).toContain("No directory");
    expect(result.terminate).toBe(true);
  });

  it("throws when queueKey is missing from session params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      // sessionParams intentionally lacks queueKey
      sessionParams: { goalName: "test-goal", stepNumber: 1 },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              // sessionParams intentionally lacks queueKey
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    // Act & Assert: should throw with the specific error message
    await expect(
      registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx),
    ).rejects.toThrow("mark-complete: queueKey missing from session params — ensure enqueue provides it");

    // dispatch should NOT have been called (throw happens before transitions)
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });

  it("throws when queueKey is an empty string", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "" },
            },
          },
        ],
      },
    };

    // Act & Assert: empty string is not a valid queueKey
    await expect(
      registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx),
    ).rejects.toThrow("mark-complete: queueKey missing from session params — ensure enqueue provides it");
  });

  it("throws when queueKey is not a string type", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: 123 },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: 123 },
            },
          },
        ],
      },
    };

    // Act & Assert: non-string queueKey is rejected
    await expect(
      registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx),
    ).rejects.toThrow("mark-complete: queueKey missing from session params — ensure enqueue provides it");
  });


  it("dispatches with explicit machine when stateMachineId is in session params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development", queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development", queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // getMachine should have been called with the stateMachineId
    expect(mockGetMachine).toHaveBeenCalledWith("goal-driven-development");
    // dispatch should have been called with the explicit machine (not undefined)
    expect(mockDispatch).toHaveBeenCalledWith(
      { id: "goal-driven-development" },
      "execute-task",
      expect.anything(),
      expect.objectContaining({ goalName: "test-goal", stepNumber: 1 }),
    );
  });

  it("falls back to dispatch(undefined) when stateMachineId is absent", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // getMachine should NOT have been called (no stateMachineId to look up)
    expect(mockGetMachine).not.toHaveBeenCalled();
    // dispatch should have been called with undefined (fallback)
    expect(mockDispatch).toHaveBeenCalledWith(
      undefined,
      "execute-task",
      expect.anything(),
      expect.objectContaining({ goalName: "test-goal", stepNumber: 1 }),
    );
  });

  it("falls back to dispatch(undefined) when getMachine returns undefined (unknown ID)", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue(undefined);
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "unknown-machine", queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "unknown-machine", queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // getMachine was called but returned undefined
    expect(mockGetMachine).toHaveBeenCalledWith("unknown-machine");
    // dispatch should have been called with undefined (fallback)
    expect(mockDispatch).toHaveBeenCalledWith(
      undefined,
      "execute-task",
      expect.anything(),
      expect.objectContaining({ goalName: "test-goal", stepNumber: 1 }),
    );
  });

  it("includes stateMachineId in enqueued task params when transition result provides one", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development", queueKey: "test-goal" },
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development", queueKey: "test-goal" },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // enqueueTask should have been called with stateMachineId at top level in params
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        capability: "review-task",
        params: expect.objectContaining({
          stateMachineId: "goal-driven-development",
        }),
      }),
    );
  });

  it("recordTransition receives enriched params including stateMachineId", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { stepNumber: 2 } }]
    );

    const sessionParams = { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development", queueKey: "test-goal" };

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workingDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams,
      postValidate: vi.fn().mockReturnValue({ success: true }),
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams,
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    // recordTransition should have been called with 4 arguments
    expect(mockRecordTransition).toHaveBeenCalledTimes(1);
    const callArgs = mockRecordTransition.mock.calls[0];
    expect(callArgs.length).toBe(4);

    // 4th argument (enriched params) should contain stateMachineId at top level
    const enrichedParams = callArgs[3];
    expect(enrichedParams).toHaveProperty("stateMachineId", "goal-driven-development");
    expect(enrichedParams).toHaveProperty("stepNumber", 2); // from adjustedParams
    expect(enrichedParams).toHaveProperty("_sessionContext", sessionParams);

    // Verify the same enriched params were passed to enqueueTask
    const enqueueCall = mockEnqueueTask.mock.calls[0];
    expect(enqueueCall[2].params).toBe(enrichedParams);
  });
});

// ---------------------------------------------------------------------------
// Note: frontmatter schema validation is now part of validateOutputs()
// and is tested in validation.test.ts. mark-complete.ts no longer calls
// validateFrontmatter() separately.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  resolveContractPath: vi
    .fn()
    .mockImplementation(
      (
        contractPath: string,
        baseDir: string,
        _workspacePrefix?: string,
        _params?: Record<string, unknown>,
        projectRelative?: boolean,
      ) => {
        if (projectRelative) {
          return path.join(baseDir, contractPath);
        }
        return path.join(baseDir, contractPath);
      },
    ),
}));

// ---------------------------------------------------------------------------
// pio_mark_complete — tool registration via setupMarkComplete
// ---------------------------------------------------------------------------

describe("mark-complete (setupMarkComplete)", () => {
  let tempDir: string;
  let goalDir: string;
  let registeredTool:
    | { name: string; label: string; execute: Function }
    | undefined;

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
      const cap =
        typeof params?.capability === "string" ? params.capability : "unknown";
      // getSessionConfig passes { capability, workspaceDir, ...sessionParams } to resolveCapabilityConfig.
      // workspaceDir is the resolved directory (includes workspacePrefix).
      // Tests put extra fields in sessionParams for the mock to pick up.
      const {
        capability: _cap,
        workspaceDir,
        contract,
        postValidate,
        postExecute,
        fileCleanup,
        prepareSession,
        ...sessionParams
      } = params ?? {};
      return {
        capability: cap,
        workspaceDir: workspaceDir ?? goalDir,
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
      registerTool: (tool: {
        name: string;
        label: string;
        execute: Function;
      }) => {
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
    expect(registeredTool?.name).toBe("pio_mark_complete");
    expect(registeredTool?.label).toBe("Pio Mark Complete");
  });

  it("file validation failure returns error without terminating", async () => {
    mockValidateOutputs.mockReturnValue({
      success: false,
      message: "Output file 'missing.md' is missing",
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workspaceDir: goalDir,
              contract: { inputs: [], outputs: [{ file: "missing.md" }] },
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("Validation failed");
    expect(result.content[0].text).toContain("missing.md");
    expect(result.terminate).toBeFalsy();
  });

  it("file validation success continues to postValidate", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    const postValidateMock = vi
      .fn()
      .mockReturnValue({ success: false, message: "test error" });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(postValidateMock).toHaveBeenCalledWith(
      goalDir,
      expect.objectContaining({ goalName: "test-goal", stepNumber: 1 }),
    );
    expect(result.content[0].text).toContain("test error");
    expect(result.terminate).toBeFalsy();
  });

  it("postValidate failure prevents transitions", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    const postValidateMock = vi
      .fn()
      .mockReturnValue({ success: false, message: "validation failed" });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
  });

  it("postValidate success triggers transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workspaceDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).toHaveBeenCalled();
    expect(mockRecordTransition).toHaveBeenCalled();
    expect(result.terminate).toBe(true);
  });

  it("multiple dispatch results do not enqueue task and show unsupported message", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      {
        capability: "evolve-plan",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 2 },
        sessionName: "s1",
        initialMessage: "m1",
      },
      {
        capability: "execute-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "s2",
        initialMessage: "m2",
      },
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
              workspaceDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // dispatch was called but no task should be enqueued
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();

    // notification should list capabilities and say transition is unsupported
    expect(result.content[0].text).toContain("Multiple transitions available");
    expect(result.content[0].text).toContain("evolve-plan");
    expect(result.content[0].text).toContain("execute-task");
    expect(result.content[0].text).toContain("not supported at the moment");
    expect(result.content[0].text).not.toContain("/pio-transition");
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
              workspaceDir: goalDir,
              contract: { inputs: [], outputs: [] },
              postValidate: postValidateMock,
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // dispatch was called but no task should be enqueued
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();

    // terminal state — no extra notification, just "Validation passed"
    expect(result.content[0].text).toBe(
      "Validation passed. All expected outputs have been produced.",
    );
    expect(result.terminate).toBe(true);
  });

  it("postExecute runs after transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

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
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(callOrder).toEqual(["postValidate", "postExecute"]);
    expect(result.terminate).toBe(true);
  });

  it("postExecute errors don't block termination", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const postExecuteMock = vi.fn().mockImplementation(() => {
      throw new Error("postExecute failed");
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(result.terminate).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("cleanup deletes files in fileCleanup", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    // Create a temp file to clean up
    const cleanupFilePath = path.join(tempDir, "to-cleanup.txt");
    fs.writeFileSync(cleanupFilePath, "delete me", "utf-8");

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(fs.existsSync(cleanupFilePath)).toBe(false);
  });

  it("no config entry passes with terminate true", async () => {
    const mockCtx = {
      sessionManager: {
        getEntries: () => [],
      },
    };

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("No validation");
    expect(result.terminate).toBe(true);
  });

  it("missing workspaceDir passes with terminate true", async () => {
    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      // workspaceDir is missing
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

    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("No directory");
    expect(result.terminate).toBe(true);
  });

  it("throws when queueKey is missing from session params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
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
      registeredTool?.execute(
        "test-id",
        {},
        new AbortController(),
        () => {},
        mockCtx,
      ),
    ).rejects.toThrow(
      "mark-complete: queueKey missing from session params — ensure enqueue provides it",
    );

    // dispatch should NOT have been called (throw happens before transitions)
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });

  it("throws when queueKey is an empty string", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "",
              },
            },
          },
        ],
      },
    };

    // Act & Assert: empty string is not a valid queueKey
    await expect(
      registeredTool?.execute(
        "test-id",
        {},
        new AbortController(),
        () => {},
        mockCtx,
      ),
    ).rejects.toThrow(
      "mark-complete: queueKey missing from session params — ensure enqueue provides it",
    );
  });

  it("throws when queueKey is not a string type", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: 123,
              },
            },
          },
        ],
      },
    };

    // Act & Assert: non-string queueKey is rejected
    await expect(
      registeredTool?.execute(
        "test-id",
        {},
        new AbortController(),
        () => {},
        mockCtx,
      ),
    ).rejects.toThrow(
      "mark-complete: queueKey missing from session params — ensure enqueue provides it",
    );
  });

  it("dispatches with explicit machine when stateMachineId is in session params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        stateMachineId: "goal-driven-development",
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                stateMachineId: "goal-driven-development",
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

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
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

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
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        stateMachineId: "unknown-machine",
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                stateMachineId: "unknown-machine",
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

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
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { goalName: "test-goal", stepNumber: 1 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        stateMachineId: "goal-driven-development",
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                stateMachineId: "goal-driven-development",
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

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
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { stepNumber: 2 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    const sessionParams = {
      goalName: "test-goal",
      stepNumber: 1,
      stateMachineId: "goal-driven-development",
      queueKey: "test-goal",
    };

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
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

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // recordTransition should have been called with 4 arguments
    expect(mockRecordTransition).toHaveBeenCalledTimes(1);
    const callArgs = mockRecordTransition.mock.calls[0];
    expect(callArgs.length).toBe(4);

    // 4th argument (enriched params) should contain stateMachineId at top level
    const enrichedParams = callArgs[3];
    expect(enrichedParams).toHaveProperty(
      "stateMachineId",
      "goal-driven-development",
    );
    expect(enrichedParams).toHaveProperty("stepNumber", 2); // from adjustedParams

    // Verify the same enriched params were passed to enqueueTask
    const enqueueCall = mockEnqueueTask.mock.calls[0];
    expect(enqueueCall[2].params).toBe(enrichedParams);
  });

  it("propagates sessionName into enqueued task params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { stepNumber: 2 },
        sessionName: "test review",
        initialMessage: "msg",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        stateMachineId: "goal-driven-development",
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                stateMachineId: "goal-driven-development",
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // enqueueTask should have been called with sessionName in params
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        capability: "review-task",
        params: expect.objectContaining({
          sessionName: "test review",
        }),
      }),
    );
  });

  it("propagates initialMessage into enqueued task params", async () => {
    mockValidateOutputs.mockReturnValue({ success: true });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: { stepNumber: 2 },
        sessionName: "test review",
        initialMessage: "custom kickoff message",
      },
    ]);

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        stateMachineId: "goal-driven-development",
        queueKey: "test-goal",
      },
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
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                stateMachineId: "goal-driven-development",
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // enqueueTask should have been called with initialMessage in params
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        capability: "review-task",
        params: expect.objectContaining({
          initialMessage: "custom kickoff message",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Note: frontmatter schema validation is now part of validateOutputs()
// and is tested in validation.test.ts. mark-complete.ts no longer calls
// validateFrontmatter() separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cleanupMarkers — framework auto-cleanup at session start
// ---------------------------------------------------------------------------

describe("cleanupMarkers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("deletes all declared marker filenames from all values mappings", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // Create marker files
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "BLOCKED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "REJECTED"), "", "utf-8");

    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
        {
          outputFile: "review",
          field: "decision",
          values: { APPROVED: "APPROVED", REJECTED: "REJECTED" },
        },
      ],
    };

    cleanupMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);
  });

  it("handles missing files gracefully (no errors thrown)", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // No files created — all markers are missing
    const contract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles undefined markers as no-op", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      // markers is undefined
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles empty markers array as no-op", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("deduplicates filenames across multiple declarations", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // Create the shared marker file
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    // Two declarations both produce "COMPLETED"
    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
        {
          outputFile: "other",
          field: "result",
          values: { done: "COMPLETED" },
        },
      ],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
  });

  it("only deletes declared markers, leaves other files untouched", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "content", "utf-8");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    cleanupMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    // These should still exist
    expect(fs.existsSync(path.join(tempDir, "SUMMARY.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "TASK.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupMarkers integration — runs before prepareSession in resources_discover
// ---------------------------------------------------------------------------

describe("cleanupMarkers integration (session startup)", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    goalDir = path.join(tempDir, ".pio", "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("cleanupMarkers runs before prepareSession during resources_discover", async () => {
    // Create a marker file that should be cleaned up
    fs.writeFileSync(path.join(goalDir, "APPROVED"), "", "utf-8");

    const callOrder: string[] = [];

    // prepareSession checks if APPROVED was already deleted
    const prepareSessionMock = vi.fn().mockImplementation((wd: string) => {
      callOrder.push("prepareSession");
      callOrder.push(
        fs.existsSync(path.join(wd, "APPROVED"))
          ? "APPROVED still exists"
          : "APPROVED already deleted",
      );
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "review-task",
      workspaceDir: goalDir,
      contract: {
        inputs: [],
        outputs: [{ name: "review", file: "REVIEW.md", schema: undefined }],
        markers: [
          {
            outputFile: "review",
            field: "decision",
            values: { APPROVED: "APPROVED", REJECTED: "REJECTED" },
          },
        ],
      },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
      prepareSession: prepareSessionMock,
    });

    // Import capability-session which wires up resources_discover
    const mod = await import("../capability-session");

    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn().mockImplementation((event, handler) => {
        if (event === "resources_discover") {
          // Simulate resources_discover event
          const mockCtx = {
            sessionManager: {
              getEntries: () => [
                {
                  type: "custom",
                  customType: "pio-config",
                  data: {
                    capability: "review-task",
                    workspaceDir: goalDir,
                    sessionParams: {
                      goalName: "test-goal",
                      stepNumber: 1,
                      queueKey: "test-goal",
                    },
                  },
                },
              ],
            },
          };
          // Call the handler synchronously (it's async but we'll await)
          Promise.resolve(handler(null, mockCtx)).catch(() => {});
        }
      }),
      setSessionName: vi.fn(),
    };

    mod.setupSessionInfrastructure(mockPi as any);

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // APPROVED should have been deleted before prepareSession ran
    expect(callOrder).toContain("prepareSession");
    expect(callOrder).toContain("APPROVED already deleted");
    expect(fs.existsSync(path.join(goalDir, "APPROVED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMarkers — framework marker engine
// ---------------------------------------------------------------------------

describe("applyMarkers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("creates correct marker based on frontmatter field value", async () => {
    const { applyMarkers } = await import("./mark-complete");

    // Create SUMMARY.md with frontmatter
    const summaryPath = path.join(tempDir, "SUMMARY.md");
    fs.writeFileSync(
      summaryPath,
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    applyMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("deletes stale markers from same declaration (idempotency)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    // First run: create BLOCKED
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: blocked\n---\n# Summary\nBlocked.",
      "utf-8",
    );
    applyMarkers(tempDir, contract);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    // Second run: switch to completed — should delete BLOCKED, create COMPLETED
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );
    applyMarkers(tempDir, contract);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("handles multiple marker declarations in one contract", async () => {
    const { applyMarkers } = await import("./mark-complete");

    // Create both output files
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tempDir, "REVIEW.md"),
      "---\ndecision: APPROVED\n---\n# Review\nApproved.",
      "utf-8",
    );

    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "summary", file: "SUMMARY.md", schema: undefined },
        { name: "review", file: "REVIEW.md", schema: undefined },
      ],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" } as Record<
            string,
            string
          >,
        },
        {
          outputFile: "review",
          field: "decision",
          values: { APPROVED: "APPROVED", REJECTED: "REJECTED" } as Record<
            string,
            string
          >,
        },
      ],
    };

    applyMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);
  });

  it("handles missing output file (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    // SUMMARY.md does not exist
    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not read frontmatter"),
    );
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    warnSpy.mockRestore();
  });

  it("handles unknown field value (warns, deletes stale, creates none)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    // Create a stale COMPLETED marker
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: cancelled\n---\n# Summary\nCancelled.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    applyMarkers(tempDir, contract);

    // Should warn about unknown value
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown value 'cancelled'"),
    );
    // Stale markers should be deleted
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    // No new marker created

    warnSpy.mockRestore();
  });

  it("handles missing field key in frontmatter (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nother: field\n---\n# Summary\nNo status.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("field 'status' not found"),
    );
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    warnSpy.mockRestore();
  });

  it("handles output file name not found in contract (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "nonexistent",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("output 'nonexistent' not found"),
    );

    warnSpy.mockRestore();
  });

  it("handles undefined markers array as no-op", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      // markers is undefined
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles empty markers array as no-op", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyMarkers integration — runs before postExecute in mark-complete flow
// ---------------------------------------------------------------------------

describe("applyMarkers integration (mark-complete flow)", () => {
  let tempDir: string;
  let goalDir: string;
  let registeredTool: any;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    goalDir = path.join(tempDir, ".pio", "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    mockValidateOutputs.mockClear().mockReturnValue({ success: true });
    mockDispatch.mockClear();
    mockGetMachine.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockResolveCapabilityConfigMC.mockClear();

    registeredTool = undefined;

    const mod = await import("./mark-complete");

    const mockPi = {
      registerTool: (tool: any) => {
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

  it("marker engine runs before postExecute callback", async () => {
    // Create SUMMARY.md with status: completed
    fs.writeFileSync(
      path.join(goalDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );

    const callOrder: string[] = [];

    const postExecuteMock = vi.fn().mockImplementation(() => {
      callOrder.push("postExecute");
      // At this point, COMPLETED should already exist (created by applyMarkers)
      callOrder.push(
        fs.existsSync(path.join(goalDir, "COMPLETED"))
          ? "COMPLETED exists"
          : "COMPLETED missing",
      );
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "execute-task",
      workspaceDir: goalDir,
      contract: {
        inputs: [],
        outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
        markers: [
          {
            outputFile: "summary",
            field: "status",
            values: { completed: "COMPLETED", blocked: "BLOCKED" },
          },
        ],
      },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
      postValidate: vi.fn().mockImplementation(() => {
        callOrder.push("postValidate");
        return { success: true };
      }),
      postExecute: postExecuteMock,
    });

    mockDispatch.mockReturnValue([]);

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "test-goal",
              },
            },
          },
        ],
      },
    };

    await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // applyMarkers runs before postExecute, so COMPLETED should exist when postExecute runs
    expect(callOrder).toContain("postValidate");
    expect(callOrder).toContain("postExecute");
    expect(callOrder).toContain("COMPLETED exists");
    // COMPLETED exists should come after postExecute (checked inside postExecute)
    const postExecuteIdx = callOrder.indexOf("postExecute");
    const completedIdx = callOrder.indexOf("COMPLETED exists");
    expect(completedIdx).toBeGreaterThan(postExecuteIdx);
  });
});

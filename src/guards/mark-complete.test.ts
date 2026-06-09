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
const mockValidateFrontmatter = vi.hoisted(() => vi.fn());
const mockCreateGoalState = vi.hoisted(() => vi.fn().mockReturnValue({
  goalName: "test-goal",
  steps: vi.fn().mockReturnValue([]),
  currentStepNumber: vi.fn().mockReturnValue(1),
}));
const mockDispatch = vi.hoisted(() => vi.fn());
const mockGetMachine = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockEnqueueTask = vi.hoisted(() => vi.fn());
const mockWriteLastTask = vi.hoisted(() => vi.fn());

vi.mock("../guards/validation", () => ({
  validateOutputs: mockValidateOutputs,
  validateFrontmatter: mockValidateFrontmatter,
}));

vi.mock("../goal-state", () => ({
  createGoalState: mockCreateGoalState,
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
  writeLastTask: mockWriteLastTask,
}));

// ---------------------------------------------------------------------------
// pio_mark_complete — tool registration via setupMarkComplete
// ---------------------------------------------------------------------------

describe("mark-complete (setupMarkComplete)", () => {
  let tempDir: string;
  let registeredTool: { name: string; label: string; execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();

    // Clear mock call history and reset return values
    mockValidateOutputs.mockClear().mockReturnValue({ passed: true, missing: [] });
    mockValidateFrontmatter.mockClear().mockReturnValue({ success: true });
    mockCreateGoalState.mockClear().mockReturnValue({
      goalName: "test-goal",
      steps: vi.fn().mockReturnValue([]),
      currentStepNumber: vi.fn().mockReturnValue(1),
    });
    mockDispatch.mockClear();
    mockGetMachine.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockWriteLastTask.mockClear();

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
    mockValidateOutputs.mockReturnValue({ passed: false, missing: ["missing.md"] });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: ["missing.md"] },
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });

    const postValidateMock = vi.fn().mockReturnValue({ success: false, message: "test error" });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(postValidateMock).toHaveBeenCalledWith(tempDir, { goalName: "test-goal", stepNumber: 1 });
    expect(result.content[0].text).toContain("test error");
    expect(result.terminate).toBeFalsy();
  });

  it("postValidate failure prevents transitions", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });

    const postValidateMock = vi.fn().mockReturnValue({ success: false, message: "validation failed" });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
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
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockEnqueueTask).toHaveBeenCalled();
    expect(mockRecordTransition).toHaveBeenCalled();
    expect(mockWriteLastTask).toHaveBeenCalled();
    expect(result.terminate).toBe(true);
  });

  it("multiple dispatch results do not enqueue task and recommend /pio-transition", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
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
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    expect(mockWriteLastTask).not.toHaveBeenCalled();

    // notification should recommend /pio-transition with available capabilities
    expect(result.content[0].text).toContain("Multiple transitions available");
    expect(result.content[0].text).toContain("evolve-plan");
    expect(result.content[0].text).toContain("execute-task");
    expect(result.content[0].text).toContain("/pio-transition");
    expect(result.terminate).toBe(true);
  });

  it("no dispatch results (terminal state) do not enqueue task", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
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
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    expect(mockWriteLastTask).not.toHaveBeenCalled();

    // terminal state — no extra notification, just "Validation passed"
    expect(result.content[0].text).toBe("Validation passed. All expected outputs have been produced.");
    expect(result.terminate).toBe(true);
  });

  it("postExecute runs after transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
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

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: postValidateMock,
              postExecute: postExecuteMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const postExecuteMock = vi.fn().mockImplementation(() => {
      throw new Error("postExecute failed");
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              postExecute: postExecuteMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    // Create a temp file to clean up
    const cleanupFilePath = path.join(tempDir, "to-cleanup.txt");
    fs.writeFileSync(cleanupFilePath, "delete me", "utf-8");

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              fileCleanup: [cleanupFilePath],
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
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
    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              // workingDir is missing
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

  it("dispatches with explicit machine when stateMachineId is in session params", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development" },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
              // No stateMachineId
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockGetMachine.mockReturnValue(undefined);
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "unknown-machine" },
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
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockGetMachine.mockReturnValue({ id: "goal-driven-development" });
    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              postValidate: vi.fn().mockReturnValue({ success: true }),
              sessionParams: { goalName: "test-goal", stepNumber: 1, stateMachineId: "goal-driven-development" },
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
});

// ---------------------------------------------------------------------------
// Frontmatter schema validation — exit-gate integration
// ---------------------------------------------------------------------------

describe("pio_mark_complete — frontmatterSchemas validation", () => {
  let tempDir: string;
  let registeredTool: { name: string; label: string; execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();

    mockValidateOutputs.mockClear().mockReturnValue({ passed: true, missing: [] });
    mockValidateFrontmatter.mockClear().mockReturnValue({ success: true });
    mockCreateGoalState.mockClear().mockReturnValue({
      goalName: "test-goal",
      steps: vi.fn().mockReturnValue([]),
      currentStepNumber: vi.fn().mockReturnValue(1),
    });
    mockDispatch.mockClear();
    mockGetMachine.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockWriteLastTask.mockClear();

    registeredTool = undefined;

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

  it("validates frontmatterSchemas after file validation passes, before postValidate", async () => {
    const callOrder: string[] = [];

    mockValidateFrontmatter.mockImplementation(() => {
      callOrder.push("validateFrontmatter");
      return { success: true };
    });

    const postValidateMock = vi.fn().mockImplementation(() => {
      callOrder.push("postValidate");
      return { success: true };
    });

    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "create-plan",
              workingDir: tempDir,
              validation: { files: [] },
              frontmatterSchemas: [{ outputFile: "PLAN.md", schema: {} }],
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(callOrder).toEqual(["validateFrontmatter", "postValidate"]);
    expect(mockValidateFrontmatter).toHaveBeenCalledWith(
      [{ outputFile: "PLAN.md", schema: {} }],
      tempDir,
    );
  });

  it("frontmatter validation failure returns error without terminating", async () => {
    mockValidateFrontmatter.mockReturnValue({
      success: false,
      message: "Field 'totalSteps': required property",
    });

    const postValidateMock = vi.fn();

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "create-plan",
              workingDir: tempDir,
              validation: { files: [] },
              frontmatterSchemas: [{ outputFile: "PLAN.md", schema: {} }],
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.content[0].text).toContain("Frontmatter validation failed");
    expect(result.content[0].text).toContain("Field 'totalSteps'");
    expect(result.terminate).toBeFalsy();
    expect(postValidateMock).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("skips frontmatter validation when frontmatterSchemas is not defined", async () => {
    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workingDir: tempDir,
              validation: { files: [] },
              // No frontmatterSchemas
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(mockValidateFrontmatter).not.toHaveBeenCalled();
    expect(postValidateMock).toHaveBeenCalled();
  });

  it("skips frontmatter validation when frontmatterSchemas is empty array", async () => {
    const postValidateMock = vi.fn().mockReturnValue({ success: true });

    mockDispatch.mockReturnValue(
      [{ capability: "review-task", stateMachineId: "goal-driven-development", params: { goalName: "test-goal", stepNumber: 1 } }]
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "create-plan",
              workingDir: tempDir,
              validation: { files: [] },
              frontmatterSchemas: [],
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(mockValidateFrontmatter).not.toHaveBeenCalled();
    expect(postValidateMock).toHaveBeenCalled();
  });
});

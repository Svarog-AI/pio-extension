import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-mark-complete-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module-level mocks — isolated to this test file
// ---------------------------------------------------------------------------

const mockValidateOutputs = vi.hoisted(() => vi.fn());
const mockCreateGoalState = vi.hoisted(() => vi.fn().mockReturnValue({
  goalName: "test-goal",
  steps: vi.fn().mockReturnValue([]),
  currentStepNumber: vi.fn().mockReturnValue(1),
}));
const mockResolveTransition = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockEnqueueTask = vi.hoisted(() => vi.fn());
const mockWriteLastTask = vi.hoisted(() => vi.fn());

vi.mock("../guards/validation", () => ({
  validateOutputs: mockValidateOutputs,
}));

vi.mock("../goal-state", () => ({
  createGoalState: mockCreateGoalState,
}));

vi.mock("../state-machine", () => ({
  resolveTransition: mockResolveTransition,
  recordTransition: mockRecordTransition,
}));

vi.mock("../queues", async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueTask: mockEnqueueTask,
  writeLastTask: mockWriteLastTask,
}));

// ---------------------------------------------------------------------------
// pio_mark_complete — tool registration and execution flow
// ---------------------------------------------------------------------------

describe("pio_mark_complete", () => {
  let tempDir: string;
  let registeredTool: { name: string; label: string; execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();

    // Clear mock call history and reset return values
    mockValidateOutputs.mockClear().mockReturnValue({ passed: true, missing: [] });
    mockCreateGoalState.mockClear().mockReturnValue({
      goalName: "test-goal",
      steps: vi.fn().mockReturnValue([]),
      currentStepNumber: vi.fn().mockReturnValue(1),
    });
    mockResolveTransition.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockWriteLastTask.mockClear();

    registeredTool = undefined;

    // Import and set up
    const mod = await import("./session-capability");

    const mockPi = {
      registerTool: (tool: { name: string; label: string; execute: Function }) => {
        registeredTool = tool;
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };

    mod.setupCapability(mockPi as any);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("registers as pio_mark_complete via setupCapability", () => {
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

    expect(mockResolveTransition).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
  });

  it("postValidate success triggers transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockResolveTransition.mockReturnValue(
      { capability: "review-task", params: { goalName: "test-goal", stepNumber: 1 } }
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

    expect(mockResolveTransition).toHaveBeenCalled();
    expect(mockEnqueueTask).toHaveBeenCalled();
    expect(mockRecordTransition).toHaveBeenCalled();
    expect(mockWriteLastTask).toHaveBeenCalled();
    expect(result.terminate).toBe(true);
  });

  it("postExecute runs after transition routing", async () => {
    mockValidateOutputs.mockReturnValue({ passed: true, missing: [] });
    mockResolveTransition.mockReturnValue(
      { capability: "review-task", params: { goalName: "test-goal", stepNumber: 1 } }
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
    mockResolveTransition.mockReturnValue(
      { capability: "review-task", params: { goalName: "test-goal", stepNumber: 1 } }
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
    mockResolveTransition.mockReturnValue(
      { capability: "review-task", params: { goalName: "test-goal", stepNumber: 1 } }
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
});

// ---------------------------------------------------------------------------
// pio_mark_complete — review-task specific behavior
// ---------------------------------------------------------------------------

describe("pio_mark_complete for review-task", () => {
  let tempCwd: string;
  let goalDir: string;
  let stepDir: string;
  let registeredTool: { name: string; label: string; execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempCwd = createTempDir();

    // Set up goal workspace structure
    goalDir = path.join(tempCwd, ".pio", "goals", "test-goal");
    stepDir = path.join(goalDir, "S01");
    fs.mkdirSync(stepDir, { recursive: true });

    // Create required goal files
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Test Goal", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n\n## Step 1: Test", "utf-8");

    // Create queue directory
    fs.mkdirSync(path.join(tempCwd, ".pio", "session-queue"), { recursive: true });

    // Clear mock call history
    mockValidateOutputs.mockClear().mockReturnValue({ passed: true, missing: [] });
    mockResolveTransition.mockClear();
    mockRecordTransition.mockClear();
    mockEnqueueTask.mockClear();
    mockWriteLastTask.mockClear();

    registeredTool = undefined;

    // Import and set up
    const mod = await import("./session-capability");

    const mockPi = {
      registerTool: (tool: { name: string; label: string; execute: Function }) => {
        registeredTool = tool;
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };

    mod.setupCapability(mockPi as any);
  });

  afterEach(() => {
    cleanup(tempCwd);
  });

  it("valid APPROVED frontmatter creates APPROVED marker and enqueues evolve-plan", async () => {
    // Simulate a successful postValidate that creates markers
    const postValidateMock = vi.fn().mockImplementation(() => {
      fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
      return { success: true };
    });

    mockResolveTransition.mockReturnValue(
      { capability: "evolve-plan", params: { goalName: "test-goal", stepNumber: 2 } }
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "review-task",
              workingDir: goalDir,
              validation: { files: ["S01/REVIEW.md"] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(postValidateMock).toHaveBeenCalledWith(goalDir, { goalName: "test-goal", stepNumber: 1 });
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      expect.any(String),
      "test-goal",
      expect.objectContaining({ capability: "evolve-plan" }),
    );
    expect(result.terminate).toBe(true);
  });

  it("valid REJECTED frontmatter creates REJECTED marker and deletes COMPLETED", async () => {
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    const postValidateMock = vi.fn().mockImplementation(() => {
      fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
      fs.rmSync(path.join(stepDir, "COMPLETED"), { force: true });
      return { success: true };
    });

    mockResolveTransition.mockReturnValue(
      { capability: "execute-task", params: { goalName: "test-goal", stepNumber: 1 } }
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "review-task",
              workingDir: goalDir,
              validation: { files: ["S01/REVIEW.md"] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      expect.any(String),
      "test-goal",
      expect.objectContaining({ capability: "execute-task" }),
    );
    expect(result.terminate).toBe(true);
  });

  it("invalid frontmatter returns error, no markers created", async () => {
    const postValidateMock = vi.fn().mockReturnValue({
      success: false,
      message: "Field 'decision': value must be equal to: APPROVED, REJECTED",
    });

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "review-task",
              workingDir: goalDir,
              validation: { files: ["S01/REVIEW.md"] },
              postValidate: postValidateMock,
              sessionParams: { goalName: "test-goal", stepNumber: 1 },
            },
          },
        ],
      },
    };

    const result = await registeredTool!.execute("test-id", {}, new AbortController(), () => {}, mockCtx);

    expect(result.content[0].text).toContain("decision");
    expect(result.terminate).toBeFalsy();
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
    expect(mockResolveTransition).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { resolveCapabilityConfig } from "../../capability-config";
import { stepFolderName } from "../../fs-utils";
import { readPendingTask } from "../../queues";
import config, { register } from "./config";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (unified across merged sources)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-execute-task-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Unified helper supporting both patterns:
// - Multi-step with files array (from step-discovery tests)
// - Single step with optional rejected flag (from execute-task-initial-message tests)
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: {
    steps?: { number: number; files: string[] }[];
    stepNumber?: number;
    rejected?: boolean;
  },
): { goalDir: string; stepDir: string } {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  let stepDir = "";

  // Multi-step mode (from step-discovery tests)
  if (options?.steps) {
    for (const step of options.steps) {
      const folderName = stepFolderName(step.number);
      const currentStepDir = path.join(goalDir, folderName);
      fs.mkdirSync(currentStepDir, { recursive: true });
      for (const file of step.files) {
        fs.writeFileSync(
          path.join(currentStepDir, file),
          `content of ${file}`,
          "utf-8",
        );
      }
    }
  }

  // Single-step mode (from execute-task-initial-message tests)
  if (options?.stepNumber != null) {
    const folderName = stepFolderName(options.stepNumber);
    stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });

    if (options.rejected) {
      fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
    }
  }

  // Write PLAN.md with steps array so GoalState.steps() can derive from frontmatter
  const totalSteps = options?.steps
    ? Math.max(...options.steps.map((s) => s.number))
    : (options?.stepNumber ?? 1);
  const stepsYaml = Array.from(
    { length: totalSteps },
    (_, i) => `  - name: step-${i + 1}\n    complexity: task`,
  ).join("\n");
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan`,
    "utf-8",
  );

  return { goalDir, stepDir };
}

// ---------------------------------------------------------------------------
// stepFolderName — zero-padding verification (in execute-task context)
// ---------------------------------------------------------------------------

describe("stepFolderName", () => {
  it("zero-pads single digits S01–S09", () => {
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(5)).toBe("S05");
    expect(stepFolderName(9)).toBe("S09");
  });

  it("no extra padding for two-digit numbers S10+", () => {
    expect(stepFolderName(10)).toBe("S10");
    expect(stepFolderName(25)).toBe("S25");
  });
});

// ---------------------------------------------------------------------------
// resolveExecuteReadOnlyFiles — TASK.md only
// ---------------------------------------------------------------------------

describe("resolveExecuteReadOnlyFiles", () => {
  it("returns TASK.md only, not TEST.md", async () => {
    // Arrange: resolve execute-task config
    const params = {
      capability: "execute-task" as string,
      goalName: "test-goal",
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: read-only files contain only TASK.md (plain name — workspacePrefix handles step folder)
    expect(result?.readOnlyFiles).toEqual(["TASK.md"]);
    expect(result?.readOnlyFiles).not.toContain("TEST.md");
  });
});

// ---------------------------------------------------------------------------
// execute-task defaultInitialMessage — behavioral tests
// ---------------------------------------------------------------------------

describe("execute-task defaultInitialMessage", () => {
  it("returns static guidance string", () => {
    const message = config.defaultInitialMessage();

    expect(message).toBe("Read TASK.md and resolve the task.");
  });

  it("references TASK.md as the task specification", () => {
    const message = config.defaultInitialMessage();

    expect(message).toContain("TASK.md");
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_execute_task
// ---------------------------------------------------------------------------

describe("executeTaskTool.execute", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function getTool() {
    const registeredTools: Array<any> = [];
    const mockPi = {
      registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      registerCommand: vi.fn(),
    };
    register(mockPi as any);
    return registeredTools[0];
  }

  function makeCtx(cwd: string) {
    return {
      cwd,
      ui: { notify: vi.fn() },
      hasUI: false,
      sessionManager: {
        getSessionFile: vi.fn(() => ""),
        getEntries: vi.fn(() => []),
      },
      modelRegistry: {},
      model: undefined,
      isIdle: vi.fn(() => true),
      signal: undefined,
      abort: vi.fn(),
      hasPendingMessages: vi.fn(() => false),
      shutdown: vi.fn(),
      getContextUsage: vi.fn(),
      compact: vi.fn(),
      getSystemPrompt: vi.fn(() => ""),
    };
  }

  it("enqueues task even when TASK.md is missing (validation moves to launch time)", async () => {
    // Arrange: goal dir exists but no TASK.md
    const { goalDir } = createGoalTree(tempDir, "no-task", {
      stepNumber: 1,
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    // Don't create TASK.md

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-task/S01" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Tool enqueues successfully — validation happens at /pio-next-task launch time
    expect(result.content[0].text).toContain("Task queued");
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, initialMessage)", async () => {
    // Arrange: goal dir with TASK.md in S01
    const { goalDir, stepDir } = createGoalTree(tempDir, "my-feature", {
      stepNumber: 1,
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );

    const tool = getTool();
    await tool.execute(
      "test-id",
      {
        workspacePrefix: "goals/my-feature/S01",
        initialMessage: "test message",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "S01");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("execute-task");
    expect(task?.params).toHaveProperty(
      "workspacePrefix",
      "goals/my-feature/S01",
    );
    expect(task?.params).toHaveProperty("sessionName");
    expect(task?.params?.sessionName).toContain("execute-task");
    expect(task?.params).toHaveProperty("queueKey", "S01");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
  });
});

// ---------------------------------------------------------------------------
// execute-task declarative markers
// ---------------------------------------------------------------------------

describe("execute-task declarative markers", () => {
  it("config has no postExecute callback (markers via contract.markers)", () => {
    expect((config as Record<string, unknown>).postExecute).toBeUndefined();
  });

  it("contract has markers declaration with correct values", () => {
    expect(config.contract.markers).toBeDefined();
    expect(config.contract.markers).toHaveLength(1);
    const marker = config.contract.markers![0];
    expect(marker.outputFile).toBe("summary");
    expect(marker.field).toBe("status");
    expect(marker.values).toEqual({
      completed: "COMPLETED",
      blocked: "BLOCKED",
    });
  });
});

// ---------------------------------------------------------------------------
// E2E: mark-complete creates marker file via declarative markers
// ---------------------------------------------------------------------------

describe("e2e: mark-complete with declarative markers", () => {
  let tempDir: string;
  let goalDir: string;
  let registeredTool: any;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    goalDir = path.join(tempDir, ".pio", "goals", "test-goal", "S01");
    fs.mkdirSync(goalDir, { recursive: true });

    // Mock the dependencies
    const mockValidateOutputs = vi.fn().mockReturnValue({ success: true });
    const mockDispatch = vi.fn().mockReturnValue([]);
    const mockGetMachine = vi.fn();
    const mockRecordTransition = vi.fn();
    const mockEnqueueTask = vi.fn();

    vi.doMock("../../guards/validation", () => ({
      validateOutputs: mockValidateOutputs,
    }));
    vi.doMock("../../state-machines", () => ({
      dispatch: mockDispatch,
      getMachine: mockGetMachine,
      goalDrivenDevelopment: {},
      recordTransition: mockRecordTransition,
    }));
    vi.doMock("../../queues", async (importOriginal: Function) => ({
      ...(await importOriginal()),
      enqueueTask: mockEnqueueTask,
    }));

    const mockResolveCapabilityConfig = vi
      .fn()
      .mockImplementation((_cwd: string, params: Record<string, unknown>) => {
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
          capability: params?.capability ?? "execute-task",
          workspaceDir: workspaceDir ?? goalDir,
          sessionParams,
          contract: contract ?? config.contract,
          prepareSession,
          postValidate,
          postExecute,
          fileCleanup,
        };
      });

    vi.doMock("../../capability-config", () => ({
      resolveCapabilityConfig: mockResolveCapabilityConfig,
      resolveContractPath: vi
        .fn()
        .mockImplementation((contractPath: string, baseDir: string) => {
          return path.join(baseDir, contractPath);
        }),
    }));

    registeredTool = undefined;

    const mod = await import("../../guards/mark-complete");

    const mockPi = {
      registerTool: (tool: { name: string; execute: Function }) => {
        registeredTool = tool;
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };

    mod.setupMarkComplete(mockPi as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup(tempDir);
  });

  it("creates COMPLETED marker via declarative markers (execute-task)", async () => {
    // Arrange: SUMMARY.md with status: completed
    fs.writeFileSync(
      path.join(goalDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workspaceDir: goalDir,
              contract: config.contract,
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "S01",
              },
            },
          },
        ],
      },
    };

    // Act
    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: validation passed, COMPLETED marker created
    expect(result.terminate).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "BLOCKED"))).toBe(false);
  });

  it("creates BLOCKED marker via declarative markers (execute-task)", async () => {
    // Arrange: SUMMARY.md with status: blocked
    fs.writeFileSync(
      path.join(goalDir, "SUMMARY.md"),
      "---\nstatus: blocked\n---\n# Summary\nBlocked.",
      "utf-8",
    );

    const mockCtx = {
      sessionManager: {
        getEntries: () => [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              workspaceDir: goalDir,
              contract: config.contract,
              sessionParams: {
                goalName: "test-goal",
                stepNumber: 1,
                queueKey: "S01",
              },
            },
          },
        ],
      },
    };

    // Act
    const result = await registeredTool?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: validation passed, BLOCKED marker created
    expect(result.terminate).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "COMPLETED"))).toBe(false);
  });
});

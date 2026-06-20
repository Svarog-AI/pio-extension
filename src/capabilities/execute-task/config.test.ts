import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { validateExecuteStep } from "./callbacks";
import config, { register } from "./config";
import { stepFolderName } from "../../fs-utils";
import { resolveCapabilityConfig } from "../../capability-config";
import { readPendingTask } from "../../queues";

// ---------------------------------------------------------------------------
// Local test helper (moved from callbacks.ts — not used by production code)
// ---------------------------------------------------------------------------

function isStepReady(goalDir: string, stepNumber: number): boolean {
  const folder = stepFolderName(stepNumber);
  const stepDir = path.join(goalDir, folder);
  if (!fs.existsSync(path.join(stepDir, "TASK.md"))) return false;
  if (fs.existsSync(path.join(stepDir, "COMPLETED"))) return false;
  if (fs.existsSync(path.join(stepDir, "BLOCKED"))) return false;
  return true;
}

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
  options?: { steps?: { number: number; files: string[] }[]; stepNumber?: number; rejected?: boolean },
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
        fs.writeFileSync(path.join(currentStepDir, file), `content of ${file}`, "utf-8");
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
    : options?.stepNumber ?? 1;
  const stepsYaml = Array.from({ length: totalSteps }, (_, i) =>
    `  - name: step-${i + 1}\n    complexity: task`,
  ).join("\n");
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan`,
    "utf-8",
  );

  return { goalDir, stepDir };
}

// ---------------------------------------------------------------------------
// isStepReady — execution-readiness gate
// ---------------------------------------------------------------------------

describe("isStepReady(goalDir, stepNumber)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("TASK.md + TEST.md present, no markers → true", () => {
    // Arrange: S01 with both spec files, no COMPLETED or BLOCKED
    const { goalDir } = createGoalTree(tempDir, "ready-goal", {
      steps: [{ number: 1, files: ["TASK.md", "TEST.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(true);
  });

  it("missing TASK.md → false", () => {
    // Arrange: S01 with only TEST.md
    const { goalDir } = createGoalTree(tempDir, "no-task-goal", {
      steps: [{ number: 1, files: ["TEST.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("TASK.md only → true (no TEST.md required)", () => {
    // Arrange: S01 with only TASK.md
    const { goalDir } = createGoalTree(tempDir, "task-only-goal", {
      steps: [{ number: 1, files: ["TASK.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert: TASK.md alone is sufficient for readiness
    expect(result).toBe(true);
  });

  it("both specs + COMPLETED marker → false", () => {
    // Arrange: S01 with both spec files and COMPLETED marker
    const { goalDir } = createGoalTree(tempDir, "completed-goal", {
      steps: [{ number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("both specs + BLOCKED marker → false", () => {
    // Arrange: S01 with both spec files and BLOCKED marker
    const { goalDir } = createGoalTree(tempDir, "blocked-goal", {
      steps: [{ number: 1, files: ["TASK.md", "TEST.md", "BLOCKED"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("step folder does not exist → false", () => {
    // Arrange: goal dir exists but no S01/ subdirectory
    const { goalDir } = createGoalTree(tempDir, "empty-goal");

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });
});

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
    // Arrange: resolve execute-task config with stepNumber 1
    const params = { capability: "execute-task" as string, goalName: "test-goal", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: read-only files contain only TASK.md
    expect(result?.readOnlyFiles).toEqual(["S01/TASK.md"]);
    expect(result?.readOnlyFiles).not.toContain("S01/TEST.md");
  });
});

// ---------------------------------------------------------------------------
// execute-task defaultInitialMessage — behavioral tests
// ---------------------------------------------------------------------------

describe("execute-task defaultInitialMessage", () => {
  it("includes working directory in the message", () => {
    const message = config.defaultInitialMessage("/my/goal/dir", { stepNumber: 1 });

    expect(message).toContain("/my/goal/dir");
  });

  it("includes step number and folder reference", () => {
    const message = config.defaultInitialMessage("/dir", { stepNumber: 5 });

    expect(message).toContain("Step 5");
    expect(message).toContain("S05");
  });

  it("references TASK.md as the task specification", () => {
    const message = config.defaultInitialMessage("/dir", { stepNumber: 1 });

    expect(message).toContain("TASK.md");
  });

  it("returns error message when stepNumber is missing", () => {
    const message = config.defaultInitialMessage("/dir", {});

    expect(message.toLowerCase()).toContain("error");
    expect(message.toLowerCase()).toContain("stepnumber");
  });

  it("references REVIEW.md when step was previously rejected", () => {
    // Arrange: create a temp dir with REJECTED marker
    const tempDir = createTempDir();
    try {
      const { goalDir } = createGoalTree(tempDir, "rejected-goal", { stepNumber: 2, rejected: true });

      // Act
      const message = config.defaultInitialMessage(goalDir, { stepNumber: 2 });

      // Assert: message references REVIEW.md for re-execution context
      expect(message).toContain("REVIEW.md");
      expect(message).toContain("previously rejected");
    } finally {
      cleanup(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// validateExecuteStep — directory resolution
// ---------------------------------------------------------------------------

describe("validateExecuteStep", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves goal directory and returns ready with stepNumber", async () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    const result = await validateExecuteStep("my-goal", tempDir, 3);

    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.goalDir).toBe(goalDir);
      expect(result.stepNumber).toBe(3);
    }
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
      sessionManager: { getSessionFile: vi.fn(() => ""), getEntries: vi.fn(() => []) },
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

  it("returns error when TASK.md is missing", async () => {
    // Arrange: goal dir exists with GOAL.md but no TASK.md in S01
    const { goalDir, stepDir } = createGoalTree(tempDir, "no-task", { stepNumber: 1 });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    // Don't create TASK.md

    const tool = getTool();
    const result = await tool.execute("test-id", { name: "no-task", stepNumber: 1 }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/TASK/i);
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, stepNumber, initialMessage)", async () => {
    // Arrange: goal dir with TASK.md in S01
    const { goalDir, stepDir } = createGoalTree(tempDir, "my-feature", { stepNumber: 1 });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task", "utf-8");

    const tool = getTool();
    await tool.execute("test-id", { name: "my-feature", stepNumber: 1 }, undefined, undefined, makeCtx(tempDir));

    const task = readPendingTask(tempDir, "my-feature");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("execute-task");
    expect(task!.params).toHaveProperty("goalName", "my-feature");
    expect(task!.params).toHaveProperty("workspacePrefix", "goals/my-feature");
    expect(task!.params).toHaveProperty("sessionName");
    expect(task!.params!.sessionName).toContain("execute-task");
    expect(task!.params).toHaveProperty("queueKey", "my-feature");
    expect(task!.params).toHaveProperty("stepNumber");
    expect(task!.params).toHaveProperty("initialMessage");
  });
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateAndFindNextStep, validateExplicitStep } from "./callbacks";
import config from "./config";
import { stepFolderName } from "../../fs-utils";
import { resolveCapabilityConfig } from "../../capability-config";
import { createGoalState } from "../../goal-state";

// ---------------------------------------------------------------------------
// Local test helper (moved from callbacks.ts — not used by production code)
// ---------------------------------------------------------------------------

function isStepReady(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;
  return step.status() === "defined";
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
    const params = { capability: "execute-task" as string, goalName: "test-goal", stepNumber: 1 };

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
// validateAndFindNextStep — pre-launch validation
// ---------------------------------------------------------------------------

describe("validateAndFindNextStep — pre-launch validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: true when GOAL.md, PLAN.md, and S01/TASK.md exist", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md, and S01/TASK.md
    const { goalDir } = createGoalTree(tempDir, "ready-goal", {
      steps: [{ number: 1, files: ["TASK.md"] }],
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");

    // Act
    const result = await validateAndFindNextStep("ready-goal", tempDir);

    // Assert
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(1);
    }
  });

  it("returns error when GOAL.md is missing", async () => {
    // Arrange: goal dir with PLAN.md (with frontmatter) but no GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      `---
totalSteps: 1
steps:
  - name: step-one
---
# Plan
`,
      "utf-8",
    );
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "TASK.md"), "# Task\n", "utf-8");

    // Act
    const result = await validateAndFindNextStep("no-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/GOAL\.md/i);
    }
  });

  it("returns error when PLAN.md is missing", async () => {
    // Arrange: goal dir with GOAL.md but no PLAN.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-plan");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");

    // Act
    const result = await validateAndFindNextStep("no-plan", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/PLAN\.md/i);
    }
  });

  it("returns error when goal workspace does not exist", async () => {
    // Act
    const result = await validateAndFindNextStep("nonexistent", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/does not exist/i);
    }
  });

  it("returns error when REVISE_PLAN_NEEDED marker exists", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md (with frontmatter), S01/TASK.md, and S01/REVISE_PLAN_NEEDED
    const goalDir = path.join(tempDir, ".pio", "goals", "revision-needed");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 1\nsteps:\n  - name: step-1\n    complexity: task\n---\n# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(s01Dir, "REVISE_PLAN_NEEDED"), "", "utf-8");

    // Act
    const result = await validateAndFindNextStep("revision-needed", tempDir);

    // Assert: ready is false, error mentions REVISE_PLAN_NEEDED
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/REVISE_PLAN_NEEDED|must not exist/i);
    }
  });
});

// ---------------------------------------------------------------------------
// validateExplicitStep — pre-launch validation
// ---------------------------------------------------------------------------

describe("validateExplicitStep — pre-launch validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: true when GOAL.md, PLAN.md, and S01/TASK.md exist", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md (with frontmatter), and S01/TASK.md
    const goalDir = path.join(tempDir, ".pio", "goals", "ready-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 1\nsteps:\n  - name: step-1\n    complexity: task\n---\n# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "TASK.md"), "# Task\n", "utf-8");

    // Act
    const result = await validateExplicitStep("ready-goal", tempDir, 1);

    // Assert
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(1);
    }
  });

  it("returns error when S01/TASK.md is missing", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md, but no S01/TASK.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-task");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });

    // Act
    const result = await validateExplicitStep("no-task", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/TASK\.md/i);
    }
  });

  it("returns error when REVISE_PLAN_NEEDED marker exists", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md, S01/TASK.md, and S01/REVISE_PLAN_NEEDED
    const goalDir = path.join(tempDir, ".pio", "goals", "revision-needed");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(s01Dir, "REVISE_PLAN_NEEDED"), "", "utf-8");

    // Act
    const result = await validateExplicitStep("revision-needed", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/REVISE_PLAN_NEEDED|must not exist/i);
    }
  });

  it("returns error when step is already implemented", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md (with frontmatter), S01/TASK.md, and S01/COMPLETED
    const goalDir = path.join(tempDir, ".pio", "goals", "already-done");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 1\nsteps:\n  - name: step-1\n    complexity: task\n---\n# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");

    // Act
    const result = await validateExplicitStep("already-done", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/already|COMPLETED/i);
    }
  });
});

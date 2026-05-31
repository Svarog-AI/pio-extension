import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isStepReady } from "./callbacks";
import { CAPABILITY_CONFIG } from "./config";
import { stepFolderName } from "../../fs-utils";
import { resolveCapabilityConfig } from "../../capability-config";

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
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/my/goal/dir", { stepNumber: 1 });

    expect(message).toContain("/my/goal/dir");
  });

  it("includes step number and folder reference", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/dir", { stepNumber: 5 });

    expect(message).toContain("Step 5");
    expect(message).toContain("S05");
  });

  it("references TASK.md as the task specification", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/dir", { stepNumber: 1 });

    expect(message).toContain("TASK.md");
  });

  it("returns error message when stepNumber is missing", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/dir", {});

    expect(message.toLowerCase()).toContain("error");
    expect(message.toLowerCase()).toContain("stepnumber");
  });

  it("references REVIEW.md when step was previously rejected", () => {
    // Arrange: create a temp dir with REJECTED marker
    const tempDir = createTempDir();
    try {
      const { goalDir } = createGoalTree(tempDir, "rejected-goal", { stepNumber: 2, rejected: true });

      // Act
      const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 2 });

      // Assert: message references REVIEW.md for re-execution context
      expect(message).toContain("REVIEW.md");
      expect(message).toContain("previously rejected");
    } finally {
      cleanup(tempDir);
    }
  });
});

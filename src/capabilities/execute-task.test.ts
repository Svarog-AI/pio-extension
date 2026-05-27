import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isStepReady } from "./execute-task";
import { CAPABILITY_CONFIG } from "./execute-task";
import { stepFolderName } from "../fs-utils";
import { resolveCapabilityConfig } from "../capability-config";

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
// isStepReady — TASK.md-only readiness (TASK.md-only is sufficient)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// execute-task.md prompt content — iterative TDD restructuring
// ---------------------------------------------------------------------------

const EXECUTE_TASK_PROMPT = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), "../prompts/execute-task.md"),
  "utf-8",
);

describe("execute-task.md prompt — iterative TDD restructuring", () => {
  it("does not contain Step 4 about creating TEST.md upfront", () => {
    expect(EXECUTE_TASK_PROMPT).not.toContain("### Step 4: Create TEST.md");
  });

  it("does not contain the Given/when/then planning format as a pre-implementation requirement", () => {
    // The old Step 4 described the format with "Given ____ when ____ then ____" as a planning instruction before implementation
    // The new prompt uses the pattern only for post-hoc TEST.md ("Given ____ when ____ then ____" in the TEST.md format section is OK)
    // But it should NOT appear in a Step 4 heading about creating TEST.md upfront
    expect(EXECUTE_TASK_PROMPT).not.toContain("### Step 4: Create TEST.md");
    // The old format had "Do not deviate from this pattern" as a planning rule
    expect(EXECUTE_TASK_PROMPT).not.toContain("Do not deviate from this pattern");
  });

  it("references the tdd skill for TDD methodology", () => {
    expect(EXECUTE_TASK_PROMPT).toMatch(/follow.*[`"']?tdd[`"']?\s*skill/i);
  });

  it("instructs generating TEST.md after all tests pass as a post-hoc summary", () => {
    expect(EXECUTE_TASK_PROMPT).toMatch(/TEST\.md.*after.*test/i);
    expect(EXECUTE_TASK_PROMPT).toMatch(/post.?hoc|summary.*record|record.*what.*was.*tested/i);
  });

  it("does not contain tracer bullet mechanics in the prompt", () => {
    // HOW details like tracer bullet rules belong in the tdd skill, not the prompt
    // The prompt should reference the skill but not restate its mechanics
    expect(EXECUTE_TASK_PROMPT).not.toMatch(/tracer.?bullet.*\(.*→/i);
    expect(EXECUTE_TASK_PROMPT).not.toMatch(/RED.*→.*GREEN.*→.*refactor/i);
  });

  it("does not contain incremental loop rules in the prompt", () => {
    // Rules like "One test at a time" belong in the tdd skill
    expect(EXECUTE_TASK_PROMPT).not.toMatch(/one test at a time|don't anticipate future tests/i);
  });

  it("has sequential step numbering with no gaps", () => {
    const stepHeadings = EXECUTE_TASK_PROMPT.match(/### Step \d+:/g) || [];
    const stepNumbers = stepHeadings.map(h => parseInt(h.match(/\d+/)![0], 10));
    for (let i = 1; i < stepNumbers.length; i++) {
      expect(stepNumbers[i]).toBe(stepNumbers[i - 1] + 1);
    }
    expect(stepNumbers.length).toBeGreaterThan(0);
  });

  it("does not contain the old Test-first discipline guideline", () => {
    expect(EXECUTE_TASK_PROMPT).not.toContain("Test-first discipline. Write tests before feature code.");
  });
});

// ---------------------------------------------------------------------------
// execute-task.ts defaultInitialMessage — simplified task directive
// ---------------------------------------------------------------------------

describe("execute-task defaultInitialMessage", () => {
  it("returns a simple task directive without methodology instructions", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/some/goal/dir", { stepNumber: 1 });

    expect(message).toContain("TASK.md");
    expect(message).not.toContain("create TEST.md");
    expect(message).not.toContain("write tests first");
    expect(message).not.toMatch(/write tests.*then implement/i);
  });

  it("includes the step number and folder name", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/some/goal/dir", { stepNumber: 3 });

    expect(message).toContain("Step 3");
    expect(message).toContain("S03");
  });

  it("includes the working directory", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/my/goal/workspace", { stepNumber: 1 });

    expect(message).toContain("/my/goal/workspace");
  });

  it("returns error message when stepNumber is missing", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/some/goal/dir", {});

    expect(message).toContain("Error");
    expect(message).toContain("stepNumber");
  });
});

describe("isStepReady — TASK.md only readiness", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("TASK.md only, no markers → true (step ready with TASK.md alone)", () => {
    // Arrange: S01 with only TASK.md, no TEST.md
    const { goalDir } = createGoalTree(tempDir, "task-only-ready", {
      steps: [{ number: 1, files: ["TASK.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert: TASK.md alone is sufficient
    expect(result).toBe(true);
  });

  it("only TEST.md, no TASK.md → false", () => {
    // Arrange: S01 with only TEST.md
    const { goalDir } = createGoalTree(tempDir, "test-only-not-ready", {
      steps: [{ number: 1, files: ["TEST.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert: TEST.md alone is not sufficient
    expect(result).toBe(false);
  });
});

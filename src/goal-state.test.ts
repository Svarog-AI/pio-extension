import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createGoalState } from "./goal-state";
import { stepFolderName } from "./fs-utils";
import type { PlanFrontmatter, StepMetadata } from "./capabilities/create-plan/schemas";
import type { TaskSkills } from "./capabilities/evolve-plan/schemas";
import type { ReviewOutputs } from "./capabilities/review-task/schemas";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (mirrors fs-utils.test.ts pattern)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-goalstate-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a goal directory tree under a temp directory.
 * Optionally creates step folders with specified files inside them.
 * Returns the path to the goal directory.
 */
function createGoalTree(
  tempDir: string,
  goalName: string,
  steps?: { number: number; files: string[] }[],
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  for (const step of steps ?? []) {
    const folderName = stepFolderName(step.number);
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
    for (const file of step.files) {
      fs.writeFileSync(path.join(stepDir, file), `content of ${file}`, "utf-8");
    }
  }

  return goalDir;
}

/** Write a PLAN.md with YAML frontmatter containing totalSteps and a valid steps array. */
function writePlanWithFrontmatter(goalDir: string, totalSteps: number): void {
  const stepsYaml = Array.from({ length: totalSteps }, (_, i) => `  - name: step-${i + 1}\n    complexity: task`).join("\n");
  const content = `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan: test-goal\n\nSome plan content.`;
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), content, "utf-8");
}

/** Write a PLAN.md with YAML frontmatter containing totalSteps and a custom steps array. */
function writePlanWithStepsFrontmatter(
  goalDir: string,
  totalSteps: number,
  stepsArray: Array<{ name: string; complexity: "task" | "subgoal" }>,
): void {
  const stepsYaml = stepsArray.map((s) => `  - name: ${s.name}\n    complexity: ${s.complexity}`).join("\n");
  const content = `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan: test-goal\n\nSome plan content.`;
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), content, "utf-8");
}

/** Create a queue file for a given goal name. */
function writeQueueFile(tempDir: string, goalName: string, data: unknown): void {
  const queueDir = path.join(tempDir, ".pio", "session-queue");
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(
    path.join(queueDir, `task-${goalName}.json`),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// createGoalState — construction
// ---------------------------------------------------------------------------

describe("createGoalState — construction", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("derives goalName from the basename of a valid goal directory path", () => {
    const goalDir = createGoalTree(tempDir, "my-feature");
    const state = createGoalState(goalDir);

    expect(state.goalName).toBe("my-feature");
  });

  it("extracts only the last segment from a deeply nested path", () => {
    // GoalDir simulating /a/b/c/.pio/goals/deeply-nested-goal/
    const goalDir = path.join(tempDir, "a", "b", "c", ".pio", "goals", "deeply-nested-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    const state = createGoalState(goalDir);

    expect(state.goalName).toBe("deeply-nested-goal");
  });

  it("all methods execute without throwing on an empty goal directory", () => {
    const goalDir = createGoalTree(tempDir, "empty-goal");
    const state = createGoalState(goalDir);

    // Act: call every method; Assert: none throw
    expect(() => state.hasGoal()).not.toThrow();
    expect(() => state.hasPlan()).not.toThrow();
    expect(() => state.totalPlanSteps()).not.toThrow();
    expect(() => state.steps()).not.toThrow();
    expect(() => state.currentStepNumber()).not.toThrow();
    expect(() => state.pendingTask()).not.toThrow();
    expect(() => state.lastCompleted()).not.toThrow();
    expect(() => state.getReviewOutputs(1)).not.toThrow();
    expect(() => state.planMetadata()).not.toThrow();
    expect(() => state.goalCompleted()).not.toThrow();

    // Assert safe defaults
    expect(state.hasGoal()).toBe(false);
    expect(state.hasPlan()).toBe(false);
    expect(state.totalPlanSteps()).toBeUndefined();
    expect(state.steps()).toEqual([]);
    expect(state.currentStepNumber()).toBe(1); // always at least 1
    expect(state.pendingTask()).toBeUndefined();
    expect(state.lastCompleted()).toBeUndefined();
    expect(state.getReviewOutputs(1)).toBeNull(); // no step folder
    expect(state.planMetadata()).toBeNull(); // no PLAN.md
    expect(state.goalCompleted()).toBe(false); // no signals
  });
});

// ---------------------------------------------------------------------------
// hasGoal()
// ---------------------------------------------------------------------------

describe("hasGoal()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true when GOAL.md exists", () => {
    const goalDir = createGoalTree(tempDir, "with-goal");
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");

    const state = createGoalState(goalDir);

    expect(state.hasGoal()).toBe(true);
  });

  it("returns false when GOAL.md does not exist", () => {
    const goalDir = createGoalTree(tempDir, "without-goal");

    const state = createGoalState(goalDir);

    expect(state.hasGoal()).toBe(false);
  });

  it("reflects filesystem changes with no caching", () => {
    const goalDir = createGoalTree(tempDir, "dynamic-goal");
    const state = createGoalState(goalDir);

    // Initially false
    expect(state.hasGoal()).toBe(false);

    // Create GOAL.md
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");

    // Now true — proves no caching
    expect(state.hasGoal()).toBe(true);

    // Remove it
    fs.rmSync(path.join(goalDir, "GOAL.md"));

    // Back to false
    expect(state.hasGoal()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPlan()
// ---------------------------------------------------------------------------

describe("hasPlan()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true when PLAN.md exists", () => {
    const goalDir = createGoalTree(tempDir, "with-plan");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan", "utf-8");

    const state = createGoalState(goalDir);

    expect(state.hasPlan()).toBe(true);
  });

  it("returns false when PLAN.md does not exist", () => {
    const goalDir = createGoalTree(tempDir, "without-plan");

    const state = createGoalState(goalDir);

    expect(state.hasPlan()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// totalPlanSteps()
// ---------------------------------------------------------------------------

describe("totalPlanSteps()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns totalSteps from PLAN.md frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "with-steps");
    writePlanWithFrontmatter(goalDir, 3);

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBe(3);
  });

  it("returns undefined when PLAN.md does not exist", () => {
    const goalDir = createGoalTree(tempDir, "no-plan");

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBeUndefined();
  });

  it("returns undefined for PLAN.md with no frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "plan-no-steps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome content without frontmatter.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBeUndefined();
  });

  it("returns undefined for invalid frontmatter totalSteps", () => {
    const goalDir = createGoalTree(tempDir, "invalid-frontmatter");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 0\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// steps()
// ---------------------------------------------------------------------------

describe("steps()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array when no PLAN.md exists", () => {
    const goalDir = createGoalTree(tempDir, "empty");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const state = createGoalState(goalDir);

    expect(state.steps()).toEqual([]);

    warnSpy.mockRestore();
  });

  it("returns StepStatus for each entry in frontmatter steps array", () => {
    const goalDir = createGoalTree(tempDir, "three-steps", [
      { number: 1, files: [] },
      { number: 2, files: [] },
      { number: 3, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 3);

    const state = createGoalState(goalDir);

    expect(state.steps()).toHaveLength(3);
  });

  it("returns correct stepNumber and folderName for each step", () => {
    const goalDir = createGoalTree(tempDir, "three-steps", [
      { number: 1, files: [] },
      { number: 2, files: [] },
      { number: 3, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 3);

    const state = createGoalState(goalDir);
    const steps = state.steps();

    expect(steps[0].stepNumber).toBe(1);
    expect(steps[0].folderName).toBe("S01");
    expect(steps[1].stepNumber).toBe(2);
    expect(steps[1].folderName).toBe("S02");
    expect(steps[2].stepNumber).toBe(3);
    expect(steps[2].folderName).toBe("S03");
  });

  it("returns steps in frontmatter order (always sequential)", () => {
    const goalDir = createGoalTree(tempDir, "sorted-steps", [
      { number: 3, files: [] },
      { number: 1, files: [] },
      { number: 2, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 3);

    const state = createGoalState(goalDir);
    const steps = state.steps();

    expect(steps.map((s) => s.stepNumber)).toEqual([1, 2, 3]);
  });

  it("returns StepStatus for steps whose folders do not yet exist on disk", () => {
    // Only S01 exists on disk, but frontmatter defines 3 steps
    const goalDir = createGoalTree(tempDir, "partial-steps", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 3);

    const state = createGoalState(goalDir);
    const steps = state.steps();

    expect(steps).toHaveLength(3);
    expect(steps[0].stepNumber).toBe(1);
    expect(steps[1].stepNumber).toBe(2);
    expect(steps[2].stepNumber).toBe(3);
    // S02 and S03 folders don't exist — status should be "pending"
    expect(steps[1].status()).toBe("pending");
    expect(steps[2].status()).toBe("pending");
  });

  it("StepStatus.status() returns 'pending' for an empty step folder", () => {
    const goalDir = createGoalTree(tempDir, "pending-step", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("pending");
  });

  it("StepStatus.status() returns 'defined' when TASK.md exists (no TEST.md required)", () => {
    const goalDir = createGoalTree(tempDir, "defined-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("defined");
  });

  it("StepStatus.status() returns 'defined' when only TASK.md exists (no TEST.md)", () => {
    const goalDir = createGoalTree(tempDir, "defined-step-task-only", [
      { number: 1, files: ["TASK.md"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("defined");
  });

  it("StepStatus.status() returns 'pending' when only TEST.md exists (no TASK.md)", () => {
    const goalDir = createGoalTree(tempDir, "pending-test-only", [
      { number: 1, files: ["TEST.md"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("pending");
  });

  it("StepStatus.status() returns 'implemented' when COMPLETED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "implemented-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("implemented");
  });

  it("StepStatus.status() returns 'approved' when APPROVED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "approved-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("approved");
  });

  it("StepStatus.status() returns 'rejected' when REJECTED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "rejected-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "REJECTED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("rejected");
  });

  it("StepStatus.status() returns 'blocked' when BLOCKED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "blocked-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "BLOCKED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("blocked");
  });

  it("marker precedence: APPROVED > REJECTED > BLOCKED > COMPLETED", () => {
    const goalDir = createGoalTree(tempDir, "multi-markers", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("approved");
  });

  it("StepStatus.hasTask() returns true/false based on TASK.md existence", () => {
    const goalDir = createGoalTree(tempDir, "has-task-test", [
      { number: 1, files: [] }, // no TASK.md
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].hasTask()).toBe(false);

    // Add TASK.md
    fs.writeFileSync(path.join(goalDir, "S01", "TASK.md"), "# Task", "utf-8");

    expect(state.steps()[0].hasTask()).toBe(true);
  });

  it("StepStatus.hasTest() returns true/false based on TEST.md existence", () => {
    const goalDir = createGoalTree(tempDir, "has-test-test", [
      { number: 1, files: [] }, // no TEST.md
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].hasTest()).toBe(false);

    // Add TEST.md
    fs.writeFileSync(path.join(goalDir, "S01", "TEST.md"), "# Tests", "utf-8");

    expect(state.steps()[0].hasTest()).toBe(true);
  });

  it("StepStatus.hasSummary() returns true/false based on SUMMARY.md existence", () => {
    const goalDir = createGoalTree(tempDir, "has-summary-test", [
      { number: 1, files: [] }, // no SUMMARY.md
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].hasSummary()).toBe(false);

    // Add SUMMARY.md
    fs.writeFileSync(path.join(goalDir, "S01", "SUMMARY.md"), "# Summary", "utf-8");

    expect(state.steps()[0].hasSummary()).toBe(true);
  });

  it("ignores non-step folders (e.g. 'docs', 'README')", () => {
    const goalDir = createGoalTree(tempDir, "mixed-folders", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    // Create a non-step folder
    fs.mkdirSync(path.join(goalDir, "docs"), { recursive: true });

    const state = createGoalState(goalDir);

    expect(state.steps()).toHaveLength(1);
    expect(state.steps()[0].folderName).toBe("S01");
  });
});

// ---------------------------------------------------------------------------
// currentStepNumber()
// ---------------------------------------------------------------------------
// Semantics: returns the next step to work on.
// A step is "done" only when it has an APPROVED marker (COMPLETED alone doesn't advance).
// Always returns at least 1 — never undefined.
// Sequential scan: stops at first missing folder (gaps halt scanning).
// ---------------------------------------------------------------------------

describe("currentStepNumber()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns 1 when no step folders exist", () => {
    const goalDir = createGoalTree(tempDir, "empty");

    const state = createGoalState(goalDir);

    expect(state.currentStepNumber()).toBe(1);
  });

  it("returns 1 when S01 has TASK.md + TEST.md but no markers (work here)", () => {
    const goalDir = createGoalTree(tempDir, "defined-not-done", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);

    const state = createGoalState(goalDir);

    // Step 1 has specs but no COMPLETED/APPROVED — current step is still 1
    expect(state.currentStepNumber()).toBe(1);
  });

  it("returns 1 when S01 has COMPLETED but no APPROVED (awaiting review)", () => {
    const goalDir = createGoalTree(tempDir, "completed-no-approve", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);

    const state = createGoalState(goalDir);

    // COMPLETED alone doesn't advance — needs APPROVED to move on
    expect(state.currentStepNumber()).toBe(1);
  });

  it("returns 2 when S01 has APPROVED marker (step approved, move to 2)", () => {
    const goalDir = createGoalTree(tempDir, "one-approved", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
    ]);

    const state = createGoalState(goalDir);

    // APPROVED — step is fully done, current moves to next
    expect(state.currentStepNumber()).toBe(2);
  });

  it("returns N+1 where all steps up to N are approved", () => {
    const goalDir = createGoalTree(tempDir, "two-approved", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
      { number: 2, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.currentStepNumber()).toBe(3);
  });

  it("returns 2 when S01 is approved and S02 has specs but no APPROVED", () => {
    const goalDir = createGoalTree(tempDir, "mixed-progress", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
      { number: 2, files: ["TASK.md", "TEST.md"] }, // not done
    ]);

    const state = createGoalState(goalDir);

    // S01 approved → past it. S02 exists but isn't approved → work here.
    expect(state.currentStepNumber()).toBe(2);
  });

  it("incomplete step (missing TEST.md) does not advance", () => {
    const goalDir = createGoalTree(tempDir, "incomplete", [
      { number: 1, files: ["TASK.md"] }, // missing TEST.md, no APPROVED
    ]);

    const state = createGoalState(goalDir);

    expect(state.currentStepNumber()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pendingTask()
// ---------------------------------------------------------------------------

describe("pendingTask()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns parsed task object when queue file exists", () => {
    const goalDir = createGoalTree(tempDir, "my-goal");
    writeQueueFile(tempDir, "my-goal", {
      capability: "evolve-plan",
      params: { stepNumber: 2 },
    });

    const state = createGoalState(goalDir);
    const result = state.pendingTask();

    expect(result).toBeDefined();
    expect(result?.capability).toBe("evolve-plan");
    expect(result?.params).toEqual({ stepNumber: 2 });
  });

  it("returns undefined when no pending task file exists", () => {
    const goalDir = createGoalTree(tempDir, "no-queue");

    const state = createGoalState(goalDir);

    expect(state.pendingTask()).toBeUndefined();
  });

  it("returns undefined for malformed JSON in queue file", () => {
    const goalDir = createGoalTree(tempDir, "bad-json");
    // Write invalid JSON to the queue file
    const queueDir = path.join(tempDir, ".pio", "session-queue");
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(path.join(queueDir, "task-bad-json.json"), "{invalid json}", "utf-8");

    const state = createGoalState(goalDir);

    expect(() => state.pendingTask()).not.toThrow();
    expect(state.pendingTask()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// lastCompleted()
// ---------------------------------------------------------------------------

describe("lastCompleted()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns parsed task object when LAST_TASK.json exists", () => {
    const goalDir = createGoalTree(tempDir, "with-last-task");
    const lastTaskData = { capability: "review-task", params: { stepNumber: 2 } };
    fs.writeFileSync(
      path.join(goalDir, "LAST_TASK.json"),
      JSON.stringify(lastTaskData, null, 2),
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.lastCompleted();

    expect(result).toEqual(lastTaskData);
  });

  it("returns undefined when LAST_TASK.json does not exist", () => {
    const goalDir = createGoalTree(tempDir, "without-last-task");

    const state = createGoalState(goalDir);

    expect(state.lastCompleted()).toBeUndefined();
  });

  it("returns undefined for malformed JSON in LAST_TASK.json", () => {
    const goalDir = createGoalTree(tempDir, "bad-last-task");
    fs.writeFileSync(path.join(goalDir, "LAST_TASK.json"), "{invalid json}", "utf-8");

    const state = createGoalState(goalDir);

    expect(() => state.lastCompleted()).not.toThrow();
    expect(state.lastCompleted()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Helper: write a REVIEW.md with YAML frontmatter
// ---------------------------------------------------------------------------

function writeReviewMd(
  stepDir: string,
  frontmatter: Record<string, unknown>,
  body?: string,
): void {
  const yamlLines = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const content = `---\n${yamlLines}\n---\n${body ?? "# Review"}`;
  fs.writeFileSync(path.join(stepDir, "REVIEW.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// getReviewOutputs()
// ---------------------------------------------------------------------------

describe("getReviewOutputs()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("given a valid REVIEW.md with APPROVED frontmatter, returns typed ReviewOutputs", () => {
    // Arrange: S01/REVIEW.md with valid APPROVED frontmatter
    const goalDir = createGoalTree(tempDir, "approved-goal", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 1,
      lowIssues: 2,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1) as ReviewOutputs | null;

    // Assert
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("APPROVED");
    expect(result!.criticalIssues).toBe(0);
    expect(result!.highIssues).toBe(0);
    expect(result!.mediumIssues).toBe(1);
    expect(result!.lowIssues).toBe(2);
  });

  it("given a REJECTED decision, returns correct type", () => {
    // Arrange: S02/REVIEW.md with REJECTED decision and non-zero counts
    const goalDir = createGoalTree(tempDir, "rejected-goal", [
      { number: 2, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S02");
    writeReviewMd(stepDir, {
      decision: "REJECTED",
      criticalIssues: 2,
      highIssues: 3,
      mediumIssues: 5,
      lowIssues: 10,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(2) as ReviewOutputs | null;

    // Assert
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("REJECTED");
    expect(result!.criticalIssues).toBe(2);
    expect(result!.highIssues).toBe(3);
    expect(result!.mediumIssues).toBe(5);
    expect(result!.lowIssues).toBe(10);
  });

  it("returns null when step folder missing", () => {
    // Arrange: goal directory exists but no S03/ folder
    const goalDir = createGoalTree(tempDir, "missing-step");

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(3);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when REVIEW.md missing", () => {
    // Arrange: S01/ with TASK.md and TEST.md but no REVIEW.md
    const goalDir = createGoalTree(tempDir, "no-review", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when REVIEW.md has no frontmatter", () => {
    // Arrange: S01/REVIEW.md with markdown content only (no --- delimiters)
    const goalDir = createGoalTree(tempDir, "no-frontmatter", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review\n\nSome review content.", "utf-8");

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for malformed YAML", () => {
    // Arrange: S01/REVIEW.md with invalid YAML between delimiters
    const goalDir = createGoalTree(tempDir, "malformed-yaml", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "---\ninvalid: yaml: [:\n---\n# body",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for invalid decision value", () => {
    // Arrange: frontmatter with decision: MAYBE (not APPROVED or REJECTED)
    const goalDir = createGoalTree(tempDir, "invalid-decision", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "MAYBE",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert — validation failure returns null
    expect(result).toBeNull();
  });

  it("returns null for negative issue counts", () => {
    // Arrange: frontmatter with criticalIssues: -5
    const goalDir = createGoalTree(tempDir, "negative-counts", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: -5,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert — validation failure returns null
    expect(result).toBeNull();
  });

  it("returns null for missing required fields", () => {
    // Arrange: frontmatter with only decision (missing count fields)
    const goalDir = createGoalTree(tempDir, "missing-fields", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert — validation failure returns null
    expect(result).toBeNull();
  });

  it("step number zero-padded correctly (step 5 → S05)", () => {
    // Arrange: S05/REVIEW.md with valid frontmatter
    const goalDir = createGoalTree(tempDir, "zero-padded", [
      { number: 5, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S05");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(5) as ReviewOutputs | null;

    // Assert — proves path resolution uses zero-padding
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// getReviewOutputs with { errors: true }
// ---------------------------------------------------------------------------

describe("getReviewOutputs with { errors: true }", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns { data } for valid APPROVED frontmatter", () => {
    // Arrange: S01/REVIEW.md with valid APPROVED frontmatter
    const goalDir = createGoalTree(tempDir, "errors-approved", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1, { errors: true }) as { data?: ReviewOutputs; error?: string };

    // Assert: has data, no error
    expect(result.data).toBeDefined();
    expect(result.data!.decision).toBe("APPROVED");
    expect(result.error).toBeUndefined();
  });

  it("returns { error } for missing file", () => {
    // Arrange: empty S02/ folder (no REVIEW.md)
    const goalDir = createGoalTree(tempDir, "errors-missing", [
      { number: 2, files: [] },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(2, { errors: true }) as { data?: ReviewOutputs; error?: string };

    // Assert: has error, no data
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.data).toBeUndefined();
  });

  it("returns { error } for no frontmatter delimiters", () => {
    // Arrange: S03/REVIEW.md as plain text with no YAML frontmatter
    const goalDir = createGoalTree(tempDir, "errors-no-delimiters", [
      { number: 3, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S03");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review\n\nSome review content.", "utf-8");

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(3, { errors: true }) as { data?: ReviewOutputs; error?: string };

    // Assert: has error, no data
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.data).toBeUndefined();
  });

  it("returns { error } with typebox details for invalid decision", () => {
    // Arrange: REVIEW.md with decision: UNKNOWN and valid counts
    const goalDir = createGoalTree(tempDir, "errors-invalid-decision", [
      { number: 4, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S04");
    writeReviewMd(stepDir, {
      decision: "UNKNOWN",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(4, { errors: true }) as { data?: ReviewOutputs; error?: string };

    // Assert: error mentions "decision"
    expect(result.error).toBeDefined();
    expect(result.error).toContain("decision");
    expect(result.data).toBeUndefined();
  });

  it("returns { error } for negative count", () => {
    // Arrange: REVIEW.md with criticalIssues: -1
    const goalDir = createGoalTree(tempDir, "errors-negative-count", [
      { number: 5, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S05");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: -1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(5, { errors: true }) as { data?: ReviewOutputs; error?: string };

    // Assert: error mentions "criticalIssues"
    expect(result.error).toBeDefined();
    expect(result.error).toContain("criticalIssues");
    expect(result.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getReviewOutputs backward compatibility (no options)
// ---------------------------------------------------------------------------

describe("getReviewOutputs backward compatibility (no options)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("still returns null for missing file", () => {
    // Arrange: temp dir with no REVIEW.md
    const goalDir = createGoalTree(tempDir, "bc-missing", [
      { number: 1, files: [] },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1);

    // Assert: null (not an error object)
    expect(result).toBeNull();
  });

  it("still returns data for valid frontmatter", () => {
    // Arrange: valid APPROVED REVIEW.md
    const goalDir = createGoalTree(tempDir, "bc-valid", [
      { number: 1, files: [] },
    ]);
    const stepDir = path.join(goalDir, "S01");
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    const state = createGoalState(goalDir);

    // Act
    const result = state.getReviewOutputs(1) as ReviewOutputs | null;

    // Assert: typed object directly (not wrapped in { data })
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// suppress console.warn in errors mode
// ---------------------------------------------------------------------------

describe("suppress console.warn in errors mode", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("no console.warn when errors=true and file is missing", () => {
    // Arrange: spy on console.warn; temp dir with no REVIEW.md
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const goalDir = createGoalTree(tempDir, "no-warn", [
      { number: 1, files: [] },
    ]);

    const state = createGoalState(goalDir);

    // Act: use errors mode
    state.getReviewOutputs(1, { errors: true });

    // Assert: console.warn was not called
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// planMetadata()
// ---------------------------------------------------------------------------

describe("planMetadata()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns typed PlanFrontmatter when PLAN.md has valid frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "valid-frontmatter");
    writePlanWithFrontmatter(goalDir, 5);

    const state = createGoalState(goalDir);
    const result = state.planMetadata() as PlanFrontmatter | null;

    expect(result).not.toBeNull();
    expect(result!.totalSteps).toBe(5);
  });

  it("returns null when PLAN.md does not exist", () => {
    const goalDir = createGoalTree(tempDir, "no-plan-md");

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null for PLAN.md with no frontmatter delimiters", () => {
    const goalDir = createGoalTree(tempDir, "no-delimiters");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome content without frontmatter.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null for malformed YAML in frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "malformed-yaml");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ninvalid: yaml: [:\n---\n# body",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null when totalSteps is missing from frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "missing-totalSteps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\notherField: value\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null when totalSteps is zero", () => {
    const goalDir = createGoalTree(tempDir, "zero-totalSteps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 0\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null when totalSteps is negative", () => {
    const goalDir = createGoalTree(tempDir, "negative-totalSteps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: -3\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("returns null when totalSteps is a float", () => {
    const goalDir = createGoalTree(tempDir, "float-totalSteps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 2.5\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata();

    expect(result).toBeNull();
  });

  it("strips extra fields from frontmatter, returns only schema fields", () => {
    const goalDir = createGoalTree(tempDir, "extra-fields");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 3\nsteps:\n  - name: a\n    complexity: task\n  - name: b\n    complexity: task\n  - name: c\n    complexity: task\nextraField: value\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata() as PlanFrontmatter | null;

    expect(result).not.toBeNull();
    expect(result!.totalSteps).toBe(3);
    expect(result!.steps).toHaveLength(3);
    expect((result as Record<string, unknown>).extraField).toBeUndefined();
  });

  it("reads fresh from disk on every call (no caching)", () => {
    const goalDir = createGoalTree(tempDir, "no-caching");
    writePlanWithFrontmatter(goalDir, 2);

    const state = createGoalState(goalDir);

    let result = state.planMetadata() as PlanFrontmatter | null;
    expect(result!.totalSteps).toBe(2);

    // Overwrite with different value
    writePlanWithFrontmatter(goalDir, 7);

    result = state.planMetadata() as PlanFrontmatter | null;
    expect(result!.totalSteps).toBe(7);
  });

  it("returns valid PlanFrontmatter for boundary value totalSteps: 1", () => {
    const goalDir = createGoalTree(tempDir, "boundary-one");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 1\nsteps:\n  - name: only-step\n    complexity: task\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata() as PlanFrontmatter | null;

    expect(result).not.toBeNull();
    expect(result!.totalSteps).toBe(1);
    expect(result!.steps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// planMetadata({ errors: true })
// ---------------------------------------------------------------------------

describe("planMetadata({ errors: true })", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns { data } for valid frontmatter", () => {
    const goalDir = createGoalTree(tempDir, "errors-valid");
    writePlanWithFrontmatter(goalDir, 5);

    const state = createGoalState(goalDir);
    const result = state.planMetadata({ errors: true }) as { data?: PlanFrontmatter; error?: string };

    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(5);
    expect(result.error).toBeUndefined();
  });

  it("returns { error } for missing PLAN.md", () => {
    const goalDir = createGoalTree(tempDir, "errors-missing");

    const state = createGoalState(goalDir);
    const result = state.planMetadata({ errors: true }) as { data?: PlanFrontmatter; error?: string };

    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.data).toBeUndefined();
  });

  it("returns { error } for no frontmatter delimiters", () => {
    const goalDir = createGoalTree(tempDir, "errors-no-delimiters");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome content without frontmatter.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata({ errors: true }) as { data?: PlanFrontmatter; error?: string };

    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.data).toBeUndefined();
  });

  it("returns { error } with typebox details for invalid totalSteps", () => {
    const goalDir = createGoalTree(tempDir, "errors-invalid");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 0\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata({ errors: true }) as { data?: PlanFrontmatter; error?: string };

    expect(result.error).toBeDefined();
    expect(result.error).toContain("totalSteps");
    expect(result.data).toBeUndefined();
  });

  it("returns { data } strips extra fields", () => {
    const goalDir = createGoalTree(tempDir, "errors-extra");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 3\nsteps:\n  - name: a\n    complexity: task\n  - name: b\n    complexity: task\n  - name: c\n    complexity: task\nextraField: value\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);
    const result = state.planMetadata({ errors: true }) as { data?: PlanFrontmatter; error?: string };

    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(3);
    expect(result.data!.steps).toHaveLength(3);
    expect((result.data as Record<string, unknown>).extraField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// goalCompleted()
// ---------------------------------------------------------------------------

describe("goalCompleted()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true when COMPLETED marker exists", () => {
    // Arrange: goalDir with PLAN.md (any content) and COMPLETED marker
    const goalDir = createGoalTree(tempDir, "completed-marker");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan", "utf-8");
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(true);
  });

  it("returns false when currentStepNumber() > totalPlanSteps but no COMPLETED marker", () => {
    // Arrange: totalSteps=3, all 3 steps APPROVED (currentStepNumber returns 4), but no COMPLETED marker
    // Frontmatter exhaustion alone is NOT completion — the COMPLETED marker is the canonical signal.
    // The marker is written by validateAndFindNextStep() or the evolve-plan agent.
    const goalDir = createGoalTree(tempDir, "frontmatter-done-no-marker", [
      { number: 1, files: ["APPROVED"] },
      { number: 2, files: ["APPROVED"] },
      { number: 3, files: ["APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 3);

    // Act
    const state = createGoalState(goalDir);

    // Assert: false — frontmatter exhaustion is not completion without the marker
    expect(state.goalCompleted()).toBe(false);
  });

  it("returns true for single-step plan with COMPLETED marker (totalSteps=1, S01 APPROVED)", () => {
    // Arrange: totalSteps=1, S01 APPROVED, COMPLETED marker written
    const goalDir = createGoalTree(tempDir, "single-step-completed", [
      { number: 1, files: ["APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(true);
  });

  it("returns false when steps remain (currentStepNumber <= totalSteps)", () => {
    // Arrange: totalSteps=5, S01 APPROVED (currentStepNumber returns 2)
    const goalDir = createGoalTree(tempDir, "steps-remain", [
      { number: 1, files: ["APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 5);

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(false);
  });

  it("returns false when no COMPLETED marker and no frontmatter", () => {
    // Arrange: PLAN.md without frontmatter, no COMPLETED
    const goalDir = createGoalTree(tempDir, "no-signals");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n\nNo frontmatter.", "utf-8");

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(false);
  });

  it("returns false for single-step plan without COMPLETED marker (totalSteps=1, S01 APPROVED)", () => {
    // Arrange: totalSteps=1, S01 APPROVED (currentStepNumber returns 2, which is > 1), but no COMPLETED marker
    const goalDir = createGoalTree(tempDir, "single-step-no-marker", [
      { number: 1, files: ["APPROVED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    // Act
    const state = createGoalState(goalDir);

    // Assert: false — frontmatter exhaustion alone is not completion
    expect(state.goalCompleted()).toBe(false);
  });

  it("COMPLETED marker is the only completion signal (works without frontmatter)", () => {
    // Arrange: PLAN.md without frontmatter, but COMPLETED file exists
    const goalDir = createGoalTree(tempDir, "marker-only");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n\nNo frontmatter.", "utf-8");
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(true);
  });

  it("returns false when totalPlanSteps() is undefined and no COMPLETED marker", () => {
    // Arrange: PLAN.md with invalid frontmatter (missing totalSteps), no COMPLETED
    const goalDir = createGoalTree(tempDir, "invalid-frontmatter");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\notherField: value\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.goalCompleted()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// revisionNeeded()
// ---------------------------------------------------------------------------

describe("revisionNeeded()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true when REVISE_PLAN_NEEDED exists in the step folder", () => {
    // Arrange: create goal tree with S01 containing REVISE_PLAN_NEEDED
    const goalDir = createGoalTree(tempDir, "revision-needed", [
      { number: 1, files: ["REVISE_PLAN_NEEDED"] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.steps()[0].revisionNeeded()).toBe(true);
  });

  it("returns false when REVISE_PLAN_NEEDED does not exist", () => {
    // Arrange: create goal tree with empty S01
    const goalDir = createGoalTree(tempDir, "no-revision", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    // Act
    const state = createGoalState(goalDir);

    // Assert
    expect(state.steps()[0].revisionNeeded()).toBe(false);
  });

  it("reflects filesystem changes with no caching (lazy evaluation)", () => {
    // Arrange: create goal tree with empty S01
    const goalDir = createGoalTree(tempDir, "lazy-revision", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const state = createGoalState(goalDir);
    const stepDir = path.join(goalDir, "S01");

    // Initially false
    expect(state.steps()[0].revisionNeeded()).toBe(false);

    // Write REVISE_PLAN_NEEDED
    fs.writeFileSync(path.join(stepDir, "REVISE_PLAN_NEEDED"), "", "utf-8");

    // Now true — proves no caching
    expect(state.steps()[0].revisionNeeded()).toBe(true);

    // Remove file
    fs.rmSync(path.join(stepDir, "REVISE_PLAN_NEEDED"));

    // Back to false
    expect(state.steps()[0].revisionNeeded()).toBe(false);
  });

  it("returns false for a non-step folder containing REVISE_PLAN_NEEDED", () => {
    // Arrange: create a non-step directory with REVISE_PLAN_NEEDED inside
    const goalDir = createGoalTree(tempDir, "non-step-folder");
    const docsDir = path.join(goalDir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "REVISE_PLAN_NEEDED"), "", "utf-8");

    // Act
    const state = createGoalState(goalDir);

    // Assert: state.steps() does not include the non-step folder
    expect(state.steps()).toHaveLength(0);
  });

  it("works correctly for higher step numbers (S05, S10)", () => {
    // Arrange: create goal tree with S05 containing the marker
    const goalDir = createGoalTree(tempDir, "higher-steps", [
      { number: 5, files: ["REVISE_PLAN_NEEDED"] },
      { number: 10, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 10);

    // Act
    const state = createGoalState(goalDir);

    // Assert: S05 has revision needed, S10 does not; step numbers resolve correctly
    const steps = state.steps();
    expect(steps[4].stepNumber).toBe(5);
    expect(steps[4].revisionNeeded()).toBe(true);
    expect(steps[9].stepNumber).toBe(10);
    expect(steps[9].revisionNeeded()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pendingTask() with nested subgoal paths
// ---------------------------------------------------------------------------

describe("pendingTask() with nested subgoal paths", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("given a nested subgoal goalDir, it reads from the correct qualified queue file", () => {
    // Arrange: Create nested directory structure
    const nestedGoalDir = path.join(tempDir, ".pio", "goals", "parent", "S03", "subgoals", "nested");
    fs.mkdirSync(nestedGoalDir, { recursive: true });

    // Write queue file with qualified name: task-parent__S03__nested.json
    const queueDir = path.join(tempDir, ".pio", "session-queue");
    fs.mkdirSync(queueDir, { recursive: true });
    const taskData = { capability: "evolve-plan", params: { stepNumber: 1 } };
    fs.writeFileSync(
      path.join(queueDir, "task-parent__S03__nested.json"),
      JSON.stringify(taskData, null, 2),
      "utf-8",
    );

    // Act
    const state = createGoalState(nestedGoalDir);
    const result = state.pendingTask();

    // Assert
    expect(result).toBeDefined();
    expect(result?.capability).toBe("evolve-plan");
    expect(result?.params).toEqual({ stepNumber: 1 });
  });

  it("given a flat goalDir, it reads from task-{basename}.json (backward compatible)", () => {
    // Arrange
    const goalDir = createGoalTree(tempDir, "my-feature");
    writeQueueFile(tempDir, "my-feature", {
      capability: "create-plan",
      params: { goalName: "my-feature" },
    });

    // Act
    const state = createGoalState(goalDir);
    const result = state.pendingTask();

    // Assert
    expect(result).toBeDefined();
    expect(result?.capability).toBe("create-plan");
    expect(result?.params).toEqual({ goalName: "my-feature" });
  });

  it("given a nested subgoal goalDir with no matching queue file, it returns undefined", () => {
    // Arrange: Create nested structure but don't write any queue files
    const nestedGoalDir = path.join(tempDir, ".pio", "goals", "parent", "S01", "subgoals", "orphan");
    fs.mkdirSync(nestedGoalDir, { recursive: true });

    // Act
    const state = createGoalState(nestedGoalDir);
    const result = state.pendingTask();

    // Assert
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// suppress console.warn in planMetadata errors mode
// ---------------------------------------------------------------------------

describe("suppress console.warn in planMetadata errors mode", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("no console.warn when errors=true and file is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const goalDir = createGoalTree(tempDir, "plan-no-warn");

    const state = createGoalState(goalDir);

    // Act: use errors mode with no PLAN.md
    state.planMetadata({ errors: true });

    // Assert: console.warn was not called
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("console.warn IS called without errors option and file is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const goalDir = createGoalTree(tempDir, "plan-warn");

    const state = createGoalState(goalDir);

    // Act: no errors option, no PLAN.md
    state.planMetadata();

    // Assert: console.warn was called
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// StepStatus.getMetadata() — with valid frontmatter steps array
// ---------------------------------------------------------------------------

describe("StepStatus.getMetadata() — with valid frontmatter steps array", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns metadata for step 1 when frontmatter has steps array", () => {
    // Arrange: Create goal tree with S01/, write PLAN.md with steps array
    const goalDir = createGoalTree(tempDir, "metadata-step1", [
      { number: 1, files: [] },
    ]);
    writePlanWithStepsFrontmatter(goalDir, 3, [
      { name: "first-step", complexity: "task" },
      { name: "second", complexity: "subgoal" },
      { name: "third", complexity: "task" },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const metadata = state.steps()[0].getMetadata();

    // Assert
    expect(metadata).toEqual({ name: "first-step", complexity: "task" });
  });

  it("returns metadata for step 2 with complexity subgoal", () => {
    // Arrange
    const goalDir = createGoalTree(tempDir, "metadata-subgoal", [
      { number: 1, files: [] },
      { number: 2, files: [] },
    ]);
    writePlanWithStepsFrontmatter(goalDir, 3, [
      { name: "first-step", complexity: "task" },
      { name: "second", complexity: "subgoal" },
      { name: "third", complexity: "task" },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const metadata = state.steps()[1].getMetadata();

    // Assert
    expect(metadata).toEqual({ name: "second", complexity: "subgoal" });
  });

  it("maps step N to index N-1 (step 3 → index 2)", () => {
    // Arrange
    const goalDir = createGoalTree(tempDir, "metadata-step3", [
      { number: 1, files: [] },
      { number: 2, files: [] },
      { number: 3, files: [] },
    ]);
    writePlanWithStepsFrontmatter(goalDir, 3, [
      { name: "first-step", complexity: "task" },
      { name: "second", complexity: "subgoal" },
      { name: "third", complexity: "task" },
    ]);

    const state = createGoalState(goalDir);

    // Act
    const metadata = state.steps()[2].getMetadata();

    // Assert
    expect(metadata).toEqual({ name: "third", complexity: "task" });
  });

  it("does not include step folders that are beyond the frontmatter steps array", () => {
    // Arrange: PLAN.md with 2 steps, but S03/ also exists on disk
    const goalDir = createGoalTree(tempDir, "metadata-oob", [
      { number: 1, files: [] },
      { number: 2, files: [] },
      { number: 3, files: [] },
    ]);
    writePlanWithStepsFrontmatter(goalDir, 2, [
      { name: "first", complexity: "task" },
      { name: "second", complexity: "task" },
    ]);

    const state = createGoalState(goalDir);

    // Act: only 2 steps from frontmatter, S03 on disk is not included
    expect(state.steps()).toHaveLength(2);
    expect(state.steps()[0].stepNumber).toBe(1);
    expect(state.steps()[1].stepNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// StepStatus.getMetadata() — graceful degradation for old plans
// ---------------------------------------------------------------------------

describe("StepStatus.getMetadata() — graceful degradation for old plans", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array when PLAN.md has no steps field (old-format plan)", () => {
    // Arrange: PLAN.md with only totalSteps (no steps array)
    const goalDir = createGoalTree(tempDir, "old-format", [
      { number: 1, files: [] },
    ]);
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 3\n---\n# Plan\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act: steps() returns empty when no steps array in frontmatter
    expect(state.steps()).toEqual([]);
  });

  it("returns empty array when PLAN.md has no frontmatter at all", () => {
    // Arrange: PLAN.md as plain markdown without --- delimiters
    const goalDir = createGoalTree(tempDir, "no-frontmatter-meta", [
      { number: 1, files: [] },
    ]);
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome content without frontmatter.",
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = createGoalState(goalDir);

    // Act: steps() returns empty when frontmatter is missing
    expect(state.steps()).toEqual([]);

    warnSpy.mockRestore();
  });

  it("returns empty array when PLAN.md does not exist", () => {
    // Arrange: Goal directory with S01/ but no PLAN.md
    const goalDir = createGoalTree(tempDir, "no-plan-meta", [
      { number: 1, files: [] },
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = createGoalState(goalDir);

    // Act: steps() returns empty when PLAN.md is missing
    expect(state.steps()).toEqual([]);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// StepStatus.getMetadata() — edge cases
// ---------------------------------------------------------------------------

describe("StepStatus.getMetadata() — edge cases", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("defaults complexity to 'task' when omitted in steps entry", () => {
    // Arrange: Valid PLAN.md with steps entry omitting complexity
    const goalDir = createGoalTree(tempDir, "default-complexity", [
      { number: 1, files: [] },
    ]);
    // Write PLAN.md with steps entry that omits the complexity field
    const planContent = [
      "---",
      "totalSteps: 1",
      "steps:",
      "  - name: only-name",
      "---",
      "# Plan: test-goal",
      "",
      "Some plan content.",
    ].join("\n");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), planContent, "utf-8");

    const state = createGoalState(goalDir);

    // Act
    const metadata = state.steps()[0].getMetadata();

    // Assert: complexity defaults to "task" when omitted
    expect(metadata).toEqual({ name: "only-name", complexity: "task" });
  });

  it("reflects filesystem changes (no caching) — update PLAN.md and re-read", () => {
    // Arrange: Write valid PLAN.md with steps array
    const goalDir = createGoalTree(tempDir, "no-caching-meta", [
      { number: 1, files: [] },
    ]);
    writePlanWithStepsFrontmatter(goalDir, 1, [{ name: "original", complexity: "task" }]);

    const state = createGoalState(goalDir);

    // Act: read metadata
    let metadata = state.steps()[0].getMetadata();
    expect(metadata).toEqual({ name: "original", complexity: "task" });

    // Overwrite with different steps array
    writePlanWithStepsFrontmatter(goalDir, 1, [{ name: "updated", complexity: "subgoal" }]);

    // Read again
    metadata = state.steps()[0].getMetadata();

    // Assert: returns different values reflecting the updated frontmatter
    expect(metadata).toEqual({ name: "updated", complexity: "subgoal" });
  });
});

// ---------------------------------------------------------------------------
// StepStatus.taskSkills()
// ---------------------------------------------------------------------------

describe("StepStatus.taskSkills()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns TaskSkills when TASK.md has valid skills frontmatter", () => {
    // Arrange: TASK.md with skills in frontmatter
    const goalDir = createGoalTree(tempDir, "skills-valid", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - ask-user\n  recommended:\n    - name: source-research\n      condition: when library internals are needed\n---\n# Task\n\nSome task content.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).not.toBeNull();
    expect(skills!.mandatory).toEqual(["ask-user"]);
    expect(skills!.recommended).toEqual([
      { name: "source-research", condition: "when library internals are needed" },
    ]);
  });

  it("returns skills with only mandatory array", () => {
    // Arrange: TASK.md with only mandatory skills
    const goalDir = createGoalTree(tempDir, "skills-mandatory-only", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - ask-user\n    - source-research\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).not.toBeNull();
    expect(skills!.mandatory).toEqual(["ask-user", "source-research"]);
    expect(skills!.recommended).toBeUndefined();
  });

  it("returns skills with only recommended array", () => {
    // Arrange: TASK.md with only recommended skills
    const goalDir = createGoalTree(tempDir, "skills-recommended-only", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  recommended:\n    - name: web-browser\n      condition: when browser testing is needed\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).not.toBeNull();
    expect(skills!.mandatory).toBeUndefined();
    expect(skills!.recommended).toEqual([
      { name: "web-browser", condition: "when browser testing is needed" },
    ]);
  });

  it("returns null when TASK.md has no skills key in frontmatter", () => {
    // Arrange: TASK.md with frontmatter but no skills
    const goalDir = createGoalTree(tempDir, "skills-no-key", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nsomeOtherField: value\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("returns null when TASK.md has empty frontmatter", () => {
    // Arrange: TASK.md with empty YAML between delimiters
    const goalDir = createGoalTree(tempDir, "skills-empty-fm", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("returns null when TASK.md does not exist", () => {
    // Arrange: S01/ exists but no TASK.md
    const goalDir = createGoalTree(tempDir, "skills-no-file", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("returns null when TASK.md has malformed YAML", () => {
    // Arrange: TASK.md with invalid YAML between delimiters
    const goalDir = createGoalTree(tempDir, "skills-malformed", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\ninvalid: yaml: [:\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("returns null when TASK.md skills fail schema validation", () => {
    // Arrange: TASK.md with skills but invalid structure (mandatory is a string, not array)
    const goalDir = createGoalTree(tempDir, "skills-invalid-schema", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory: not-an-array\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[0].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("reflects filesystem changes with no caching (lazy evaluation)", () => {
    // Arrange: S01/ with TASK.md containing valid skills
    const goalDir = createGoalTree(tempDir, "skills-no-caching", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);
    const stepDir = path.join(goalDir, "S01");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - ask-user\n---\n# Task\n\nContent.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    // Act: first read
    let skills = state.steps()[0].taskSkills();
    expect(skills!.mandatory).toEqual(["ask-user"]);

    // Update TASK.md
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - source-research\n---\n# Task\n\nUpdated.",
      "utf-8",
    );

    // Act: second read — should reflect the new content
    skills = state.steps()[0].taskSkills();
    expect(skills!.mandatory).toEqual(["source-research"]);

    // Remove TASK.md
    fs.rmSync(path.join(stepDir, "TASK.md"));

    // Act: third read — should return null
    skills = state.steps()[0].taskSkills();
    expect(skills).toBeNull();
  });

  it("returns null for step without TASK.md (pending step)", () => {
    // Arrange: S02/ exists but has no TASK.md
    const goalDir = createGoalTree(tempDir, "skills-pending", [
      { number: 1, files: [] },
      { number: 2, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 2);

    const state = createGoalState(goalDir);

    // Act
    const skills = state.steps()[1].taskSkills();

    // Assert
    expect(skills).toBeNull();
  });

  it("does not throw on any error condition", () => {
    // Arrange: S01/ with no TASK.md
    const goalDir = createGoalTree(tempDir, "skills-no-throw", [
      { number: 1, files: [] },
    ]);
    writePlanWithFrontmatter(goalDir, 1);

    const state = createGoalState(goalDir);

    // Act & Assert: should not throw
    expect(() => state.steps()[0].taskSkills()).not.toThrow();
  });
});

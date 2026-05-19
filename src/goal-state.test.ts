import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createGoalState } from "./goal-state";
import { stepFolderName } from "./fs-utils";
import type { ReviewOutputs } from "./frontmatter-schemas";

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

/** Write a PLAN.md with Step N headings at the given goal directory. */
function writePlan(goalDir: string, stepNumbers: number[]): void {
  const lines = stepNumbers.map((n) => `## Step ${n}: Title for step ${n}`);
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), lines.join("\n"), "utf-8");
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

    // Assert safe defaults
    expect(state.hasGoal()).toBe(false);
    expect(state.hasPlan()).toBe(false);
    expect(state.totalPlanSteps()).toBeUndefined();
    expect(state.steps()).toEqual([]);
    expect(state.currentStepNumber()).toBe(1); // always at least 1
    expect(state.pendingTask()).toBeUndefined();
    expect(state.lastCompleted()).toBeUndefined();
    expect(state.getReviewOutputs(1)).toBeNull(); // no step folder
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

  it("parses step count from PLAN.md with ## Step N: headings", () => {
    const goalDir = createGoalTree(tempDir, "with-steps");
    writePlan(goalDir, [1, 2, 3]);

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBe(3);
  });

  it("returns undefined when PLAN.md does not exist", () => {
    const goalDir = createGoalTree(tempDir, "no-plan");

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBeUndefined();
  });

  it("returns undefined for PLAN.md with no step headings", () => {
    const goalDir = createGoalTree(tempDir, "plan-no-steps");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome content without step headings.",
      "utf-8",
    );

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBeUndefined();
  });

  it("handles non-sequential step numbers and returns highest N", () => {
    const goalDir = createGoalTree(tempDir, "non-seq");
    writePlan(goalDir, [1, 5]);

    const state = createGoalState(goalDir);

    expect(state.totalPlanSteps()).toBe(5);
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

  it("returns empty array when no S{NN} folders exist", () => {
    const goalDir = createGoalTree(tempDir, "empty");

    const state = createGoalState(goalDir);

    expect(state.steps()).toEqual([]);
  });

  it("discovers step folders S01, S02, etc. and returns correct count", () => {
    const goalDir = createGoalTree(tempDir, "three-steps", [
      { number: 1, files: [] },
      { number: 2, files: [] },
      { number: 3, files: [] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()).toHaveLength(3);
  });

  it("returns correct stepNumber and folderName for each step", () => {
    const goalDir = createGoalTree(tempDir, "sparse-steps", [
      { number: 1, files: [] },
      { number: 3, files: [] },
    ]);

    const state = createGoalState(goalDir);
    const steps = state.steps();

    expect(steps[0].stepNumber).toBe(1);
    expect(steps[0].folderName).toBe("S01");
    expect(steps[1].stepNumber).toBe(3);
    expect(steps[1].folderName).toBe("S03");
  });

  it("sorts results by stepNumber ascending", () => {
    // Create S03 first, then S01, then S02 — order of creation doesn't matter
    const goalDir = createGoalTree(tempDir, "sorted-steps", [
      { number: 3, files: [] },
      { number: 1, files: [] },
      { number: 2, files: [] },
    ]);

    const state = createGoalState(goalDir);
    const steps = state.steps();

    expect(steps.map((s) => s.stepNumber)).toEqual([1, 2, 3]);
  });

  it("StepStatus.status() returns 'pending' for an empty step folder", () => {
    const goalDir = createGoalTree(tempDir, "pending-step", [
      { number: 1, files: [] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("pending");
  });

  it("StepStatus.status() returns 'defined' when TASK.md + TEST.md exist but no markers", () => {
    const goalDir = createGoalTree(tempDir, "defined-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("defined");
  });

  it("StepStatus.status() returns 'implemented' when COMPLETED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "implemented-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("implemented");
  });

  it("StepStatus.status() returns 'approved' when APPROVED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "approved-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "APPROVED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("approved");
  });

  it("StepStatus.status() returns 'rejected' when REJECTED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "rejected-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "REJECTED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("rejected");
  });

  it("StepStatus.status() returns 'blocked' when BLOCKED marker exists", () => {
    const goalDir = createGoalTree(tempDir, "blocked-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "BLOCKED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("blocked");
  });

  it("marker precedence: APPROVED > REJECTED > BLOCKED > COMPLETED", () => {
    const goalDir = createGoalTree(tempDir, "multi-markers", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED", "APPROVED"] },
    ]);

    const state = createGoalState(goalDir);

    expect(state.steps()[0].status()).toBe("approved");
  });

  it("StepStatus.hasTask() returns true/false based on TASK.md existence", () => {
    const goalDir = createGoalTree(tempDir, "has-task-test", [
      { number: 1, files: [] }, // no TASK.md
    ]);

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

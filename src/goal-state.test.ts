import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createGoalState } from "./goal-state";
import { stepFolderName } from "./fs-utils";

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

    // Assert safe defaults
    expect(state.hasGoal()).toBe(false);
    expect(state.hasPlan()).toBe(false);
    expect(state.totalPlanSteps()).toBeUndefined();
    expect(state.steps()).toEqual([]);
    expect(state.currentStepNumber()).toBe(1); // always at least 1
    expect(state.pendingTask()).toBeUndefined();
    expect(state.lastCompleted()).toBeUndefined();
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
    const lastTaskData = { capability: "review-code", params: { stepNumber: 2 } };
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

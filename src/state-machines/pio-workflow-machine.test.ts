import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dispatch, unregisterMachine, recordTransition } from "../state-machines";
import { goalDrivenDevelopment } from "./pio-workflow-machine";
import { setDiscoveredContracts } from "./utils";
import type { TransitionResult } from "../state-machines";

// ---------------------------------------------------------------------------
// Setup: populate contract cache from real capability configs
// ---------------------------------------------------------------------------

// We need the real contracts for getCapState to work.
// Import them here before any tests run.
import { CONTRACT as createPlanContract } from "../capabilities/create-plan/config";
import { CONTRACT as evolvePlanContract } from "../capabilities/evolve-plan/config";
import { CONTRACT as reviewTaskContract } from "../capabilities/review-task/config";

// Populate the contract cache once at module load time.
setDiscoveredContracts({
  "create-plan": createPlanContract,
  "evolve-plan": evolvePlanContract,
  "review-task": reviewTaskContract,
});

// ---------------------------------------------------------------------------
// Helpers — filesystem fixtures
// ---------------------------------------------------------------------------

/** Create a temp directory for test fixtures. */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-test-"));
}

/** Clean up a temp directory. */
function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a goal directory tree under a temp directory.
 * Returns the path to the goal directory.
 */
function createGoalTree(
  tempDir: string,
  goalName: string,
  steps?: { number: number; files: Record<string, string> }[],
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  for (const step of steps ?? []) {
    const folderName = `S${String(step.number).padStart(2, "0")}`;
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
    for (const [fileName, content] of Object.entries(step.files)) {
      fs.writeFileSync(path.join(stepDir, fileName), content, "utf-8");
    }
  }

  return goalDir;
}

/** Write a PLAN.md with YAML frontmatter. */
function writePlanWithFrontmatter(goalDir: string, totalSteps: number): void {
  const stepsYaml = Array.from({ length: totalSteps }, (_, i) => `  - name: step-${i + 1}\n    complexity: task`).join("\n");
  const content = `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan: test-goal\n\nSome plan content.`;
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), content, "utf-8");
}

/** Write a REVIEW.md with YAML frontmatter for the given step. */
function writeReview(goalDir: string, stepNumber: number, decision: "APPROVED" | "REJECTED"): void {
  const folderName = `S${String(stepNumber).padStart(2, "0")}`;
  const stepDir = path.join(goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });
  const content = `---\ndecision: "${decision}"\ncriticalIssues: 0\nhighIssues: 0\nmediumIssues: 0\nlowIssues: 0\n---\n# Review\n\nReview content.`;
  fs.writeFileSync(path.join(stepDir, "REVIEW.md"), content, "utf-8");
}

/** Write a COMPLETION_SUMMARY.md file. */
function writeCompletionSummary(goalDir: string): void {
  const content = `---\nstatus: "complete"\ncompletedAt: "2025-01-01T00:00:00Z"\n---\n# Completion\n\nAll steps complete.`;
  fs.writeFileSync(path.join(goalDir, "COMPLETION_SUMMARY.md"), content, "utf-8");
}

/** Write a REVISE_PLAN_NEEDED marker file. */
function writeRevisePlanNeeded(goalDir: string, stepNumber: number): void {
  const folderName = `S${String(stepNumber).padStart(2, "0")}`;
  const stepDir = path.join(goalDir, folderName);
  fs.mkdirSync(stepDir, { recursive: true });
  fs.writeFileSync(path.join(stepDir, "REVISE_PLAN_NEEDED"), "", "utf-8");
}

/** Context object for dispatch calls. */
function ctx(goalDir: string): { baseDir: string } {
  return { baseDir: goalDir };
}

// ---------------------------------------------------------------------------
// Test setup/teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  unregisterMachine("goal-driven-development");
});

// ---------------------------------------------------------------------------
// dispatch — create-goal → create-plan
// ---------------------------------------------------------------------------

describe("dispatch — create-goal → create-plan", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "my-feature");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("returns create-plan with params preserved", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(goalDir), { goalName: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "my-feature" },
    });
  });

  it("returns create-plan when params is undefined", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(goalDir), undefined);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      params: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — create-plan → evolve-plan
// ---------------------------------------------------------------------------

describe("dispatch — create-plan → evolve-plan", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "my-feature");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("returns evolve-plan with params preserved", () => {
    const results = dispatch(goalDrivenDevelopment, "create-plan", ctx(goalDir), { goalName: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "my-feature" },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan → execute-task
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan → execute-task", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("returns execute-task with goalName and stepNumber propagated when present", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("returns execute-task with stepNumber undefined when stepNumber is missing from params", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBeUndefined();
  });

  it("prefers explicit stepNumber from params", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — full transition chain: review → evolve → finalize
// ---------------------------------------------------------------------------

describe("dispatch — review→evolve→finalize chain", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("review-task approval leads to evolve-plan which routes to finalize-goal when complete", () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    // Arrange: step 3 has APPROVED REVIEW.md
    writeReview(goalDir, 3, "APPROVED");

    // Act step 1: review-task approval → evolve-plan with incremented stepNumber
    const reviewResults = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    // Assert step 1: routes to evolve-plan with stepNumber 4
    expect(reviewResults).toHaveLength(1);
    expect(reviewResults[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 4 },
    });

    // Arrange step 2: goal is complete (COMPLETION_SUMMARY.md exists)
    writeCompletionSummary(goalDir);

    // Act step 2: evolve-plan with COMPLETION_SUMMARY.md → finalize-goal
    const evolveResults = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 4 });

    // Assert step 2: routes to finalize-goal with all three params
    expect(evolveResults).toHaveLength(1);
    expect(evolveResults[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      params: {
        goalName: "feat",
        goalDir: path.join(tempDir, ".pio", "goals", "feat"),
        workingDir: tempDir,
      },
    });

    cwdSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan completion detection
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan completion detection", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("routes to finalize-goal when COMPLETION_SUMMARY.md exists", () => {
    writeCompletionSummary(goalDir);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      params: {
        goalName: "feat",
        goalDir: path.join(tempDir, ".pio", "goals", "feat"),
        workingDir: tempDir,
      },
    });

    cwdSpy.mockRestore();
  });

  it("propagates goalName in finalize-goal params", () => {
    writeCompletionSummary(goalDir);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "my-feature", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");
    expect(results[0].params?.goalName).toBe("my-feature");
    expect(results[0].params?.goalDir).toBe(path.join(tempDir, ".pio", "goals", "my-feature"));
    expect(results[0].params?.workingDir).toBe(tempDir);

    cwdSpy.mockRestore();
  });

  it("routes to execute-task when COMPLETION_SUMMARY.md does not exist", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBeUndefined();
  });

  it("routes to execute-task with explicit stepNumber when not completed", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — execute-task → review-task
// ---------------------------------------------------------------------------

describe("dispatch — execute-task → review-task", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("returns review-task with goalName and stepNumber propagated when present", () => {
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(goalDir), { goalName: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });

  it("returns review-task with stepNumber undefined when stepNumber is missing from params", () => {
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("review-task");
    expect(results[0].params?.stepNumber).toBeUndefined();
  });

  it("prefers explicit stepNumber from params", () => {
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(goalDir), { goalName: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — review-task approval
// ---------------------------------------------------------------------------

describe("dispatch — review-task approval", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
    writeReview(goalDir, 3, "APPROVED");
  });

  afterEach(() => cleanup(tempDir));

  it("routes to evolve-plan with incremented stepNumber when REVIEW.md decision is APPROVED", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("preserves goalName while incrementing stepNumber", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "my-big-feature", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-big-feature");
    expect(results[0].params?.stepNumber).toBe(4);
  });

  it("falls back to execute-task when stepNumber is missing from params", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat" });

    // resolveReviewTaskToEvolvePlan returns undefined (stepNumber null).
    // resolveReviewTaskToExecuteTask handles null stepNumber and returns execute-task.
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat" },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — review-task rejection
// ---------------------------------------------------------------------------

describe("dispatch — review-task rejection", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
    writeReview(goalDir, 3, "REJECTED");
  });

  afterEach(() => cleanup(tempDir));

  it("routes to execute-task with same stepNumber when REVIEW.md decision is REJECTED", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("preserves goalName and same stepNumber when rejected", () => {
    writeReview(goalDir, 2, "REJECTED");

    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "my-feature", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
    expect(results[0].params?.stepNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// dispatch — review-task fallback (no REVIEW.md or unknown decision)
// ---------------------------------------------------------------------------

describe("dispatch — review-task fallback (no matching edge)", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array when REVIEW.md does not exist", () => {
    // No REVIEW.md written — both edges return undefined
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when REVIEW.md has invalid frontmatter", () => {
    const folderDir = path.join(goalDir, "S03");
    fs.mkdirSync(folderDir, { recursive: true });
    fs.writeFileSync(path.join(folderDir, "REVIEW.md"), "# No frontmatter\n", "utf-8");

    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dispatch — unknown capability
// ---------------------------------------------------------------------------

describe("dispatch — unknown capability", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array for unknown string", () => {
    const results = dispatch(goalDrivenDevelopment, "nonexistent", ctx(goalDir), {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const results = dispatch(goalDrivenDevelopment, "", ctx(goalDir), {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for finalize-goal with no parentGoalName", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TransitionResult shape consistency
// ---------------------------------------------------------------------------

describe("TransitionResult shape consistency", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("results include stateMachineId and params", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(goalDir), { goalName: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
    expect(typeof results[0]).toBe("object");
    expect(results[0]).toHaveProperty("capability");
    expect(results[0]).toHaveProperty("stateMachineId");
    expect(results[0]).toHaveProperty("params");
    expect(results[0].stateMachineId).toBe("goal-driven-development");
  });

  it("edge resolve functions return TransitionResult directly (not double-wrapped)", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 1 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan → revise-plan
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan → revise-plan", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 4);
  });

  afterEach(() => cleanup(tempDir));

  it("routes to revise-plan when REVISE_PLAN_NEEDED marker exists", () => {
    writeRevisePlanNeeded(goalDir, 4);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("revise-plan");
  });

  it("includes revisionTriggerStep set to current step number", () => {
    writeRevisePlanNeeded(goalDir, 4);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.revisionTriggerStep).toBe(4);
  });

  it("preserves goalName in revise-plan params", () => {
    writeRevisePlanNeeded(goalDir, 4);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "my-feature", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
  });

  it("falls through to execute-task when REVISE_PLAN_NEEDED does not exist", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
  });

  it("falls through to finalize-goal when COMPLETION_SUMMARY.md exists and no revision needed", () => {
    writeCompletionSummary(goalDir);
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");

    cwdSpy.mockRestore();
  });

  it("falls through to execute-task when stepNumber is missing from params", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dispatch — revise-plan → evolve-plan
// ---------------------------------------------------------------------------

describe("dispatch — revise-plan → evolve-plan", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("routes to evolve-plan after revise-plan completes", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
  });

  it("preserves goalName in evolve-plan params", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(goalDir), { goalName: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
  });

  it("does not pass explicit stepNumber (let evolve-plan discover next step)", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(goalDir), { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.stepNumber).toBeUndefined();
  });

  it("preserves revisionTriggerStep if present in params", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(goalDir), { goalName: "feat", revisionTriggerStep: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.revisionTriggerStep).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// recordTransition — isolation from dispatch
// ---------------------------------------------------------------------------

describe("recordTransition isolation", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "test");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("calling recordTransition does not affect subsequent dispatch calls", () => {
    // Call recordTransition (real I/O)
    recordTransition(goalDir, "test-cap", { capability: "next", stateMachineId: "goal-driven-development" });

    // Verify dispatch still works correctly
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(goalDir), { goalName: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "test" },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan → create-goal (subgoal — deprecated)
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan → create-goal (subgoal — deprecated)", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "parent");
    // Write PLAN.md with a subgoal step
    const stepsYaml = `  - name: regular-step\n    complexity: task\n  - name: nested-feature\n    complexity: subgoal`;
    const content = `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`;
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), content, "utf-8");
  });

  afterEach(() => cleanup(tempDir));

  it("returns undefined for subgoal step (deprecated — always no-op)", () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "parent", stepNumber: 2 });

    // resolveEvolvePlanToCreateGoal always returns undefined now.
    // resolveEvolvePlanToExecuteTask should fire as fallback.
    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");

    cwdSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// dispatch — finalize-goal completion propagation
// ---------------------------------------------------------------------------

describe("dispatch — finalize-goal completion propagation", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "nested");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("routes to evolve-plan for parent with stepNumber: parentStepNumber + 1", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "nested",
      parentGoalName: "parent",
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect(results[0].params?.goalName).toBe("parent");
    expect(results[0].params?.stepNumber).toBe(4);
  });

  it("uses parentGoalName as the goalName in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "child-goal",
      parentGoalName: "my-parent",
      parentStepNumber: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-parent");
  });

  it("does NOT include parentGoalName or parentStepNumber in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.parentStepNumber).toBeUndefined();
  });

  it("does NOT include subgoalType in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.subgoalType).toBeUndefined();
  });

  it("returns empty array when no parentGoalName (top-level goal)", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), { goalName: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when parentGoalName is not a string (type guard)", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "child",
      parentGoalName: 123,
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dispatch — subgoal lifecycle (backward compat)
// ---------------------------------------------------------------------------

describe("dispatch — subgoal lifecycle", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "parent");
    writePlanWithFrontmatter(goalDir, 1);
  });

  afterEach(() => cleanup(tempDir));

  it("create-goal → create-plan (existing behavior, no change)", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(goalDir), {
      goalName: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("create-plan");
    expect(results[0].params?.parentGoalName).toBe("parent");
  });

  it("finalize-goal with parent context → evolve-plan for parent with incremented step number", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), {
      goalName: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect(results[0].params?.goalName).toBe("parent");
    expect(results[0].params?.stepNumber).toBe(3);
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.subgoalType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dispatch — backward compatibility
// ---------------------------------------------------------------------------

describe("dispatch — backward compatibility", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    goalDir = createGoalTree(tempDir, "feat");
    writePlanWithFrontmatter(goalDir, 3);
  });

  afterEach(() => cleanup(tempDir));

  it("finalize-goal without parentGoalName still returns empty array", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(goalDir), { goalName: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("evolve-plan with explicit stepNumber still routes to execute-task when no subgoal metadata present", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(goalDir), { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(3);
  });
});

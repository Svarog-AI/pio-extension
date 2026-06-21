import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dispatch, unregisterMachine, recordTransition } from "../state-machines";
import { goalDrivenDevelopment } from "./pio-workflow-machine";
import { setDiscoveredContracts } from "./utils";
import type { TransitionResult, ResolverResult } from "../state-machines";

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

/** Context object for dispatch calls — baseDir is the resolved goal directory.
 * mark-complete passes config.workingDir (resolved directory) to dispatch.
 * This is the directory where getCapState resolves files relative to — no workspacePrefix needed. */
function ctx(tempDir: string, goalName: string): { baseDir: string } {
  return { baseDir: path.join(tempDir, ".pio", "goals", goalName) };
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
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(tempDir, "my-feature"), { queueKey: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      initialMessage: `Create an implementation plan for goal "my-feature" based on GOAL.md.`,
      sessionName: "my-feature create-plan",
      params: { workspacePrefix: "goals/my-feature", queueKey: "my-feature" },
    });
  });

  it("returns empty array when params is undefined (queueKey missing — throws)", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(tempDir, "my-feature"), undefined);

    // resolveCreateGoalToCreatePlan throws when queueKey is missing.
    // dispatch() catches the error and logs a warning; no transitions fire.
    expect(results).toHaveLength(0);
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

  it("returns evolve-plan with stepNumber 1 (first step after plan creation)", () => {
    const results = dispatch(goalDrivenDevelopment, "create-plan", ctx(tempDir, "my-feature"), { queueKey: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      initialMessage: `Generate the specification for Step 1 of goal "my-feature".`,
      sessionName: "my-feature evolve-plan s1",
      params: { stepNumber: 1, workspacePrefix: "goals/my-feature", queueKey: "my-feature" },
    });
  });

  it("returns empty array when params is undefined (queueKey missing — throws)", () => {
    const results = dispatch(goalDrivenDevelopment, "create-plan", ctx(tempDir, "my-feature"), undefined);

    // resolveCreatePlanToEvolvePlan throws when queueKey is missing.
    // dispatch() catches the error and logs a warning; no transitions fire.
    expect(results).toHaveLength(0);
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
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Implement Step 3 of goal "feat" using the specification in TASK.md.`,
      sessionName: "feat execute-task s3",
      params: { stepNumber: 3, workspacePrefix: "goals/feat", queueKey: "feat" },
    });
  });

  it("returns empty array when stepNumber is missing from params (throws — wiring error)", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    // resolveEvolvePlanToExecuteTask throws when stepNumber is missing.
    // dispatch() catches the error and logs a warning; no transitions fire.
    expect(results).toHaveLength(0);
  });

  it("prefers explicit stepNumber from params", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Implement Step 2 of goal "feat" using the specification in TASK.md.`,
      sessionName: "feat execute-task s2",
      params: { stepNumber: 2, workspacePrefix: "goals/feat", queueKey: "feat" },
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
    // Arrange: step 3 has APPROVED REVIEW.md
    writeReview(goalDir, 3, "APPROVED");

    // Act step 1: review-task approval → evolve-plan with incremented stepNumber
    const reviewResults = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    // Assert step 1: routes to evolve-plan with stepNumber 4
    expect(reviewResults).toHaveLength(1);
    expect(reviewResults[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      initialMessage: `Step 3 approved. Generate the specification for Step 4 of goal "feat".`,
      sessionName: "feat evolve-plan s4",
      params: { stepNumber: 4, workspacePrefix: "goals/feat", queueKey: "feat" },
    });

    // Arrange step 2: goal is complete (COMPLETION_SUMMARY.md exists)
    writeCompletionSummary(goalDir);

    // Act step 2: evolve-plan with COMPLETION_SUMMARY.md → finalize-goal
    const evolveResults = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 4 });

    // Assert step 2: routes to finalize-goal with workspacePrefix (no goalDir)
    expect(evolveResults).toHaveLength(1);
    expect(evolveResults[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      initialMessage: `Finalize goal "feat" — all steps are complete. Update .pio/PROJECT/ documentation with accumulated decisions.`,
      sessionName: "feat finalize-goal",
      params: {
        workspacePrefix: "goals/feat",
        queueKey: "feat",
      },
    });
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

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      initialMessage: `Finalize goal "feat" — all steps are complete. Update .pio/PROJECT/ documentation with accumulated decisions.`,
      sessionName: "feat finalize-goal",
      params: {
        workspacePrefix: "goals/feat",
        queueKey: "feat",
      },
    });
  });

  it("propagates queueKey in finalize-goal params", () => {
    writeCompletionSummary(goalDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");
    expect(results[0].params?.workspacePrefix).toBe("goals/feat");
    expect(results[0].params?.queueKey).toBe("feat");
    expect(results[0].params?.goalDir).toBeUndefined();
    expect(results[0].params?.workingDir).toBeUndefined();
  });

  it("routes to execute-task when COMPLETION_SUMMARY.md does not exist", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(1);
  });

  it("routes to execute-task with explicit stepNumber when not completed", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Implement Step 2 of goal "feat" using the specification in TASK.md.`,
      sessionName: "feat execute-task s2",
      params: { stepNumber: 2, workspacePrefix: "goals/feat", queueKey: "feat" },
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
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Review the implementation of Step 5 for goal "feat".`,
      sessionName: "feat review-task s5",
      params: { stepNumber: 5, workspacePrefix: "goals/feat", queueKey: "feat" },
    });
  });

  it("returns empty array when stepNumber is missing from params (throws — wiring error)", () => {
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(tempDir, "feat"), { queueKey: "feat" });

    // resolveExecuteTaskToReviewTask throws when stepNumber is missing.
    // dispatch() catches the error and logs a warning; no transitions fire.
    expect(results).toHaveLength(0);
  });

  it("prefers explicit stepNumber from params", () => {
    const results = dispatch(goalDrivenDevelopment, "execute-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Review the implementation of Step 5 for goal "feat".`,
      sessionName: "feat review-task s5",
      params: { stepNumber: 5, workspacePrefix: "goals/feat", queueKey: "feat" },
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
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      initialMessage: `Step 3 approved. Generate the specification for Step 4 of goal "feat".`,
      sessionName: "feat evolve-plan s4",
      params: { stepNumber: 4, workspacePrefix: "goals/feat", queueKey: "feat" },
    });
  });

  it("preserves queueKey while incrementing stepNumber", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.queueKey).toBe("feat");
    expect(results[0].params?.stepNumber).toBe(4);
    expect(results[0].params?.workspacePrefix).toBe("goals/feat");
  });

  it("returns empty array when stepNumber is missing from params (throws — wiring error)", () => {
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat" });

    // Both resolveReviewTaskToEvolvePlan and resolveReviewTaskToExecuteTask
    // throw when stepNumber is missing — it's a wiring error upstream.
    // dispatch() catches the errors and logs warnings; no transitions fire.
    expect(results).toHaveLength(0);
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
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Step 3 rejected. Re-implement using the feedback in REVIEW.md.`,
      sessionName: "feat execute-task s3",
      params: { stepNumber: 3, workspacePrefix: "goals/feat", queueKey: "feat" },
    });
  });

  it("preserves queueKey and same stepNumber when rejected", () => {
    writeReview(goalDir, 2, "REJECTED");

    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.queueKey).toBe("feat");
    expect(results[0].params?.stepNumber).toBe(2);
    expect(results[0].params?.workspacePrefix).toBe("goals/feat");
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
    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when REVIEW.md has invalid frontmatter", () => {
    const folderDir = path.join(goalDir, "S03");
    fs.mkdirSync(folderDir, { recursive: true });
    fs.writeFileSync(path.join(folderDir, "REVIEW.md"), "# No frontmatter\n", "utf-8");

    const results = dispatch(goalDrivenDevelopment, "review-task", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

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
    const results = dispatch(goalDrivenDevelopment, "nonexistent", ctx(tempDir, "feat"), {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const results = dispatch(goalDrivenDevelopment, "", ctx(tempDir, "feat"), {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for finalize-goal with no parentGoalName", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "feat"), { queueKey: "feat" });

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

  it("results include stateMachineId, params, and initialMessage", () => {
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(tempDir, "feat"), { queueKey: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
    expect(typeof results[0]).toBe("object");
    expect(results[0]).toHaveProperty("capability");
    expect(results[0]).toHaveProperty("stateMachineId");
    expect(results[0]).toHaveProperty("params");
    expect(results[0]).toHaveProperty("initialMessage");
    expect(results[0].stateMachineId).toBe("goal-driven-development");
  });

  it("edge resolve functions return TransitionResult directly (not double-wrapped)", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      initialMessage: `Implement Step 1 of goal "feat" using the specification in TASK.md.`,
      sessionName: "feat execute-task s1",
      params: { stepNumber: 1, workspacePrefix: "goals/feat", queueKey: "feat" },
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

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("revise-plan");
    expect((results[0] as any).initialMessage).toContain("Revise the plan for goal");
    expect(results[0].params?.workspacePrefix).toBe("goals/feat");
  });

  it("includes revisionTriggerStep set to current step number", () => {
    writeRevisePlanNeeded(goalDir, 4);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.revisionTriggerStep).toBe(4);
  });

  it("preserves queueKey in revise-plan params", () => {
    writeRevisePlanNeeded(goalDir, 4);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "my-feature", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.queueKey).toBe("my-feature");
  });

  it("falls through to execute-task when REVISE_PLAN_NEEDED does not exist", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
  });

  it("falls through to finalize-goal when COMPLETION_SUMMARY.md exists and no revision needed", () => {
    writeCompletionSummary(goalDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");
  });

  it("returns empty array when stepNumber is missing from params (throws — wiring error)", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    // resolveEvolvePlanToExecuteTask throws when stepNumber is missing.
    // dispatch() catches the error and logs a warning; no transitions fire.
    expect(results).toHaveLength(0);
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
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect((results[0] as any).initialMessage).toContain("after plan revision");
  });

  it("preserves queueKey in evolve-plan params", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.queueKey).toBe("my-feature");
  });

  it("discovers next step number using discoverNextStep (returns 1 when no step folders exist)", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.stepNumber).toBe(1);
  });

  it("discovers next step number after some steps are complete (TASK.md + TEST.md present)", () => {
    // S01 has TASK.md + TEST.md (complete), S02 has only TASK.md (incomplete)
    createGoalTree(tempDir, "feat", [
      { number: 1, files: { "TASK.md": "# Task 1", "TEST.md": "# Tests 1" } },
      { number: 2, files: { "TASK.md": "# Task 2" } },
    ]);

    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.stepNumber).toBe(2);
  });

  it("discovers next step number when all steps are complete", () => {
    // Both S01 and S02 have TASK.md + TEST.md (both complete)
    createGoalTree(tempDir, "feat", [
      { number: 1, files: { "TASK.md": "# Task 1", "TEST.md": "# Tests 1" } },
      { number: 2, files: { "TASK.md": "# Task 2", "TEST.md": "# Tests 2" } },
    ]);

    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.stepNumber).toBe(3);
  });

  it("preserves revisionTriggerStep if present in params", () => {
    const results = dispatch(goalDrivenDevelopment, "revise-plan", ctx(tempDir, "feat"), { queueKey: "feat", revisionTriggerStep: 4 });

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
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(tempDir, "test"), { queueKey: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      initialMessage: `Create an implementation plan for goal "test" based on GOAL.md.`,
      sessionName: "test create-plan",
      params: { workspacePrefix: "goals/test", queueKey: "test" },
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
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "parent"), { queueKey: "parent", stepNumber: 2 });

    // resolveEvolvePlanToCreateGoal always returns undefined now.
    // resolveEvolvePlanToExecuteTask should fire as fallback.
    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
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
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), {
      queueKey: "nested",
      parentGoalName: "parent",
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect(results[0].params?.queueKey).toBe("parent");
    expect(results[0].params?.stepNumber).toBe(4);
    expect(results[0].params?.workspacePrefix).toBe("goals/parent");
  });

  it("uses parentGoalName as the queueKey in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), {
      queueKey: "child-goal",
      parentGoalName: "my-parent",
      parentStepNumber: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.queueKey).toBe("my-parent");
  });

  it("does NOT include parentGoalName or parentStepNumber in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), {
      queueKey: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.parentStepNumber).toBeUndefined();
  });

  it("does NOT include subgoalType in returned params", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), {
      queueKey: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.subgoalType).toBeUndefined();
  });

  it("returns empty array when no parentGoalName (top-level goal)", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), { queueKey: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when parentGoalName is not a string (type guard)", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "nested"), {
      queueKey: "child",
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
    const results = dispatch(goalDrivenDevelopment, "create-goal", ctx(tempDir, "parent"), {
      queueKey: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("create-plan");
    expect(results[0].params?.parentGoalName).toBe("parent");
    expect(results[0].params?.workspacePrefix).toBe("goals/nested-feature");
  });

  it("finalize-goal with parent context → evolve-plan for parent with incremented step number", () => {
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "parent"), {
      queueKey: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect(results[0].params?.queueKey).toBe("parent");
    expect(results[0].params?.stepNumber).toBe(3);
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.subgoalType).toBeUndefined();
    expect(results[0].params?.workspacePrefix).toBe("goals/parent");
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
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", ctx(tempDir, "feat"), { queueKey: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("evolve-plan with explicit stepNumber still routes to execute-task when no subgoal metadata present", () => {
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", ctx(tempDir, "feat"), { queueKey: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(3);
    expect(results[0].params?.workspacePrefix).toBe("goals/feat");
  });
});

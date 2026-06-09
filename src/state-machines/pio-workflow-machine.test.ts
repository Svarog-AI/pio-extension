import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dispatch, unregisterMachine, recordTransition } from "../state-machines";
import { goalDrivenDevelopment } from "./pio-workflow-machine";
import type { TransitionResult } from "../state-machines";
import type { GoalState } from "../goal-state";
import type { PlanFrontmatter, StepMetadata } from "../capabilities/create-plan/schemas";
import type { ReviewOutputs } from "../capabilities/review-task/schemas";

// ---------------------------------------------------------------------------
// Helpers — mock GoalState construction
// ---------------------------------------------------------------------------

/** Build a partial mock GoalState implementing only the methods needed by tests. */
function mockState(overrides: Partial<GoalState>): GoalState {
  return {
    goalName: "test-goal",
    hasGoal: () => false,
    hasPlan: () => false,
    totalPlanSteps: () => undefined,
    steps: () => [],
    currentStepNumber: () => 1,
    pendingTask: () => undefined,
    lastCompleted: () => undefined,
    getReviewOutputs: (_n: number, _opts?: { errors?: boolean }): ReviewOutputs | null | { data?: ReviewOutputs; error?: string } => null,
    planMetadata: (_opts?: { errors?: boolean }): PlanFrontmatter | null | { data?: PlanFrontmatter; error?: string } => null,
    goalCompleted: () => false,
    ...overrides,
  };
}

/** Build a mock step with configurable status and optional metadata. */
function mockStep(
  stepNumber: number,
  statusValue: string,
  overrides?: {
    metadata?: StepMetadata | null;
    revisionNeeded?: boolean;
  },
): NonNullable<ReturnType<GoalState["steps"]>>[number] {
  return {
    stepNumber,
    folderName: `S${String(stepNumber).padStart(2, "0")}`,
    hasTask: () => true,
    hasTest: () => true,
    hasSummary: () => false,
    revisionNeeded: () => overrides?.revisionNeeded ?? false,
    getMetadata: () => overrides?.metadata ?? null,
    taskSkills: () => null,
    status: () => statusValue as ReturnType<NonNullable<ReturnType<GoalState["steps"]>>[number]["status"]>,
  };
}

// ---------------------------------------------------------------------------
// Test setup/teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  // Clean up: unregister goalDrivenDevelopment if it was auto-registered by the import.
  // This prevents interference with other tests that use dispatch(undefined, ...).
  unregisterMachine("goal-driven-development");
});

// ---------------------------------------------------------------------------
// dispatch — create-goal → create-plan
// ---------------------------------------------------------------------------

describe("dispatch — create-goal → create-plan", () => {
  it("returns create-plan with params preserved", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "create-goal", state, { goalName: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "my-feature" },
    });
  });

  it("returns create-plan when params is undefined", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "create-goal", state, undefined);

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
  it("returns evolve-plan with params preserved", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "create-plan", state, { goalName: "my-feature" });

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
  it("returns execute-task with goalName and stepNumber propagated when present", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("falls back to state.currentStepNumber() when stepNumber is missing from params", () => {
    const state = mockState({
      currentStepNumber: () => 3,
    });
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("prefers explicit stepNumber from params over state.currentStepNumber()", () => {
    const state = mockState({
      currentStepNumber: () => 5,
    });
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    // Explicit param takes precedence
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
  it("review-task approval leads to evolve-plan which routes to finalize-goal when complete", () => {
    // Arrange: step 3 is approved AND goal is complete
    const approvedState = mockState({
      steps: () => [mockStep(3, "approved")],
    });
    const completeState = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/chain/test");

    // Act step 1: review-task approval → evolve-plan with incremented stepNumber
    const reviewResults = dispatch(goalDrivenDevelopment, "review-task", approvedState, { goalName: "feat", stepNumber: 3 });

    // Assert step 1: routes to evolve-plan with stepNumber 4
    expect(reviewResults).toHaveLength(1);
    expect(reviewResults[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 4 },
    });

    // Act step 2: evolve-plan with goalCompleted → finalize-goal
    const evolveResults = dispatch(goalDrivenDevelopment, "evolve-plan", completeState, { goalName: "feat", stepNumber: 4 });

    // Assert step 2: routes to finalize-goal with all three params
    expect(evolveResults).toHaveLength(1);
    expect(evolveResults[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      params: {
        goalName: "feat",
        goalDir: "/chain/test/.pio/goals/feat",
        workingDir: "/chain/test",
      },
    });

    cwdSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan completion detection
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan completion detection", () => {
  it("routes to finalize-goal when goal is completed", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/fake/cwd");

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat" });

    // Assert: routes to finalize-goal with goalName, goalDir, and workingDir
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "finalize-goal",
      stateMachineId: "goal-driven-development",
      params: {
        goalName: "feat",
        goalDir: "/fake/cwd/.pio/goals/feat",
        workingDir: "/fake/cwd",
      },
    });

    cwdSpy.mockRestore();
  });

  it("propagates goalName in finalize-goal params", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/test/project");

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "my-feature", stepNumber: 5 });

    // Assert: goalName, goalDir, and workingDir are all propagated in params
    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");
    expect(results[0].params?.goalName).toBe("my-feature");
    expect(results[0].params?.goalDir).toBe("/test/project/.pio/goals/my-feature");
    expect(results[0].params?.workingDir).toBe("/test/project");

    cwdSpy.mockRestore();
  });

  it("includes goalDir computed from resolveGoalDir", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/test/project");

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "my-goal" });

    // Assert: goalDir is computed via resolveGoalDir(cwd, goalName)
    expect(results).toHaveLength(1);
    expect(results[0].params?.goalDir).toBe("/test/project/.pio/goals/my-goal");

    cwdSpy.mockRestore();
  });

  it("includes workingDir set to process.cwd()", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/my/root");

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat" });

    // Assert: workingDir is set to process.cwd() (project root)
    expect(results).toHaveLength(1);
    expect(results[0].params?.workingDir).toBe("/my/root");

    cwdSpy.mockRestore();
  });

  it("routes to execute-task when goal not completed", () => {
    // Arrange: mock state with goalCompleted returning false
    const state = mockState({
      goalCompleted: () => false,
      currentStepNumber: () => 3,
    });

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat" });

    // Assert: normal routing to execute-task
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("routes to execute-task with explicit stepNumber when not completed", () => {
    // Arrange: mock state with goalCompleted returning false, explicit stepNumber in params
    const state = mockState({
      goalCompleted: () => false,
      currentStepNumber: () => 5,
    });

    // Act
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    // Assert: explicit param takes precedence
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
  it("returns review-task with goalName and stepNumber propagated when present", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "execute-task", state, { goalName: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });

  it("falls back to state.currentStepNumber() when stepNumber is missing from params", () => {
    const state = mockState({
      currentStepNumber: () => 4,
    });
    const results = dispatch(goalDrivenDevelopment, "execute-task", state, { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "review-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("prefers explicit stepNumber from params over state.currentStepNumber()", () => {
    const state = mockState({
      currentStepNumber: () => 1,
    });
    const results = dispatch(goalDrivenDevelopment, "execute-task", state, { goalName: "feat", stepNumber: 5 });

    // Explicit param takes precedence
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
  it("routes to evolve-plan with incremented stepNumber when status is approved", () => {
    const state = mockState({
      steps: () => [mockStep(3, "approved")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("preserves goalName while incrementing stepNumber", () => {
    const state = mockState({
      goalName: "my-big-feature",
      steps: () => [mockStep(3, "approved")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "my-big-feature", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-big-feature");
    expect(results[0].params?.stepNumber).toBe(4);
  });

  it("falls back to execute-task when stepNumber is missing from params", () => {
    const state = mockState({
      steps: () => [mockStep(3, "approved")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat" });

    // When stepNumber is null, resolveReviewTaskToEvolvePlan returns undefined.
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
  it("routes to execute-task with same stepNumber when status is rejected", () => {
    const state = mockState({
      steps: () => [mockStep(3, "rejected")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("preserves goalName and same stepNumber when rejected", () => {
    const state = mockState({
      steps: () => [mockStep(2, "rejected")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "my-feature", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
    expect(results[0].params?.stepNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// dispatch — review-task fallback (intentional behavioral change)
// ---------------------------------------------------------------------------

/**
 * BEHAVIORAL CHANGE: The old `transitionReviewTask` had a catch-all fallback:
 * when step status was unknown ("implemented", "blocked") or the step wasn't found,
 * it returned `{ capability: "execute-task" }`. The new framework has exactly two
 * edges from review-task — approved→evolve-plan and rejected→execute-task.
 * There is no third fallback edge.
 *
 * Unknown review statuses now correctly produce no matches (empty array) —
 * treating this as a terminal state rather than implicitly retrying.
 */
describe("dispatch — review-task fallback (behavioral change: empty array)", () => {
  it("returns empty array when steps() returns empty array", () => {
    const state = mockState({
      steps: () => [],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat", stepNumber: 3 });

    // Behavioral change: old code returned { capability: "execute-task" }
    // New framework: no edge fires → empty array (terminal state)
    expect(results).toHaveLength(0);
  });

  it("returns empty array when step status is implemented (COMPLETED but not reviewed)", () => {
    const state = mockState({
      steps: () => [mockStep(3, "implemented")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat", stepNumber: 3 });

    // Behavioral change: old code returned { capability: "execute-task" }
    // New framework: no edge fires → empty array (terminal state)
    expect(results).toHaveLength(0);
  });

  it("returns empty array when step status is blocked", () => {
    const state = mockState({
      steps: () => [mockStep(3, "blocked")],
    });

    const results = dispatch(goalDrivenDevelopment, "review-task", state, { goalName: "feat", stepNumber: 3 });

    // Behavioral change: old code returned { capability: "execute-task" }
    // New framework: no edge fires → empty array (terminal state)
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dispatch — unknown capability
// ---------------------------------------------------------------------------

describe("dispatch — unknown capability", () => {
  it("returns empty array for unknown string", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "nonexistent", state, {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "", state, {});

    expect(results).toHaveLength(0);
  });

  it("returns empty array for finalize-goal with no parentGoalName (no outgoing transition)", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, { goalName: "feat" });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TransitionResult shape consistency
// ---------------------------------------------------------------------------

describe("TransitionResult shape consistency", () => {
  it("results include stateMachineId and params", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "create-goal", state, { goalName: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
    expect(typeof results[0]).toBe("object");
    expect(results[0]).toHaveProperty("capability");
    expect(results[0]).toHaveProperty("stateMachineId");
    expect(results[0]).toHaveProperty("params");
    expect(results[0].stateMachineId).toBe("goal-driven-development");
  });

  it("edge resolve functions return TransitionResult directly (not double-wrapped)", () => {
    const state = mockState({});
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan → revise-plan
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan → revise-plan", () => {
  it("routes to revise-plan when current step has revisionNeeded() returning true", () => {
    const step = mockStep(4, "defined");
    step.revisionNeeded = () => true;
    const state = mockState({
      steps: () => [step],
    });

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("revise-plan");
  });

  it("includes revisionTriggerStep set to current step number", () => {
    const step = mockStep(4, "defined");
    step.revisionNeeded = () => true;
    const state = mockState({
      steps: () => [step],
    });

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.revisionTriggerStep).toBe(4);
  });

  it("preserves goalName in revise-plan params", () => {
    const step = mockStep(4, "defined");
    step.revisionNeeded = () => true;
    const state = mockState({
      steps: () => [step],
    });

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "my-feature", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
  });

  it("falls through to execute-task when revisionNeeded returns false", () => {
    const state = mockState({
      steps: () => [mockStep(4, "defined")],
    });
    // revisionNeeded defaults to false in mockStep

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
  });

  it("falls through to finalize-goal when all steps complete and no revision needed", () => {
    const state = mockState({
      goalCompleted: () => true,
      steps: () => [mockStep(4, "approved")],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/fake/cwd");

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("finalize-goal");

    cwdSpy.mockRestore();
  });

  it("falls through to execute-task when step is not found in state.steps()", () => {
    const state = mockState({
      steps: () => [],
    });

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
  });

  it("falls through to existing behavior when stepNumber is missing from params", () => {
    const state = mockState({
      currentStepNumber: () => 3,
    });

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — revise-plan → evolve-plan
// ---------------------------------------------------------------------------

describe("dispatch — revise-plan → evolve-plan", () => {
  it("routes to evolve-plan after revise-plan completes", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "revise-plan", state, { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
  });

  it("preserves goalName in evolve-plan params", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "revise-plan", state, { goalName: "my-feature" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-feature");
  });

  it("does not pass explicit stepNumber (let evolve-plan discover next step)", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "revise-plan", state, { goalName: "feat" });

    expect(results).toHaveLength(1);
    expect(results[0].params?.stepNumber).toBeUndefined();
  });

  it("preserves revisionTriggerStep if present in params", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "revise-plan", state, { goalName: "feat", revisionTriggerStep: 4 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.revisionTriggerStep).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// recordTransition — file creation
// ---------------------------------------------------------------------------

describe("recordTransition — file creation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates transitions.json with a single-entry JSON array", () => {
    const result: TransitionResult = { capability: "evolve-plan", stateMachineId: "goal-driven-development", params: { stepNumber: 2 } };
    recordTransition(tempDir, "create-plan", result);

    const content = fs.readFileSync(path.join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].from).toBe("create-plan");
    expect(entries[0].to).toBe("evolve-plan");
    expect(entries[0].params).toEqual({ stepNumber: 2 });
    expect(typeof entries[0].timestamp).toBe("string");
  });

  it("entry contains ISO timestamp", () => {
    const result: TransitionResult = { capability: "execute-task", stateMachineId: "goal-driven-development" };
    recordTransition(tempDir, "evolve-plan", result);

    const content = fs.readFileSync(path.join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    // Verify it's a valid ISO date string
    expect(() => new Date(entries[0].timestamp)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordTransition — append to existing
// ---------------------------------------------------------------------------

describe("recordTransition — append to existing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("second call appends to the existing JSON array", () => {
    recordTransition(tempDir, "create-goal", { capability: "create-plan", stateMachineId: "goal-driven-development" });
    recordTransition(tempDir, "create-plan", { capability: "evolve-plan", stateMachineId: "goal-driven-development" });

    const content = fs.readFileSync(path.join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(2);
    expect(entries[0].from).toBe("create-goal");
    expect(entries[1].from).toBe("create-plan");
  });

  it("subsequent calls continue appending (entry count matches call count)", () => {
    for (let i = 0; i < 5; i++) {
      recordTransition(tempDir, "capability", { capability: "next", stateMachineId: "goal-driven-development" });
    }

    const content = fs.readFileSync(path.join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// recordTransition — error handling
// ---------------------------------------------------------------------------

describe("recordTransition — error handling", () => {
  it("does not throw when goalDir is unwritable", () => {
    // Use a path that doesn't exist and isn't creatable
    const unwritablePath = "/nonexistent/path/that/cannot/be/created/transitions.json";

    expect(() => {
      recordTransition(unwritablePath, "test-cap", { capability: "next", stateMachineId: "goal-driven-development" });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordTransition — isolation from dispatch
// ---------------------------------------------------------------------------

describe("recordTransition isolation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("calling recordTransition does not affect subsequent dispatch calls", () => {
    const state = mockState({});

    // Call recordTransition (real I/O)
    recordTransition(tempDir, "test-cap", { capability: "next", stateMachineId: "goal-driven-development" });

    // Verify dispatch still works correctly with mock state
    const results = dispatch(goalDrivenDevelopment, "create-goal", state, { goalName: "test" });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      capability: "create-plan",
      stateMachineId: "goal-driven-development",
      params: { goalName: "test" },
    });
  });
});

// ---------------------------------------------------------------------------
// dispatch — evolve-plan → create-goal (subgoal spawning)
// ---------------------------------------------------------------------------

describe("dispatch — evolve-plan → create-goal (subgoal)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-subgoal-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("routes to create-goal when step has complexity: 'subgoal' in metadata", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "nested-feature", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("create-goal");

    cwdSpy.mockRestore();
  });

  it("includes parentGoalName, parentStepNumber, and subgoalType: true in returned params", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "child-goal", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.parentGoalName).toBe("parent");
    expect(results[0].params?.parentStepNumber).toBe(2);
    expect(results[0].params?.subgoalType).toBe(true);

    cwdSpy.mockRestore();
  });

  it("includes explicit workingDir matching <cwd>/.pio/goals/<parent>/S{NN}/subgoals/<name>", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "nested-child", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.workingDir).toBe(
      path.join(tempDir, ".pio", "goals", "parent", "S02", "subgoals", "nested-child"),
    );

    cwdSpy.mockRestore();
  });

  it("uses the step name from metadata as the subgoal goalName in params", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "my-subgoal-name", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-subgoal-name");

    cwdSpy.mockRestore();
  });

  it("routes to execute-task when step has complexity: 'task' (backward compatible)", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "regular-step", complexity: "task" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(2);

    cwdSpy.mockRestore();
  });

  it("routes to execute-task when getMetadata returns null (no frontmatter, backward compatible)", () => {
    // getMetadata returns null — no subgoal metadata
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [mockStep(2, "pending", { metadata: null })],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(2);

    cwdSpy.mockRestore();
  });

  it("routes to revise-plan when revisionNeeded() is true even for subgoal steps (revision check takes priority)", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", {
          metadata: { name: "nested-child", complexity: "subgoal" },
          revisionNeeded: true,
        }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("revise-plan");
    expect(results[0].params?.revisionTriggerStep).toBe(2);

    cwdSpy.mockRestore();
  });

  it("includes initialMessage with relative TASK.md path when routing to create-goal for subgoal steps", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(3, "pending", { metadata: { name: "nested-feature", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].params?.initialMessage).toBeDefined();
    expect(typeof results[0].params?.initialMessage).toBe("string");
    expect(results[0].params?.initialMessage).toContain("TASK.md");
    expect(results[0].params?.initialMessage).toContain("subgoal");

    cwdSpy.mockRestore();
  });

  it("initialMessage relative path resolves from subgoal workspace to parent step TASK.md", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(3, "pending", { metadata: { name: "child-goal", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 3 });

    expect(results).toHaveLength(1);
    const initialMessage = results[0].params?.initialMessage as string;
    // Extract the relative path from the message
    const pathMatch = initialMessage.match(/Read\s+(.+?)\s+from/);
    expect(pathMatch).not.toBeNull();
    const relativePath = pathMatch![1];

    // Verify the relative path resolves correctly
    const subgoalWorkingDir = results[0].params?.workingDir as string;
    const resolvedPath = path.resolve(subgoalWorkingDir, relativePath);
    const expectedPath = path.join(tempDir, ".pio", "goals", "parent", "S03", "TASK.md");
    expect(resolvedPath).toBe(expectedPath);

    cwdSpy.mockRestore();
  });

  it("does not include initialMessage for regular task steps", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "regular-step", complexity: "task" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.initialMessage).toBeUndefined();

    cwdSpy.mockRestore();
  });

  it("initialMessage uses path.relative for platform-portable path construction", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(1, "pending", { metadata: { name: "deeply-nested", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 1 });

    expect(results).toHaveLength(1);
    const initialMessage = results[0].params?.initialMessage as string;
    // The relative path should use path.sep (platform-specific)
    // On POSIX it should be ../../TASK.md
    const pathMatch = initialMessage.match(/Read\s+(.+?)\s+from/);
    expect(pathMatch).not.toBeNull();
    const relativePath = pathMatch![1];
    // path.relative produces platform-specific separators — verify it resolves correctly
    const subgoalWorkingDir = results[0].params?.workingDir as string;
    const resolvedPath = path.resolve(subgoalWorkingDir, relativePath);
    expect(resolvedPath).toContain("TASK.md");

    cwdSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// dispatch — finalize-goal completion propagation
// ---------------------------------------------------------------------------

describe("dispatch — finalize-goal completion propagation", () => {
  it("routes to evolve-plan for parent with stepNumber: parentStepNumber + 1", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
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
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
      goalName: "child-goal",
      parentGoalName: "my-parent",
      parentStepNumber: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.goalName).toBe("my-parent");
  });

  it("does NOT include parentGoalName or parentStepNumber in returned params (param pollution prevention)", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
      goalName: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.parentStepNumber).toBeUndefined();
  });

  it("does NOT include subgoalType in returned params", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
      goalName: "child",
      parentGoalName: "parent",
      parentStepNumber: 3,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].params?.subgoalType).toBeUndefined();
  });

  it("returns empty array when no parentGoalName (top-level goal, backward compatible)", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, { goalName: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when parentGoalName is not a string (type guard)", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
      goalName: "child",
      parentGoalName: 123,
      parentStepNumber: 3,
    });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dispatch — subgoal lifecycle (integration)
// ---------------------------------------------------------------------------

describe("dispatch — subgoal lifecycle", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-lifecycle-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("evolve-plan on subgoal step → create-goal", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [
        mockStep(2, "pending", { metadata: { name: "nested-feature", complexity: "subgoal" } }),
      ],
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "parent", stepNumber: 2 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("create-goal");
    expect(results[0].params?.goalName).toBe("nested-feature");
    expect(results[0].params?.parentGoalName).toBe("parent");
    expect(results[0].params?.parentStepNumber).toBe(2);
    expect(results[0].params?.subgoalType).toBe(true);

    cwdSpy.mockRestore();
  });

  it("create-goal → create-plan (existing behavior, no change)", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "create-goal", state, {
      goalName: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("create-plan");
    // Params preserved as-is through create-goal
    expect(results[0].params?.parentGoalName).toBe("parent");
  });

  it("finalize-goal with parent context → evolve-plan for parent with incremented step number", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, {
      goalName: "nested-feature",
      parentGoalName: "parent",
      parentStepNumber: 2,
      subgoalType: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("evolve-plan");
    expect(results[0].params?.goalName).toBe("parent");
    expect(results[0].params?.stepNumber).toBe(3);
    // No param pollution
    expect(results[0].params?.parentGoalName).toBeUndefined();
    expect(results[0].params?.subgoalType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dispatch — backward compatibility (finalize-goal)
// ---------------------------------------------------------------------------

describe("dispatch — backward compatibility", () => {
  it("finalize-goal without parentGoalName still returns empty array", () => {
    const state = mockState({});

    const results = dispatch(goalDrivenDevelopment, "finalize-goal", state, { goalName: "my-feature" });

    expect(results).toHaveLength(0);
  });

  it("evolve-plan with explicit stepNumber still routes to execute-task when no subgoal metadata present", () => {
    const state = mockState({
      goalCompleted: () => false,
      steps: () => [mockStep(3, "pending", { metadata: null })],
    });

    // getMetadata returns null — no subgoal metadata, falls through to execute-task
    const results = dispatch(goalDrivenDevelopment, "evolve-plan", state, { goalName: "feat", stepNumber: 3 });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("execute-task");
    expect(results[0].params?.stepNumber).toBe(3);
  });
});

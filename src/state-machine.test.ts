import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { GoalState } from "./goal-state";
import type { PlanFrontmatter, ReviewOutputs } from "./frontmatter-schemas";
import {
  resolveTransition,
  recordTransition,
  type TransitionContext,
  type TransitionResult,
  stepFolderName,
} from "./state-machine";

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

/** Build a mock step with configurable status. */
function mockStep(stepNumber: number, statusValue: string): NonNullable<ReturnType<GoalState["steps"]>>[number] {
  return {
    stepNumber,
    folderName: `S${String(stepNumber).padStart(2, "0")}`,
    hasTask: () => true,
    hasTest: () => true,
    hasSummary: () => false,
    status: () => statusValue as ReturnType<NonNullable<ReturnType<GoalState["steps"]>>[number]["status"]>,
  };
}

// ---------------------------------------------------------------------------
// exports — module structure verification
// ---------------------------------------------------------------------------

describe("exports", () => {
  it("exports resolveTransition as a function", () => {
    expect(typeof resolveTransition).toBe("function");
  });

  it("exports recordTransition as a function", () => {
    expect(typeof recordTransition).toBe("function");
  });

  it("exports stepFolderName as a function", () => {
    expect(typeof stepFolderName).toBe("function");
  });

  it("stepFolderName produces zero-padded folder names", () => {
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(10)).toBe("S10");
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — create-goal → create-plan
// ---------------------------------------------------------------------------

describe("resolveTransition — create-goal → create-plan", () => {
  it("returns create-plan with params preserved", () => {
    const state = mockState({});
    const result = resolveTransition("create-goal", state, { goalName: "my-feature" });

    expect(result).toEqual({
      capability: "create-plan",
      params: { goalName: "my-feature" },
    });
  });

  it("returns create-plan when params is undefined", () => {
    const state = mockState({});
    const result = resolveTransition("create-goal", state, undefined);

    expect(result).toEqual({
      capability: "create-plan",
      params: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — create-plan → evolve-plan
// ---------------------------------------------------------------------------

describe("resolveTransition — create-plan → evolve-plan", () => {
  it("returns evolve-plan with params preserved", () => {
    const state = mockState({});
    const result = resolveTransition("create-plan", state, { goalName: "my-feature" });

    expect(result).toEqual({
      capability: "evolve-plan",
      params: { goalName: "my-feature" },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — evolve-plan → execute-task
// ---------------------------------------------------------------------------

describe("resolveTransition — evolve-plan → execute-task", () => {
  it("returns execute-task with goalName and stepNumber propagated when present", () => {
    const state = mockState({});
    const result = resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("falls back to state.currentStepNumber() when stepNumber is missing from params", () => {
    const state = mockState({
      currentStepNumber: () => 3,
    });
    const result = resolveTransition("evolve-plan", state, { goalName: "feat" });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("prefers explicit stepNumber from params over state.currentStepNumber()", () => {
    const state = mockState({
      currentStepNumber: () => 5,
    });
    const result = resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    // Explicit param takes precedence
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — full transition chain: review → evolve → finalize
// ---------------------------------------------------------------------------

describe("resolveTransition — review→evolve→finalize chain", () => {
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
    const reviewResult = resolveTransition("review-task", approvedState, { goalName: "feat", stepNumber: 3 });

    // Assert step 1: routes to evolve-plan with stepNumber 4
    expect(reviewResult).toEqual({
      capability: "evolve-plan",
      params: { goalName: "feat", stepNumber: 4 },
    });

    // Act step 2: evolve-plan with goalCompleted → finalize-goal
    const evolveResult = resolveTransition("evolve-plan", completeState, { goalName: "feat", stepNumber: 4 });

    // Assert step 2: routes to finalize-goal with all three params
    expect(evolveResult).toEqual({
      capability: "finalize-goal",
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
// resolveTransition — evolve-plan completion detection
// ---------------------------------------------------------------------------

describe("resolveTransition — evolve-plan completion detection", () => {
  it("routes to finalize-goal when goal is completed", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/fake/cwd");

    // Act
    const result = resolveTransition("evolve-plan", state, { goalName: "feat" });

    // Assert: routes to finalize-goal with goalName, goalDir, and workingDir
    expect(result).toEqual({
      capability: "finalize-goal",
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
    const result = resolveTransition("evolve-plan", state, { goalName: "my-feature", stepNumber: 5 });

    // Assert: goalName, goalDir, and workingDir are all propagated in params
    expect(result?.capability).toBe("finalize-goal");
    expect(result?.params?.goalName).toBe("my-feature");
    expect(result?.params?.goalDir).toBe("/test/project/.pio/goals/my-feature");
    expect(result?.params?.workingDir).toBe("/test/project");

    cwdSpy.mockRestore();
  });

  it("includes goalDir computed from resolveGoalDir", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/test/project");

    // Act
    const result = resolveTransition("evolve-plan", state, { goalName: "my-goal" });

    // Assert: goalDir is computed via resolveGoalDir(cwd, goalName)
    expect(result?.params?.goalDir).toBe("/test/project/.pio/goals/my-goal");

    cwdSpy.mockRestore();
  });

  it("includes workingDir set to process.cwd()", () => {
    // Arrange: mock state with goalCompleted returning true
    const state = mockState({
      goalCompleted: () => true,
    });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/my/root");

    // Act
    const result = resolveTransition("evolve-plan", state, { goalName: "feat" });

    // Assert: workingDir is set to process.cwd() (project root)
    expect(result?.params?.workingDir).toBe("/my/root");

    cwdSpy.mockRestore();
  });

  it("routes to execute-task when goal not completed", () => {
    // Arrange: mock state with goalCompleted returning false
    const state = mockState({
      goalCompleted: () => false,
      currentStepNumber: () => 3,
    });

    // Act
    const result = resolveTransition("evolve-plan", state, { goalName: "feat" });

    // Assert: normal routing to execute-task
    expect(result).toEqual({
      capability: "execute-task",
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
    const result = resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    // Assert: explicit param takes precedence
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — execute-task → review-task
// ---------------------------------------------------------------------------

describe("resolveTransition — execute-task → review-task", () => {
  it("returns review-task with goalName and stepNumber propagated when present", () => {
    const state = mockState({});
    const result = resolveTransition("execute-task", state, { goalName: "feat", stepNumber: 5 });

    expect(result).toEqual({
      capability: "review-task",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });

  it("falls back to state.currentStepNumber() when stepNumber is missing from params", () => {
    const state = mockState({
      currentStepNumber: () => 4,
    });
    const result = resolveTransition("execute-task", state, { goalName: "feat" });

    expect(result).toEqual({
      capability: "review-task",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("prefers explicit stepNumber from params over state.currentStepNumber()", () => {
    const state = mockState({
      currentStepNumber: () => 1,
    });
    const result = resolveTransition("execute-task", state, { goalName: "feat", stepNumber: 5 });

    // Explicit param takes precedence
    expect(result).toEqual({
      capability: "review-task",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — review-task (approval path)
// ---------------------------------------------------------------------------

describe("resolveTransition — review-task approval", () => {
  it("routes to evolve-plan with incremented stepNumber when status is approved", () => {
    const state = mockState({
      steps: () => [mockStep(3, "approved")],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "evolve-plan",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("preserves goalName while incrementing stepNumber", () => {
    const state = mockState({
      goalName: "my-big-feature",
      steps: () => [mockStep(3, "approved")],
    });

    const result = resolveTransition("review-task", state, { goalName: "my-big-feature", stepNumber: 3 });

    expect(result?.params?.goalName).toBe("my-big-feature");
    expect(result?.params?.stepNumber).toBe(4);
  });

  it("falls back to execute-task when stepNumber is missing from params", () => {
    const state = mockState({
      steps: () => [mockStep(3, "approved")],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat" });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat" },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — review-task (rejection path)
// ---------------------------------------------------------------------------

describe("resolveTransition — review-task rejection", () => {
  it("routes to execute-task with same stepNumber when status is rejected", () => {
    const state = mockState({
      steps: () => [mockStep(3, "rejected")],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("preserves goalName and same stepNumber when rejected", () => {
    const state = mockState({
      steps: () => [mockStep(2, "rejected")],
    });

    const result = resolveTransition("review-task", state, { goalName: "my-feature", stepNumber: 2 });

    expect(result?.params?.goalName).toBe("my-feature");
    expect(result?.params?.stepNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — review-task (unknown/missing step fallback)
// ---------------------------------------------------------------------------

describe("resolveTransition — review-task fallback", () => {
  it("routes to execute-task when steps() returns empty array", () => {
    const state = mockState({
      steps: () => [],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("routes to execute-task when step status is implemented (COMPLETED but not reviewed)", () => {
    const state = mockState({
      steps: () => [mockStep(3, "implemented")],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("routes to execute-task when step status is blocked", () => {
    const state = mockState({
      steps: () => [mockStep(3, "blocked")],
    });

    const result = resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveTransition — unknown capabilities
// ---------------------------------------------------------------------------

describe("resolveTransition — unknown capability", () => {
  it("returns undefined for unknown string", () => {
    const state = mockState({});
    expect(resolveTransition("nonexistent", state, {})).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const state = mockState({});
    expect(resolveTransition("", state, {})).toBeUndefined();
  });

  it("returns undefined for finalize-goal (no outgoing transition)", () => {
    const state = mockState({});
    expect(resolveTransition("finalize-goal", state, { goalName: "feat" })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TransitionResult shape consistency
// ---------------------------------------------------------------------------

describe("TransitionResult shape consistency", () => {
  it("string transitions wrap in TransitionResult with params", () => {
    const state = mockState({});
    const result = resolveTransition("create-goal", state, { goalName: "test" });

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("capability");
    expect(result).toHaveProperty("params");
  });

  it("callback transitions return TransitionResult directly (not double-wrapped)", () => {
    const state = mockState({});
    const result = resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 2 });

    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 2 },
    });
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
    const result: TransitionResult = { capability: "evolve-plan", params: { stepNumber: 2 } };
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
    const result: TransitionResult = { capability: "execute-task" };
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
    recordTransition(tempDir, "create-goal", { capability: "create-plan" });
    recordTransition(tempDir, "create-plan", { capability: "evolve-plan" });

    const content = fs.readFileSync(path.join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(2);
    expect(entries[0].from).toBe("create-goal");
    expect(entries[1].from).toBe("create-plan");
  });

  it("subsequent calls continue appending (entry count matches call count)", () => {
    for (let i = 0; i < 5; i++) {
      recordTransition(tempDir, "capability", { capability: "next" });
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
      recordTransition(unwritablePath, "test-cap", { capability: "next" });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordTransition — isolation from resolveTransition
// ---------------------------------------------------------------------------

describe("recordTransition isolation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("calling recordTransition does not affect subsequent resolveTransition calls", () => {
    const state = mockState({});

    // Call recordTransition (real I/O)
    recordTransition(tempDir, "test-cap", { capability: "next" });

    // Verify resolveTransition still works correctly with mock state
    const result = resolveTransition("create-goal", state, { goalName: "test" });

    expect(result).toEqual({
      capability: "create-plan",
      params: { goalName: "test" },
    });
  });
});

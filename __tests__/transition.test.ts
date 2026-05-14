import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CAPABILITY_TRANSITIONS,
  resolveNextCapability,
  type TransitionContext,
} from "../src/transitions";
import { stepFolderName } from "../src/utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (mirrors step-discovery.test.ts pattern)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-transition-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with optional marker files in the step folder.
function createGoalTree(
  tempDir: string,
  goalName: string,
  stepNumber?: number,
  approved: boolean = false,
  rejected: boolean = false,
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  if (stepNumber != null) {
    const folderName = stepFolderName(stepNumber);
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });

    if (approved) {
      fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    }
    if (rejected) {
      fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
    }
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// CAPABILITY_TRANSITIONS structure — static shape verification
// ---------------------------------------------------------------------------

describe("CAPABILITY_TRANSITIONS structure", () => {
  it("maps create-goal to create-plan", () => {
    expect(CAPABILITY_TRANSITIONS["create-goal"]).toBe("create-plan");
  });

  it("maps create-plan to evolve-plan", () => {
    expect(CAPABILITY_TRANSITIONS["create-plan"]).toBe("evolve-plan");
  });

  it("maps evolve-plan to a resolver function", () => {
    expect(typeof CAPABILITY_TRANSITIONS["evolve-plan"]).toBe("function");
  });

  it("maps execute-task to a resolver function", () => {
    expect(typeof CAPABILITY_TRANSITIONS["execute-task"]).toBe("function");
  });

  it("maps review-code to a resolver function", () => {
    expect(typeof CAPABILITY_TRANSITIONS["review-code"]).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — create-goal → create-plan
// ---------------------------------------------------------------------------

describe("resolveNextCapability — create-goal → create-plan", () => {
  it("returns create-plan with params preserved", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "create-goal",
      workingDir: "/tmp/test",
      params: { goalName: "my-feature" },
    };

    // Act
    const result = resolveNextCapability("create-goal", ctx);

    // Assert
    expect(result).toEqual({
      capability: "create-plan",
      params: { goalName: "my-feature" },
    });
  });

  it("returns create-plan when params is undefined", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "create-goal",
      workingDir: "/tmp/test",
    };

    // Act
    const result = resolveNextCapability("create-goal", ctx);

    // Assert
    expect(result).toEqual({
      capability: "create-plan",
      params: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — create-plan → evolve-plan
// ---------------------------------------------------------------------------

describe("resolveNextCapability — create-plan → evolve-plan", () => {
  it("returns evolve-plan with params preserved", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "create-plan",
      workingDir: "/tmp/test",
      params: { goalName: "my-feature" },
    };

    // Act
    const result = resolveNextCapability("create-plan", ctx);

    // Assert
    expect(result).toEqual({
      capability: "evolve-plan",
      params: { goalName: "my-feature" },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — evolve-plan → execute-task
// ---------------------------------------------------------------------------

describe("resolveNextCapability — evolve-plan → execute-task", () => {
  it("returns execute-task with goalName and stepNumber when stepNumber is present", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "evolve-plan",
      workingDir: "/tmp/test",
      params: { goalName: "feat", stepNumber: 3 },
    };

    // Act
    const result = resolveNextCapability("evolve-plan", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("returns execute-task with original params when stepNumber is missing", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "evolve-plan",
      workingDir: "/tmp/test",
      params: { goalName: "feat" },
    };

    // Act
    const result = resolveNextCapability("evolve-plan", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat" },
    });
  });

  it("returns execute-task with undefined params when ctx has no params", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "evolve-plan",
      workingDir: "/tmp/test",
    };

    // Act
    const result = resolveNextCapability("evolve-plan", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — execute-task → review-code
// ---------------------------------------------------------------------------

describe("resolveNextCapability — execute-task → review-code", () => {
  it("returns review-code with goalName and stepNumber when stepNumber is present", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "execute-task",
      workingDir: "/tmp/test",
      params: { goalName: "feat", stepNumber: 5 },
    };

    // Act
    const result = resolveNextCapability("execute-task", ctx);

    // Assert
    expect(result).toEqual({
      capability: "review-code",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });

  it("returns review-code with original params when stepNumber is missing", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "execute-task",
      workingDir: "/tmp/test",
      params: { goalName: "feat" },
    };

    // Act
    const result = resolveNextCapability("execute-task", ctx);

    // Assert
    expect(result).toEqual({
      capability: "review-code",
      params: { goalName: "feat" },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — review-code (approval path)
// ---------------------------------------------------------------------------

describe("resolveNextCapability — review-code (approval path)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns evolve-plan with incremented stepNumber when APPROVED exists", () => {
    // Arrange: S03/APPROVED exists on disk
    const goalDir = createGoalTree(tempDir, "feat", 3, true);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "feat", stepNumber: 3 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result).toEqual({
      capability: "evolve-plan",
      params: { goalName: "feat", stepNumber: 4 },
    });
  });

  it("preserves goalName while incrementing stepNumber", () => {
    // Arrange: S03/APPROVED exists on disk
    const goalDir = createGoalTree(tempDir, "my-big-feature", 3, true);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "my-big-feature", stepNumber: 3 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result?.params?.goalName).toBe("my-big-feature");
    expect(result?.params?.stepNumber).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — review-code (rejection path)
// ---------------------------------------------------------------------------

describe("resolveNextCapability — review-code (rejection path)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns execute-task with same stepNumber when APPROVED missing", () => {
    // Arrange: S03 exists but no APPROVED file (step folder created without approved)
    const goalDir = createGoalTree(tempDir, "feat", 3, false);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "feat", stepNumber: 3 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("returns execute-task string when no stepNumber present", () => {
    // Arrange: no stepNumber in params (falls back to plain string path)
    const goalDir = createGoalTree(tempDir, "feat");

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "feat" },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat" },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — review-code (REJECTED marker routing)
// ---------------------------------------------------------------------------

describe("resolveNextCapability — review-code (REJECTED marker routing)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns execute-task when REJECTED exists", () => {
    // Arrange: S03/REJECTED exists on disk
    const goalDir = createGoalTree(tempDir, "feat", 3, false, true);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "feat", stepNumber: 3 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 3 },
    });
  });

  it("preserves goalName when REJECTED routes to execute-task", () => {
    // Arrange: S02/REJECTED with a descriptive goal name
    const goalDir = createGoalTree(tempDir, "my-feature", 2, false, true);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "my-feature", stepNumber: 2 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert
    expect(result?.params?.goalName).toBe("my-feature");
    expect(result?.params?.stepNumber).toBe(2);
  });

  it("REJECTED takes precedence when both APPROVED and REJECTED exist", () => {
    // Arrange: S05/ contains both APPROVED and REJECTED
    const goalDir = createGoalTree(tempDir, "feat", 5, true, true);

    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: { goalName: "feat", stepNumber: 5 },
    };

    // Act
    const result = resolveNextCapability("review-code", ctx);

    // Assert: rejection wins — routes back to execute-task, not evolve-plan
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// resolveNextCapability — unknown capabilities
// ---------------------------------------------------------------------------

describe("resolveNextCapability — unknown capabilities", () => {
  it("returns undefined for unknown capability name", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "nonexistent",
      workingDir: "/tmp/test",
    };

    // Act
    const result = resolveNextCapability("nonexistent", ctx);

    // Assert
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty string capability", () => {
    // Arrange
    const ctx: TransitionContext = {
      capability: "",
      workingDir: "/tmp/test",
    };

    // Act
    const result = resolveNextCapability("", ctx);

    // Assert
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TransitionResult shape consistency
// ---------------------------------------------------------------------------

describe("TransitionResult shape consistency", () => {
  it("string transitions wrap in TransitionResult with params", () => {
    // Arrange: create-goal is a string-valued transition
    const ctx: TransitionContext = {
      capability: "create-goal",
      workingDir: "/tmp/test",
      params: { goalName: "test" },
    };

    // Act
    const result = resolveNextCapability("create-goal", ctx);

    // Assert: should be a TransitionResult object with both keys
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("capability");
    expect(result).toHaveProperty("params");
  });

  it("callback transitions returning TransitionResult pass through unchanged", () => {
    // Arrange: evolve-plan with stepNumber returns a TransitionResult from the callback
    const ctx: TransitionContext = {
      capability: "evolve-plan",
      workingDir: "/tmp/test",
      params: { goalName: "feat", stepNumber: 2 },
    };

    // Act
    const result = resolveNextCapability("evolve-plan", ctx);

    // Assert: exact TransitionResult from callback, not double-wrapped
    expect(result).toEqual({
      capability: "execute-task",
      params: { goalName: "feat", stepNumber: 2 },
    });
  });

  it("increment does not mutate original ctx.params", () => {
    // Arrange: S03/APPROVED exists, params has stepNumber 3
    const tempDir = createTempDir();
    const goalDir = createGoalTree(tempDir, "feat", 3, true);

    const originalParams = { goalName: "feat", stepNumber: 3 };
    const ctx: TransitionContext = {
      capability: "review-code",
      workingDir: goalDir,
      params: originalParams,
    };

    // Act
    resolveNextCapability("review-code", ctx);

    // Assert: original params should be unchanged (immutability)
    expect(originalParams.stepNumber).toBe(3);

    cleanup(tempDir);
  });
});

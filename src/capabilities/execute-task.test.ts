import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CAPABILITY_CONFIG } from "./execute-task";
import { isStepReady } from "./execute-task";
import { stepFolderName } from "../fs-utils";

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

  return { goalDir, stepDir };
}

// ---------------------------------------------------------------------------
// defaultInitialMessage — rejection feedback channel
// ---------------------------------------------------------------------------

describe("defaultInitialMessage — rejection feedback channel", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("includes REVIEW.md reference when REJECTED marker exists", () => {
    // Arrange: S02/REJECTED present on disk
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 2, rejected: true });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 2 });

    // Assert
    expect(message).toContain("REVIEW.md");
    expect(message).toContain("S02");
  });

  it("mentions re-execution context when REJECTED marker exists", () => {
    // Arrange: S02/REJECTED present on disk
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 2, rejected: true });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 2 });

    // Assert: message indicates this is a re-execution scenario
    const hasReExecutionLanguage =
      message.toLowerCase().includes("rejected") ||
      message.toLowerCase().includes("re-execution") ||
      message.toLowerCase().includes("previously rejected");
    expect(hasReExecutionLanguage).toBe(true);
  });

  it("does not include rejection message when REJECTED marker absent", () => {
    // Arrange: S01/ with TASK.md and TEST.md but no REJECTED
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1, rejected: false });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 1 });

    // Assert
    expect(message).not.toContain("REVIEW.md");
  });

  it("normal message is present when no rejection", () => {
    // Arrange: S01/ with no REJECTED marker
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1, rejected: false });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 1 });

    // Assert: standard instructions should be present
    expect(message).toContain("TASK.md");
    expect(message).toContain("TEST.md");
  });

  it("handles missing stepNumber gracefully (error message unchanged)", () => {
    // Arrange: no stepNumber in params
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1, rejected: false });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, {});

    // Assert: should return an error message about missing stepNumber, not crash
    expect(message).toContain("stepNumber");
    expect(message.toLowerCase()).toContain("error");
  });

  it("handles non-existent step folder (no REJECTED) — normal message", () => {
    // Arrange: goal dir exists but no S03/ subdirectory at all
    const { goalDir } = createGoalTree(tempDir, "test-goal");

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 3 });

    // Assert: fs.existsSync returns false for non-existent path → normal (non-rejection) message
    expect(message).not.toContain("REVIEW.md");
    expect(message).toContain("TASK.md");
  });

  it("zero-padded step number in rejection message", () => {
    // Arrange: S05/REJECTED
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 5, rejected: true });

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 5 });

    // Assert: should reference "S05" (zero-padded), not "S5"
    expect(message).toContain("S05");
    expect(message).not.toContain(" S5");
  });
});

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

  it("missing TEST.md → false", () => {
    // Arrange: S01 with only TASK.md
    const { goalDir } = createGoalTree(tempDir, "no-test-goal", {
      steps: [{ number: 1, files: ["TASK.md"] }],
    });

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
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

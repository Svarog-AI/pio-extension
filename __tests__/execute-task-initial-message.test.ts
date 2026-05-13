import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CAPABILITY_CONFIG } from "../src/capabilities/execute-task";
import { stepFolderName } from "../src/utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (mirrors step-discovery.test.ts pattern)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-execute-task-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with optional marker files in the step folder.
function createGoalTree(
  tempDir: string,
  goalName: string,
  stepNumber?: number,
  rejected: boolean = false,
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  if (stepNumber != null) {
    const folderName = stepFolderName(stepNumber);
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });

    if (rejected) {
      fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");
    }
  }

  return goalDir;
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
    const goalDir = createGoalTree(tempDir, "test-goal", 2, true);

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 2 });

    // Assert
    expect(message).toContain("REVIEW.md");
    expect(message).toContain("S02");
  });

  it("mentions re-execution context when REJECTED marker exists", () => {
    // Arrange: S02/REJECTED present on disk
    const goalDir = createGoalTree(tempDir, "test-goal", 2, true);

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
    const goalDir = createGoalTree(tempDir, "test-goal", 1, false);

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 1 });

    // Assert
    expect(message).not.toContain("REVIEW.md");
  });

  it("normal message is present when no rejection", () => {
    // Arrange: S01/ with no REJECTED marker
    const goalDir = createGoalTree(tempDir, "test-goal", 1, false);

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 1 });

    // Assert: standard instructions should be present
    expect(message).toContain("TASK.md");
    expect(message).toContain("TEST.md");
  });

  it("handles missing stepNumber gracefully (error message unchanged)", () => {
    // Arrange: no stepNumber in params
    const goalDir = createGoalTree(tempDir, "test-goal", 1, false);

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, {});

    // Assert: should return an error message about missing stepNumber, not crash
    expect(message).toContain("stepNumber");
    expect(message.toLowerCase()).toContain("error");
  });

  it("handles non-existent step folder (no REJECTED) — normal message", () => {
    // Arrange: goal dir exists but no S03/ subdirectory at all
    const goalDir = createGoalTree(tempDir, "test-goal");

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 3 });

    // Assert: fs.existsSync returns false for non-existent path → normal (non-rejection) message
    expect(message).not.toContain("REVIEW.md");
    expect(message).toContain("TASK.md");
  });

  it("zero-padded step number in rejection message", () => {
    // Arrange: S05/REJECTED
    const goalDir = createGoalTree(tempDir, "test-goal", 5, true);

    // Act
    const message = CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { stepNumber: 5 });

    // Assert: should reference "S05" (zero-padded), not "S5"
    expect(message).toContain("S05");
    expect(message).not.toContain(" S5");
  });
});

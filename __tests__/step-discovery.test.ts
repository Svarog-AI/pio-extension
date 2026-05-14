import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isStepReady } from "../src/capabilities/execute-task";
import { isStepReviewable, findMostRecentCompletedStep } from "../src/capabilities/review-code";
import { stepFolderName } from "../src/fs-utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with specified step folders.
// Each entry in `steps` specifies which files to create inside the step folder.
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
    const goalDir = createGoalTree(tempDir, "ready-goal", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(true);
  });

  it("missing TASK.md → false", () => {
    // Arrange: S01 with only TEST.md
    const goalDir = createGoalTree(tempDir, "no-task-goal", [
      { number: 1, files: ["TEST.md"] },
    ]);

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("missing TEST.md → false", () => {
    // Arrange: S01 with only TASK.md
    const goalDir = createGoalTree(tempDir, "no-test-goal", [
      { number: 1, files: ["TASK.md"] },
    ]);

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("both specs + COMPLETED marker → false", () => {
    // Arrange: S01 with both spec files and COMPLETED marker
    const goalDir = createGoalTree(tempDir, "completed-goal", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("both specs + BLOCKED marker → false", () => {
    // Arrange: S01 with both spec files and BLOCKED marker
    const goalDir = createGoalTree(tempDir, "blocked-goal", [
      { number: 1, files: ["TASK.md", "TEST.md", "BLOCKED"] },
    ]);

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("step folder does not exist → false", () => {
    // Arrange: goal dir exists but no S01/ subdirectory
    const goalDir = createGoalTree(tempDir, "empty-goal");

    // Act
    const result = isStepReady(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStepReviewable — review-readiness gate
// ---------------------------------------------------------------------------

describe("isStepReviewable(goalDir, stepNumber)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("COMPLETED + SUMMARY.md, no BLOCKED → true", () => {
    // Arrange: S01 with COMPLETED and SUMMARY.md, no BLOCKED
    const goalDir = createGoalTree(tempDir, "reviewable-goal", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
    ]);

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(true);
  });

  it("missing COMPLETED → false", () => {
    // Arrange: S01 with only SUMMARY.md (no COMPLETED marker)
    const goalDir = createGoalTree(tempDir, "no-completed-goal", [
      { number: 1, files: ["SUMMARY.md"] },
    ]);

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("missing SUMMARY.md → false", () => {
    // Arrange: S01 with only COMPLETED (no SUMMARY.md)
    const goalDir = createGoalTree(tempDir, "no-summary-goal", [
      { number: 1, files: ["COMPLETED"] },
    ]);

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("has BLOCKED → false even with COMPLETED + SUMMARY.md", () => {
    // Arrange: S01 with COMPLETED, SUMMARY.md, and BLOCKED
    const goalDir = createGoalTree(tempDir, "blocked-review-goal", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] },
    ]);

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("folder does not exist → false", () => {
    // Arrange: goal dir exists but no S01/ subdirectory
    const goalDir = createGoalTree(tempDir, "empty-review-goal");

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMostRecentCompletedStep — reverse-scan discovery
// ---------------------------------------------------------------------------

describe("findMostRecentCompletedStep(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("no step folders → undefined", () => {
    // Arrange: empty goal directory (no S01/, S02/, etc.)
    const goalDir = createGoalTree(tempDir, "empty-goal");

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBeUndefined();
  });

  it("one completed step (S01) → 1", () => {
    // Arrange: S01 with COMPLETED and SUMMARY.md
    const goalDir = createGoalTree(tempDir, "single-complete", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
    ]);

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("multiple sequential completed steps → returns highest", () => {
    // Arrange: S01 and S02 both reviewable
    const goalDir = createGoalTree(tempDir, "multi-complete", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
      { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
    ]);

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("gap in middle — S01 complete, S02 not reviewable → returns 1", () => {
    // Arrange: S01 reviewable, S02 exists but has only specs (no COMPLETED)
    const goalDir = createGoalTree(tempDir, "gap-middle", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
      { number: 2, files: ["TASK.md", "TEST.md"] },
    ]);

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("S01 blocked, S02 completed → returns 2", () => {
    // Arrange: S01 has BLOCKED (not reviewable), S02 is reviewable
    const goalDir = createGoalTree(tempDir, "blocked-s01", [
      { number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] },
      { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
    ]);

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("S01 has specs but no COMPLETED, S02 reviewable → returns 2", () => {
    // Arrange: S01 only has specs, S02 is reviewable
    const goalDir = createGoalTree(tempDir, "specs-only-s01", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
      { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
    ]);

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// stepFolderName — zero-padding verification (in step-discovery context)
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

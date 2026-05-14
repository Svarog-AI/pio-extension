import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CAPABILITY_CONFIG } from "./review-code";
import { isStepReviewable, findMostRecentCompletedStep } from "./review-code";
import { stepFolderName } from "../fs-utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (unified across merged sources)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-review-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Unified helper supporting both patterns:
// - Multi-step with files array (from step-discovery tests)
// - Single step (from review-code-config tests)
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: { steps?: { number: number; files: string[] }[]; stepNumber?: number },
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

  // Single-step mode (from review-code-config tests)
  if (options?.stepNumber != null) {
    const folderName = stepFolderName(options.stepNumber);
    stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
  }

  return { goalDir, stepDir };
}

// ---------------------------------------------------------------------------
// resolveReviewWriteAllowlist (via CAPABILITY_CONFIG.writeAllowlist)
// ---------------------------------------------------------------------------

describe("resolveReviewWriteAllowlist", () => {
  it("given a step number, should return array containing only REVIEW.md path", () => {
    // Act
    const allowlist = (CAPABILITY_CONFIG.writeAllowlist as Function)(
      "/some/workingDir",
      { stepNumber: 1 },
    );

    // Assert
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]).toBe("S01/REVIEW.md");
  });

  it("excludes APPROVED from the write allowlist", () => {
    // Act
    const allowlist = (CAPABILITY_CONFIG.writeAllowlist as Function)(
      "/some/workingDir",
      { stepNumber: 3 },
    );

    // Assert
    const hasApproved = allowlist.some((p: string) => p.endsWith("APPROVED"));
    expect(hasApproved).toBe(false);
  });

  it("throws when stepNumber is missing", () => {
    // Act & Assert
    expect(() => {
      (CAPABILITY_CONFIG.writeAllowlist as Function)("/some/workingDir", {});
    }).toThrow(/stepNumber/i);
  });
});

// ---------------------------------------------------------------------------
// prepareSession
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG.prepareSession", () => {
  // Basic existence check — no filesystem needed.
  it("should be defined as a function", () => {
    expect(typeof CAPABILITY_CONFIG.prepareSession).toBe("function");
  });

  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes stale APPROVED marker", () => {
    // Arrange: S01/APPROVED present
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("deletes stale REJECTED marker", () => {
    // Arrange: S02/REJECTED present
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 2 });
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 2 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("deletes both APPROVED and REJECTED when both exist", () => {
    // Arrange: S01/ with both markers
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("does not delete COMPLETED marker", () => {
    // Arrange: S01/ with APPROVED and COMPLETED
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert: COMPLETED still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("does not delete REVIEW.md", () => {
    // Arrange: S01/ with APPROVED and REVIEW.md
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "some review content", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert: REVIEW.md still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "REVIEW.md"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("handles missing markers gracefully (no error)", () => {
    // Arrange: clean step folder with no APPROVED or REJECTED
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    // Act & Assert: should not throw
    expect(() => {
      (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });
    }).not.toThrow();
  });

  it("throws when stepNumber is missing from params", () => {
    // Arrange
    const { goalDir } = createGoalTree(tempDir, "test-goal");

    // Act & Assert
    expect(() => {
      (CAPABILITY_CONFIG.prepareSession!)(goalDir, {});
    }).toThrow(/stepNumber/i);
  });

  it("uses zero-padded step folder names", () => {
    // Arrange: S05/ with APPROVED
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 5 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 5 });

    // Assert: S05/APPROVED should be deleted (stepFolderName(5) = "S05")
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);

    // The folder name is S05, not S5 — confirm by checking the path
    const s05Path = path.join(goalDir, "S05");
    expect(s05Path === stepDir).toBe(true);
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
    const { goalDir } = createGoalTree(tempDir, "reviewable-goal", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(true);
  });

  it("missing COMPLETED → false", () => {
    // Arrange: S01 with only SUMMARY.md (no COMPLETED marker)
    const { goalDir } = createGoalTree(tempDir, "no-completed-goal", {
      steps: [{ number: 1, files: ["SUMMARY.md"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("missing SUMMARY.md → false", () => {
    // Arrange: S01 with only COMPLETED (no SUMMARY.md)
    const { goalDir } = createGoalTree(tempDir, "no-summary-goal", {
      steps: [{ number: 1, files: ["COMPLETED"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("has BLOCKED → false even with COMPLETED + SUMMARY.md", () => {
    // Arrange: S01 with COMPLETED, SUMMARY.md, and BLOCKED
    const { goalDir } = createGoalTree(tempDir, "blocked-review-goal", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("folder does not exist → false", () => {
    // Arrange: goal dir exists but no S01/ subdirectory
    const { goalDir } = createGoalTree(tempDir, "empty-review-goal");

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
    const { goalDir } = createGoalTree(tempDir, "empty-goal");

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBeUndefined();
  });

  it("one completed step (S01) → 1", () => {
    // Arrange: S01 with COMPLETED and SUMMARY.md
    const { goalDir } = createGoalTree(tempDir, "single-complete", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md"] }],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("multiple sequential completed steps → returns highest", () => {
    // Arrange: S01 and S02 both reviewable
    const { goalDir } = createGoalTree(tempDir, "multi-complete", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("gap in middle — S01 complete, S02 not reviewable → returns 1", () => {
    // Arrange: S01 reviewable, S02 exists but has only specs (no COMPLETED)
    const { goalDir } = createGoalTree(tempDir, "gap-middle", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
        { number: 2, files: ["TASK.md", "TEST.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("S01 blocked, S02 completed → returns 2", () => {
    // Arrange: S01 has BLOCKED (not reviewable), S02 is reviewable
    const { goalDir } = createGoalTree(tempDir, "blocked-s01", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("S01 has specs but no COMPLETED, S02 reviewable → returns 2", () => {
    // Arrange: S01 only has specs, S02 is reviewable
    const { goalDir } = createGoalTree(tempDir, "specs-only-s01", {
      steps: [
        { number: 1, files: ["TASK.md", "TEST.md"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });
});

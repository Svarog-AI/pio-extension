import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CAPABILITY_CONFIG } from "../src/capabilities/review-code";
import { stepFolderName } from "../src/utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (mirrors execute-task-initial-message.test.ts)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-review-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with optional marker files in the step folder.
function createGoalTree(
  tempDir: string,
  goalName: string,
  stepNumber?: number,
): { goalDir: string; stepDir: string } {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  let stepDir = "";
  if (stepNumber != null) {
    const folderName = stepFolderName(stepNumber);
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
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 1);
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("deletes stale REJECTED marker", () => {
    // Arrange: S02/REJECTED present
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 2);
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    (CAPABILITY_CONFIG.prepareSession!)(goalDir, { stepNumber: 2 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("deletes both APPROVED and REJECTED when both exist", () => {
    // Arrange: S01/ with both markers
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 1);
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
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 1);
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
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 1);
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
    const { goalDir } = createGoalTree(tempDir, "test-goal", 1);

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
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", 5);
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

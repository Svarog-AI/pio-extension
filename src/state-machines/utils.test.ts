import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isGoalComplete, findCurrentStepNumber, createSimpleStepStatus } from "./utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mktmp(prefix: string = "pio-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createGoalStructure(base: string, goalName: string): string {
  const goalDir = path.join(base, goalName);
  fs.mkdirSync(goalDir, { recursive: true });
  return goalDir;
}

function createStepDir(goalDir: string, stepNum: number): string {
  const folder = `S${String(stepNum).padStart(2, "0")}`;
  const dir = path.join(goalDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMarker(dir: string, name: string, content: string = "") {
  fs.writeFileSync(path.join(dir, name), content, "utf-8");
}

// ---------------------------------------------------------------------------
// isGoalComplete
// ---------------------------------------------------------------------------

describe("isGoalComplete", () => {
  it("returns false when COMPLETED marker does not exist", () => {
    const goalDir = createGoalStructure(mktmp(), "no-complete");
    expect(isGoalComplete(goalDir)).toBe(false);
  });

  it("returns true when COMPLETED marker exists", () => {
    const goalDir = createGoalStructure(mktmp(), "is-complete");
    writeMarker(goalDir, "COMPLETED", "done");
    expect(isGoalComplete(goalDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findCurrentStepNumber
// ---------------------------------------------------------------------------

describe("findCurrentStepNumber", () => {
  it("returns 1 for empty goal directory (no step folders)", () => {
    const goalDir = createGoalStructure(mktmp(), "empty");
    expect(findCurrentStepNumber(goalDir)).toBe(1);
  });

  it("returns 1 when S01 exists but has no APPROVED marker", () => {
    const goalDir = createGoalStructure(mktmp(), "s01-no-approved");
    createStepDir(goalDir, 1);
    expect(findCurrentStepNumber(goalDir)).toBe(1);
  });

  it("returns 2 when S01 is APPROVED and S02 has no APPROVED", () => {
    const goalDir = createGoalStructure(mktmp(), "s01-approved");
    const s01 = createStepDir(goalDir, 1);
    writeMarker(s01, "APPROVED");
    createStepDir(goalDir, 2);
    expect(findCurrentStepNumber(goalDir)).toBe(2);
  });

  it("stops at first gap (missing folder)", () => {
    const goalDir = createGoalStructure(mktmp(), "gap");
    const s01 = createStepDir(goalDir, 1);
    writeMarker(s01, "APPROVED");
    // S02 does not exist
    const s03 = createStepDir(goalDir, 3);
    writeMarker(s03, "APPROVED");
    expect(findCurrentStepNumber(goalDir)).toBe(2);
  });

  it("returns correct number with mixed state (some approved, some not)", () => {
    const goalDir = createGoalStructure(mktmp(), "mixed");
    const s01 = createStepDir(goalDir, 1);
    writeMarker(s01, "APPROVED");
    const s02 = createStepDir(goalDir, 2);
    writeMarker(s02, "APPROVED");
    const s03 = createStepDir(goalDir, 3);
    // S03 has COMPLETED but no APPROVED — should stop here
    writeMarker(s03, "COMPLETED");
    expect(findCurrentStepNumber(goalDir)).toBe(3);
  });

  it("skips all APPROVED folders and returns next number", () => {
    const goalDir = createGoalStructure(mktmp(), "all-approved");
    const s01 = createStepDir(goalDir, 1);
    writeMarker(s01, "APPROVED");
    const s02 = createStepDir(goalDir, 2);
    writeMarker(s02, "APPROVED");
    const s03 = createStepDir(goalDir, 3);
    writeMarker(s03, "APPROVED");
    // S04 does not exist — gap halts at 4
    expect(findCurrentStepNumber(goalDir)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// SimpleStepStatus
// ---------------------------------------------------------------------------

describe("SimpleStepStatus", () => {
  describe("status()", () => {
    it('returns "pending" for an empty folder', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "pending"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("pending");
    });

    it('returns "defined" when only TASK.md exists', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "defined"), 1);
      writeMarker(stepDir, "TASK.md", "# Task");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("defined");
    });

    it('returns "implemented" when COMPLETED marker exists', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "implemented"), 1);
      writeMarker(stepDir, "COMPLETED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("implemented");
    });

    it('returns "approved" when APPROVED marker exists', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "approved"), 1);
      writeMarker(stepDir, "APPROVED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("approved");
    });

    it('returns "rejected" when REJECTED marker exists', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "rejected"), 1);
      writeMarker(stepDir, "REJECTED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("rejected");
    });

    it('returns "blocked" when BLOCKED marker exists', () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "blocked"), 1);
      writeMarker(stepDir, "BLOCKED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("blocked");
    });

    it("respects priority: approved > rejected when both markers exist", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "priority"), 1);
      writeMarker(stepDir, "APPROVED");
      writeMarker(stepDir, "REJECTED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.status()).toBe("approved");
    });
  });

  describe("hasTask()", () => {
    it("returns true when TASK.md exists", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "has-task"), 1);
      writeMarker(stepDir, "TASK.md", "# Task");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasTask()).toBe(true);
    });

    it("returns false when TASK.md does not exist", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "no-task"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasTask()).toBe(false);
    });
  });

  describe("hasTest()", () => {
    it("returns true when TEST.md exists", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "has-test"), 1);
      writeMarker(stepDir, "TEST.md", "# Tests");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasTest()).toBe(true);
    });

    it("returns false when TEST.md does not exist", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "no-test"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasTest()).toBe(false);
    });
  });

  describe("hasSummary()", () => {
    it("returns true when SUMMARY.md exists", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "has-summary"), 1);
      writeMarker(stepDir, "SUMMARY.md", "# Summary");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasSummary()).toBe(true);
    });

    it("returns false when SUMMARY.md does not exist", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "no-summary"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.hasSummary()).toBe(false);
    });
  });

  describe("revisionNeeded()", () => {
    it("returns true when REVISE_PLAN_NEEDED marker exists", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "revise"), 1);
      writeMarker(stepDir, "REVISE_PLAN_NEEDED");
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.revisionNeeded()).toBe(true);
    });

    it("returns false when REVISE_PLAN_NEEDED marker does not exist", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "no-revise"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.revisionNeeded()).toBe(false);
    });
  });

  describe("getMetadata()", () => {
    it("returns the metadata provided at construction", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "meta"), 1);
      const metadata = { name: "test-step", complexity: "task" };
      const status = createSimpleStepStatus(stepDir, 1, "S01", metadata);
      expect(status.getMetadata()).toEqual(metadata);
    });

    it("returns null when metadata is null at construction", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "no-meta"), 1);
      const status = createSimpleStepStatus(stepDir, 1, "S01", null);
      expect(status.getMetadata()).toBeNull();
    });
  });

  describe("metadata property", () => {
    it("exposes metadata as a property", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "meta-prop"), 1);
      const metadata = { name: "test-step", complexity: "task" };
      const status = createSimpleStepStatus(stepDir, 1, "S01", metadata);
      expect(status.metadata).toEqual(metadata);
    });
  });

  describe("properties", () => {
    it("exposes stepNumber and folderName", () => {
      const stepDir = createStepDir(createGoalStructure(mktmp(), "props"), 5);
      const status = createSimpleStepStatus(stepDir, 5, "S05", null);
      expect(status.stepNumber).toBe(5);
      expect(status.folderName).toBe("S05");
    });
  });
});

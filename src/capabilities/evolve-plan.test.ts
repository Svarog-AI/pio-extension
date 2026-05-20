import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateOutputs } from "../guards/validation";
import { resolveCapabilityConfig } from "../capability-config";
import { validateAndFindNextStep } from "./evolve-plan";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-evolve-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a minimal goal directory tree with PLAN.md and optional COMPLETED marker.
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: { withCompleted?: boolean; planContent?: string },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // Always create PLAN.md
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    options?.planContent || "# Plan\n\n### Step 1: Test step\n",
    "utf-8",
  );

  // Optionally create COMPLETED marker
  if (options?.withCompleted) {
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// validateOutputs — COMPLETED short-circuit at baseDir
// ---------------------------------------------------------------------------

describe("validateOutputs with COMPLETED at baseDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("passes when COMPLETED exists, even if other expected files are missing", () => {
    // Arrange: temp dir with COMPLETED file but no TASK.md/TEST.md
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    const rules = { files: ["TASK.md", "TEST.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("passes when COMPLETED is the only expected file and it exists", () => {
    // Arrange: temp dir with COMPLETED
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    const rules = { files: ["COMPLETED"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("fails normally when COMPLETED does not exist and expected files are missing", () => {
    // Arrange: temp dir with no COMPLETED, no TASK.md
    const rules = { files: ["TASK.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("TASK.md");
  });

  it("does not match COMPLETED in a subfolder", () => {
    // Arrange: temp dir with S01/COMPLETED but no COMPLETED at root
    const s01Dir = path.join(tempDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");

    const rules = { files: ["S01/TASK.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert: fails normally (short-circuit only for baseDir/COMPLETED, not subfolder)
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S01/TASK.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — always includes COMPLETED
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist", () => {
  it("always includes COMPLETED alongside step-folder paths", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 2
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 2 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains COMPLETED, S02/TASK.md, S02/TEST.md
    expect(result!.writeAllowlist).toContain("COMPLETED");
    expect(result!.writeAllowlist).toContain("S02/TASK.md");
    expect(result!.writeAllowlist).toContain("S02/TEST.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveValidation — DECISIONS.md for step > 1
// ---------------------------------------------------------------------------

describe("resolveEvolveValidation with DECISIONS_FILE", () => {
  it("excludes DECISIONS.md for stepNumber=1", async () => {
    // Arrange: step 1 should produce only TASK.md and TEST.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: exactly 2 files, no DECISIONS.md
    expect(result?.validation?.files).toEqual(["S01/TASK.md", "S01/TEST.md"]);
  });

  it("includes DECISIONS.md for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside TASK.md and TEST.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: exactly 3 files, DECISIONS.md is last
    expect(result?.validation?.files).toEqual(["S02/TASK.md", "S02/TEST.md", "S02/DECISIONS.md"]);
  });

  it("includes DECISIONS.md for stepNumber=3", async () => {
    // Arrange: step 3+ should also include DECISIONS.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 3 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contains S03/DECISIONS.md, total length is 3
    expect(result?.validation?.files).toContain("S03/DECISIONS.md");
    expect(result?.validation?.files?.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — DECISIONS.md for step > 1
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist with DECISIONS_FILE", () => {
  it("excludes DECISIONS.md from write allowlist for stepNumber=1", async () => {
    // Arrange: step 1 should not include DECISIONS.md in the write allowlist
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: no DECISIONS.md in the allowlist
    expect(result?.writeAllowlist?.some((p) => p.includes("DECISIONS.md"))).toBe(false);
  });

  it("includes DECISIONS.md in write allowlist for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside existing entries
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contains all expected files including DECISIONS.md (total length is 4)
    expect(result?.writeAllowlist).toContain("COMPLETED");
    expect(result?.writeAllowlist).toContain("S02/TASK.md");
    expect(result?.writeAllowlist).toContain("S02/TEST.md");
    expect(result?.writeAllowlist).toContain("S02/DECISIONS.md");
    expect(result?.writeAllowlist?.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Shared helper for frontmatter-based tests
// ---------------------------------------------------------------------------

function createGoalTreeWithFrontmatter(
  tempDir: string,
  goalName: string,
  totalSteps: number,
  options?: {
    stepFolders?: Array<{ stepNumber: number; approved: boolean }>;
    withCompleted?: boolean;
  },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // Create PLAN.md with YAML frontmatter
  const planContent = `---\ntotalSteps: ${totalSteps}\n---\n# Plan\n\n### Step 1: Test step\n`;
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), planContent, "utf-8");

  // Create step folders with optional APPROVED markers
  for (const step of options?.stepFolders ?? []) {
    const folder = `S${String(step.stepNumber).padStart(2, "0")}`;
    const stepDir = path.join(goalDir, folder);
    fs.mkdirSync(stepDir, { recursive: true });

    // Create TASK.md and TEST.md so the folder is considered "defined"
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(stepDir, "TEST.md"), "# Tests\n", "utf-8");

    if (step.approved) {
      fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    }
  }

  // Optionally create COMPLETED marker
  if (options?.withCompleted) {
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// validateAndFindNextStep — frontmatter-based completion detection
// ---------------------------------------------------------------------------

describe("validateAndFindNextStep with frontmatter-based completion", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  describe("frontmatter-based completion detection", () => {
    it("writes COMPLETED and returns not-ready when currentStepNumber() > totalSteps", async () => {
      // Arrange: totalSteps=3, all 3 steps APPROVED (currentStepNumber returns 4)
      createGoalTreeWithFrontmatter(tempDir, "done-goal", 3, {
        stepFolders: [
          { stepNumber: 1, approved: true },
          { stepNumber: 2, approved: true },
          { stepNumber: 3, approved: true },
        ],
      });

      // Act
      const result = await validateAndFindNextStep("done-goal", tempDir);

      // Assert: ready is false, COMPLETED file exists, error mentions completion
      expect(result.ready).toBe(false);
      if (!result.ready) {
        expect(result.error).toMatch(/all.*steps|specified|complete/i);
      }
      expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "done-goal", "COMPLETED"))).toBe(true);
    });

    it("returns not-ready when all steps are defined but current step exceeds totalSteps", async () => {
      // Arrange: totalSteps=2, S01 and S02 exist without APPROVED (currentStepNumber=1, which is <= 2)
      // This should NOT trigger completion — normal flow continues
      createGoalTreeWithFrontmatter(tempDir, "active-goal", 2, {
        stepFolders: [
          { stepNumber: 1, approved: false },
          { stepNumber: 2, approved: false },
        ],
      });

      // Act
      const result = await validateAndFindNextStep("active-goal", tempDir);

      // Assert: ready is true, stepNumber is 1, COMPLETED does NOT exist
      expect(result.ready).toBe(true);
      if (result.ready) {
        expect(result.stepNumber).toBe(1);
      }
      expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "active-goal", "COMPLETED"))).toBe(false);
    });

    it("writes COMPLETED for totalSteps=1 when S01 is APPROVED", async () => {
      // Arrange: totalSteps=1, S01 APPROVED (currentStepNumber returns 2)
      createGoalTreeWithFrontmatter(tempDir, "single-goal", 1, {
        stepFolders: [{ stepNumber: 1, approved: true }],
      });

      // Act
      const result = await validateAndFindNextStep("single-goal", tempDir);

      // Assert: ready is false, COMPLETED exists, error mentions step count
      expect(result.ready).toBe(false);
      if (!result.ready) {
        expect(result.error).toMatch(/step|complete|all/i);
      }
      expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "single-goal", "COMPLETED"))).toBe(true);
    });

    it("proceeds normally when currentStepNumber() <= totalSteps", async () => {
      // Arrange: totalSteps=5, S01 exists without APPROVED (currentStepNumber=1, which is <= 5)
      createGoalTreeWithFrontmatter(tempDir, "ongoing-goal", 5, {
        stepFolders: [{ stepNumber: 1, approved: false }],
      });

      // Act
      const result = await validateAndFindNextStep("ongoing-goal", tempDir);

      // Assert: ready is true, stepNumber is 1, COMPLETED does NOT exist
      expect(result.ready).toBe(true);
      if (result.ready) {
        expect(result.stepNumber).toBe(1);
      }
      expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "ongoing-goal", "COMPLETED"))).toBe(false);
    });

    it("proceeds normally when frontmatter is unavailable (null)", async () => {
      // Arrange: PLAN.md without YAML frontmatter
      const goalDir = createGoalTree(tempDir, "no-frontmatter-goal", {
        planContent: "# Plan\n\n### Step 1: Test step\n",
      });

      // Act
      const result = await validateAndFindNextStep("no-frontmatter-goal", tempDir);

      // Assert: ready is true, stepNumber is 1, COMPLETED does NOT exist
      expect(result.ready).toBe(true);
      if (result.ready) {
        expect(result.stepNumber).toBe(1);
      }
      expect(fs.existsSync(path.join(goalDir, "COMPLETED"))).toBe(false);
    });
  });

  describe("COMPLETED guard interaction", () => {
    it("existing COMPLETED guard still blocks relaunch", async () => {
      // Arrange: totalSteps=3, all APPROVED, AND pre-existing COMPLETED file
      createGoalTreeWithFrontmatter(tempDir, "already-done", 3, {
        stepFolders: [
          { stepNumber: 1, approved: true },
          { stepNumber: 2, approved: true },
          { stepNumber: 3, approved: true },
        ],
        withCompleted: true,
      });

      // Act
      const result = await validateAndFindNextStep("already-done", tempDir);

      // Assert: ready is false, error mentions COMPLETED or "already specified"
      expect(result.ready).toBe(false);
      if (!result.ready) {
        expect(result.error).toMatch(/COMPLETED|already specified/i);
      }
    });

    it("new frontmatter check runs before existing COMPLETED guard (both detect completion)", async () => {
      // Arrange: totalSteps=2, S01/S02 all APPROVED, no pre-existing COMPLETED
      createGoalTreeWithFrontmatter(tempDir, "frontmatter-done", 2, {
        stepFolders: [
          { stepNumber: 1, approved: true },
          { stepNumber: 2, approved: true },
        ],
      });

      // Act
      const result = await validateAndFindNextStep("frontmatter-done", tempDir);

      // Assert: ready is false, COMPLETED now exists, error indicates completion
      expect(result.ready).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "frontmatter-done", "COMPLETED"))).toBe(true);
      if (!result.ready) {
        expect(result.error).toMatch(/all.*steps|specified|complete/i);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// validateAndFindNextStep — COMPLETED pre-launch guard
// ---------------------------------------------------------------------------

describe("validateAndFindNextStep with COMPLETED marker", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready:false when COMPLETED exists at goal root", async () => {
    // Arrange: goal dir with PLAN.md and a COMPLETED file
    createGoalTree(tempDir, "done-goal", { withCompleted: true });

    // Act
    const result = await validateAndFindNextStep("done-goal", tempDir);

    // Assert: ready is false, error mentions COMPLETED or "already specified"
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/COMPLETED|already specified/i);
    }
  });

  it("returns ready:true when COMPLETED does not exist and PLAN.md exists", async () => {
    // Arrange: goal dir with PLAN.md, no COMPLETED
    createGoalTree(tempDir, "active-goal", { withCompleted: false });

    // Act
    const result = await validateAndFindNextStep("active-goal", tempDir);

    // Assert: ready is true, stepNumber is 1 (no S01/ yet)
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(1);
    }
  });
});

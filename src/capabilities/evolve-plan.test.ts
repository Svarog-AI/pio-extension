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

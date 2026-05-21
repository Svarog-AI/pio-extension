import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveCapabilityConfig } from "../capability-config";
import { CAPABILITY_CONFIG, validateRevisePlan, prepareSession } from "./revise-plan";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-revise-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a minimal goal directory tree.
 * Structure: <tempDir>/.pio/goals/<goalName>/
 */
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: {
    withGoal?: boolean;
    withPlan?: boolean;
    planContent?: string;
    stepFolders?: Array<{ stepNumber: number; approved: boolean; withMarker?: boolean }>;
    withArchive?: boolean;
  },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  if (options?.withGoal) {
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
  }

  if (options?.withPlan) {
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      options.planContent || "---\ntotalSteps: 3\n---\n# Plan\n",
      "utf-8",
    );
  }

  // Create step folders
  for (const step of options?.stepFolders ?? []) {
    const folder = `S${String(step.stepNumber).padStart(2, "0")}`;
    const stepDir = path.join(goalDir, folder);
    fs.mkdirSync(stepDir, { recursive: true });

    if (step.approved) {
      fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    }

    if (step.withMarker) {
      fs.writeFileSync(
        path.join(stepDir, "REVISE_PLAN_NEEDED"),
        "---\nreason: decisions-impact-future\n---\n# Revision needed\n",
        "utf-8",
      );
    }

    // Add some content files to make folders realistic
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(stepDir, "TEST.md"), "# Tests\n", "utf-8");
  }

  // Optionally create PLAN_ARCHIVE with an existing file
  if (options?.withArchive) {
    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, "PLAN-2026-01-01T000000Z.md"), "# Old Plan\n", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// CAPABILITY_CONFIG structure
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG", () => {
  it('prompt is "revise-plan.md"', () => {
    expect(CAPABILITY_CONFIG.prompt).toBe("revise-plan.md");
  });

  it("validation requires PLAN.md", () => {
    const validation = CAPABILITY_CONFIG.validation;
    expect(validation).toBeDefined();
    // validation can be a function or static object
    if (typeof validation === "object" && "files" in validation) {
      expect(validation.files).toContain("PLAN.md");
    }
  });

  it("prepareSession is a function", () => {
    expect(typeof CAPABILITY_CONFIG.prepareSession).toBe("function");
  });

  it("defaultInitialMessage returns non-empty string containing the goal workspace path", () => {
    const message = CAPABILITY_CONFIG.defaultInitialMessage("/some/goal/dir");
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain("/some/goal/dir");
  });
});

// ---------------------------------------------------------------------------
// Validation — validateRevisePlan preconditions
// ---------------------------------------------------------------------------

describe("validateRevisePlan — rejects invalid states", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("rejects when goal workspace does not exist", async () => {
    const result = await validateRevisePlan("nonexistent", tempDir);

    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/does not exist/i);
  });

  it("rejects when GOAL.md is missing", async () => {
    // Create goal dir with PLAN.md but no GOAL.md
    createGoalTree(tempDir, "no-goal", { withPlan: true });

    const result = await validateRevisePlan("no-goal", tempDir);

    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/GOAL/i);
  });

  it("rejects when PLAN.md is missing", async () => {
    // Create goal dir with GOAL.md but no PLAN.md
    createGoalTree(tempDir, "no-plan", { withGoal: true });

    const result = await validateRevisePlan("no-plan", tempDir);

    expect(result.ready).toBe(false);
    expect(result.error).toMatch(/PLAN/i);
  });
});

describe("validateRevisePlan — accepts valid states", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("succeeds when GOAL.md and PLAN.md exist (no steps required)", async () => {
    createGoalTree(tempDir, "valid-goal", { withGoal: true, withPlan: true });

    const result = await validateRevisePlan("valid-goal", tempDir);

    expect(result.ready).toBe(true);
  });

  it("succeeds with APPROVED steps present", async () => {
    createGoalTree(tempDir, "valid-with-steps", {
      withGoal: true,
      withPlan: true,
      stepFolders: [{ stepNumber: 1, approved: true }],
    });

    const result = await validateRevisePlan("valid-with-steps", tempDir);

    expect(result.ready).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prepareSession — archive PLAN.md
// ---------------------------------------------------------------------------

describe("prepareSession — archiving", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("archives PLAN.md to PLAN_ARCHIVE/ with timestamped filename", async () => {
    const planContent = "---\ntotalSteps: 3\n---\n# Original Plan\n\n## Step 1: Do something\n";
    goalDir = createGoalTree(tempDir, "archive-test", {
      withGoal: true,
      withPlan: true,
      planContent: planContent,
    });

    await prepareSession(goalDir);

    // Assert PLAN_ARCHIVE/ directory exists
    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    expect(fs.existsSync(archiveDir)).toBe(true);

    // Assert exactly one file matching PLAN-*.md exists
    const archiveFiles = fs.readdirSync(archiveDir).filter((f) => /^PLAN-.*\.md$/.test(f));
    expect(archiveFiles.length).toBe(1);

    // Assert archived file content matches original
    const archivedContent = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), "utf-8");
    expect(archivedContent).toBe(planContent);

    // Assert original PLAN.md is deleted
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(false);
  });

  it("creates PLAN_ARCHIVE/ directory if it does not exist", async () => {
    goalDir = createGoalTree(tempDir, "no-archive-dir", { withGoal: true, withPlan: true });

    // Verify PLAN_ARCHIVE doesn't exist before
    expect(fs.existsSync(path.join(goalDir, "PLAN_ARCHIVE"))).toBe(false);

    await prepareSession(goalDir);

    // Assert directory was created
    expect(fs.existsSync(path.join(goalDir, "PLAN_ARCHIVE"))).toBe(true);
  });

  it("preserves previous archive files when archiving again", async () => {
    goalDir = createGoalTree(tempDir, "existing-archive", {
      withGoal: true,
      withPlan: true,
      withArchive: true,
    });

    await prepareSession(goalDir);

    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    const archiveFiles = fs.readdirSync(archiveDir).filter((f) => /^PLAN-.*\.md$/.test(f));

    // Should have the old archive + the new one = 2 files
    expect(archiveFiles.length).toBe(2);
  });

  it("does nothing if PLAN.md is already missing", async () => {
    goalDir = createGoalTree(tempDir, "no-plan-edge", { withGoal: true });

    // Should not throw
    await expect(prepareSession(goalDir)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// prepareSession — deleting non-APPROVED step folders
// ---------------------------------------------------------------------------

describe("prepareSession — cleanup", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes step folders without APPROVED marker", async () => {
    goalDir = createGoalTree(tempDir, "mixed-steps", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: false },
        { stepNumber: 2, approved: true },
      ],
    });

    await prepareSession(goalDir);

    // S01 should be deleted
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(false);
    // S02 should still exist
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    // S02 APPROVED marker should be intact
    expect(fs.existsSync(path.join(goalDir, "S02", "APPROVED"))).toBe(true);
  });

  it("preserves APPROVED step folders", async () => {
    goalDir = createGoalTree(tempDir, "all-approved", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: true },
      ],
    });

    await prepareSession(goalDir);

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02", "APPROVED"))).toBe(true);
  });

  it("deletes multiple non-APPROVED folders", async () => {
    goalDir = createGoalTree(tempDir, "multi-cleanup", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: false },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: true },
      ],
    });

    await prepareSession(goalDir);

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);
  });

  it("handles goal with all steps APPROVED", async () => {
    goalDir = createGoalTree(tempDir, "all-done", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: true },
        { stepNumber: 3, approved: true },
      ],
    });

    await prepareSession(goalDir);

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prepareSession — REVISE_PLAN_NEEDED marker cleanup
// ---------------------------------------------------------------------------

describe("prepareSession — marker cleanup", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes REVISE_PLAN_NEEDED from triggering step folder when revisionTriggerStep provided", async () => {
    goalDir = createGoalTree(tempDir, "marker-test", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true, withMarker: true },
      ],
    });

    // Verify marker exists before
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(true);

    await prepareSession(goalDir, { revisionTriggerStep: 1 });

    // S01 should still exist (it's APPROVED)
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    // But marker should be deleted
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(false);
  });

  it("does not attempt cleanup when revisionTriggerStep is not provided", async () => {
    goalDir = createGoalTree(tempDir, "no-trigger", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 2, approved: false, withMarker: true },
      ],
    });

    // Call without params — S02 is non-APPROVED, so it gets deleted entirely
    await prepareSession(goalDir);

    // S02 folder should be deleted (non-APPROVED cleanup)
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    // Marker naturally removed with the folder
    expect(fs.existsSync(path.join(goalDir, "S02", "REVISE_PLAN_NEEDED"))).toBe(false);
  });

  it("handles missing marker gracefully", async () => {
    goalDir = createGoalTree(tempDir, "no-marker", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
      ],
    });

    // S01 is APPROVED but has no REVISE_PLAN_NEEDED marker
    // Should not throw
    await expect(prepareSession(goalDir, { revisionTriggerStep: 1 })).resolves.toBeUndefined();
    // S01 should still exist
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Config callbacks — readOnlyFiles and writeAllowlist
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG callbacks via resolveCapabilityConfig", () => {
  it("writeAllowlist includes PLAN.md", async () => {
    const params = { capability: "revise-plan" as string, goalName: "test-goal" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result?.writeAllowlist).toContain("PLAN.md");
  });

  it("readOnlyFiles is a function (callback)", () => {
    expect(typeof CAPABILITY_CONFIG.readOnlyFiles).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Integration — end-to-end prepareSession workflow
// ---------------------------------------------------------------------------

describe("end-to-end prepareSession workflow", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("full lifecycle: archive, cleanup, marker removal in one run", async () => {
    const planContent = "---\ntotalSteps: 5\n---\n# Original Plan\n\n## Step 1: Done\n## Step 2: In progress\n## Step 3: Pending\n";

    goalDir = createGoalTree(tempDir, "full-lifecycle", {
      withGoal: true,
      withPlan: true,
      planContent: planContent,
      stepFolders: [
        { stepNumber: 1, approved: true, withMarker: true },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: false },
      ],
    });

    // Add SUMMARY.md to S03 to make it more realistic
    fs.writeFileSync(path.join(goalDir, "S03", "SUMMARY.md"), "# Summary\n", "utf-8");

    await prepareSession(goalDir, { revisionTriggerStep: 1 });

    // PLAN_ARCHIVE/ has one timestamped file with correct content
    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveFiles = fs.readdirSync(archiveDir).filter((f) => /^PLAN-.*\.md$/.test(f));
    expect(archiveFiles.length).toBe(1);
    const archivedContent = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), "utf-8");
    expect(archivedContent).toBe(planContent);

    // Original PLAN.md is gone
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(false);

    // S01 exists with APPROVED but marker removed
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(false);

    // S02 and S03 are deleted
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(false);
  });
});

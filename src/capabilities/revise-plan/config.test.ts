import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import config, { register } from "./config";
import { validateRevisePlan, prepareSession, cleanupIncompleteSteps } from "./callbacks";
import { readPendingTask } from "../../queues";

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
      options.planContent || "---\ntotalSteps: 3\nsteps:\n  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task\n  - name: step-3\n    complexity: task\n---\n# Plan\n",
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

  // Write PLAN.md with steps array if stepFolders are provided (for GoalState.steps() frontmatter derivation)
  if (options?.stepFolders && options.stepFolders.length > 0 && !options.withPlan) {
    const totalSteps = Math.max(...options.stepFolders.map((s) => s.stepNumber));
    const stepsYaml = Array.from({ length: totalSteps }, (_, i) =>
      `  - name: step-${i + 1}\n    complexity: task`,
    ).join("\n");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );
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
// config structure
// ---------------------------------------------------------------------------

describe("config structure", () => {
  it("contract outputs includes PLAN.md with schema", () => {
    expect(config.contract.outputs.length).toBe(1);
    const output = config.contract.outputs[0] as import("../../types").MarkdownFileSpec;
    expect(output.file).toBe("PLAN.md");
    expect(output.schema).toBeDefined();
  });

  it("prepareSession is a function", () => {
    expect(typeof config.prepareSession).toBe("function");
  });

  it("postExecute is defined and references cleanupIncompleteSteps", () => {
    expect(config.postExecute).toBe(cleanupIncompleteSteps);
  });
});

// ---------------------------------------------------------------------------
// config wiring consistency — integration
// ---------------------------------------------------------------------------

describe("config wiring consistency", () => {
  it("all lifecycle hooks point to the correct exported functions", () => {
    // prepareSession must be the exported prepareSession
    expect(config.prepareSession).toBe(prepareSession);
    // postExecute must be the exported cleanupIncompleteSteps
    expect(config.postExecute).toBe(cleanupIncompleteSteps);
  });

  it("readOnlyFiles is a function callback", () => {
    expect(typeof config.readOnlyFiles).toBe("function");
  });

  it("writeAllowlist resolves to include PLAN.md", () => {
    const wl = config.writeAllowlist;
    expect(typeof wl === "function" || Array.isArray(wl)).toBe(true);

    const result = typeof wl === "function" ? wl("/tmp/goal") : wl;
    expect(result).toContain("PLAN.md");
  });
});

// ---------------------------------------------------------------------------
// validateRevisePlan — directory resolution
// ---------------------------------------------------------------------------

describe("validateRevisePlan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves workspace and returns ready", async () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 1\nsteps:\n  - name: test\n    complexity: task\n---\n# Plan");

    const result = await validateRevisePlan("goals/my-goal", tempDir);

    expect(result.ready).toBe(true);
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

    const result = await validateRevisePlan("goals/valid-goal", tempDir);

    expect(result.ready).toBe(true);
  });

  it("succeeds with APPROVED steps present", async () => {
    createGoalTree(tempDir, "valid-with-steps", {
      withGoal: true,
      withPlan: true,
      stepFolders: [{ stepNumber: 1, approved: true }],
    });

    const result = await validateRevisePlan("goals/valid-with-steps", tempDir);

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

    // Assert original PLAN.md is preserved (copy-only behavior)
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(true);
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

  it("preserves non-APPROVED step folders (cleanup deferred to postExecute)", async () => {
    goalDir = createGoalTree(tempDir, "mixed-steps", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: false },
        { stepNumber: 2, approved: true },
      ],
    });

    await prepareSession(goalDir);

    // S01 should still exist — cleanup is deferred to postExecute
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    // S01 content should be intact
    expect(fs.existsSync(path.join(goalDir, "S01", "TASK.md"))).toBe(true);
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

  it("preserves multiple non-APPROVED folders (cleanup deferred to postExecute)", async () => {
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

    // All folders should still exist — cleanup is deferred to postExecute
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
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

  it("preserves REVISE_PLAN_NEEDED marker (cleanup deferred to postExecute)", async () => {
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
    // Marker should also still exist — cleanup is deferred to postExecute
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(true);
  });

  it("preserves folder and marker when revisionTriggerStep is not provided", async () => {
    goalDir = createGoalTree(tempDir, "no-trigger", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 2, approved: false, withMarker: true },
      ],
    });

    // Call without params — S02 is non-APPROVED but should be preserved
    await prepareSession(goalDir);

    // S02 folder should still exist — cleanup deferred to postExecute
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    // Marker should also still exist
    expect(fs.existsSync(path.join(goalDir, "S02", "REVISE_PLAN_NEEDED"))).toBe(true);
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
// Integration — end-to-end prepareSession workflow
// ---------------------------------------------------------------------------

describe("end-to-end lifecycle: prepareSession then cleanupIncompleteSteps", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("prepareSession archives plan and preserves all folders; cleanupIncompleteSteps deletes non-APPROVED", async () => {
    const planContent = "---\ntotalSteps: 5\nsteps:\n  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task\n  - name: step-3\n    complexity: task\n  - name: step-4\n    complexity: task\n  - name: step-5\n    complexity: task\n---\n# Original Plan\n\n## Step 1: Done\n## Step 2: In progress\n## Step 3: Pending\n";

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

    // Phase 1: prepareSession — archive only, preserve all folders
    await prepareSession(goalDir, { revisionTriggerStep: 1 });

    // PLAN_ARCHIVE/ has one timestamped file with correct content
    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveFiles = fs.readdirSync(archiveDir).filter((f) => /^PLAN-.*\.md$/.test(f));
    expect(archiveFiles.length).toBe(1);
    const archivedContent = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), "utf-8");
    expect(archivedContent).toBe(planContent);

    // Original PLAN.md is preserved (copy-only behavior)
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(true);

    // All step folders should still exist after prepareSession
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);

    // Phase 2: cleanupIncompleteSteps — delete non-APPROVED, clean marker
    await cleanupIncompleteSteps(goalDir, { revisionTriggerStep: 1 });

    // S01 (APPROVED) should remain but marker should be cleaned
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(false);

    // S02 and S03 (non-APPROVED) should be deleted
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cleanupIncompleteSteps — disk scanning and deletion
// ---------------------------------------------------------------------------

describe("cleanupIncompleteSteps", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes non-APPROVED S{NN}/ folders found on disk", async () => {
    goalDir = createGoalTree(tempDir, "mixed-disk", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: false },
      ],
    });

    await cleanupIncompleteSteps(goalDir);

    // S01 (APPROVED) should remain
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    // S02 and S03 (non-APPROVED) should be deleted
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(false);
  });

  it("preserves APPROVED S{NN}/ folders", async () => {
    goalDir = createGoalTree(tempDir, "all-approved-disk", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: true },
        { stepNumber: 3, approved: true },
      ],
    });

    await cleanupIncompleteSteps(goalDir);

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);
  });

  it("handles empty goal directory (no step folders)", async () => {
    goalDir = createGoalTree(tempDir, "empty-goal", {
      withGoal: true,
      withPlan: true,
    });

    // Should not throw
    await expect(cleanupIncompleteSteps(goalDir)).resolves.toBeUndefined();
  });

  it("deletes all folders when none are APPROVED", async () => {
    goalDir = createGoalTree(tempDir, "none-approved", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: false },
        { stepNumber: 2, approved: false },
      ],
    });

    await cleanupIncompleteSteps(goalDir);

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
  });

  it("scans disk, not PLAN.md frontmatter", async () => {
    // Create goalDir with PLAN.md listing 2 steps, but 3 folders on disk
    goalDir = createGoalTree(tempDir, "disk-scan", {
      withGoal: true,
      withPlan: true,
      planContent: "---\ntotalSteps: 2\nsteps:\n  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task\n---\n# Plan\n",
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: false },
      ],
    });

    // S03 is on disk but NOT in PLAN.md frontmatter — cleanup should still find it
    await cleanupIncompleteSteps(goalDir);

    // S01 (APPROVED) should remain
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    // S02 and S03 (non-APPROVED) should be deleted even though S03 isn't in PLAN.md
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(false);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(false);
  });

  it("cleans up REVISE_PLAN_NEEDED marker when trigger step folder exists", async () => {
    goalDir = createGoalTree(tempDir, "marker-cleanup", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true, withMarker: true },
      ],
    });

    // S01 is APPROVED with a marker — folder should survive but marker should be cleaned
    await cleanupIncompleteSteps(goalDir, { revisionTriggerStep: 1 });

    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    // Marker should be removed
    expect(fs.existsSync(path.join(goalDir, "S01", "REVISE_PLAN_NEEDED"))).toBe(false);
  });

  it("handles missing trigger step folder gracefully", async () => {
    goalDir = createGoalTree(tempDir, "missing-trigger", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
      ],
    });

    // revisionTriggerStep: 99 — S99 doesn't exist
    // Should not throw
    await expect(cleanupIncompleteSteps(goalDir, { revisionTriggerStep: 99 })).resolves.toBeUndefined();

    // S01 should remain
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_revise_plan
// ---------------------------------------------------------------------------

describe("revisePlanTool.execute", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function getTool() {
    const registeredTools: Array<any> = [];
    const mockPi = {
      registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      registerCommand: vi.fn(),
    };
    register(mockPi as any);
    return registeredTools[0];
  }

  function makeCtx(cwd: string) {
    return {
      cwd,
      ui: { notify: vi.fn() },
      hasUI: false,
      sessionManager: { getSessionFile: vi.fn(() => ""), getEntries: vi.fn(() => []) },
      modelRegistry: {},
      model: undefined,
      isIdle: vi.fn(() => true),
      signal: undefined,
      abort: vi.fn(),
      hasPendingMessages: vi.fn(() => false),
      shutdown: vi.fn(),
      getContextUsage: vi.fn(),
      compact: vi.fn(),
      getSystemPrompt: vi.fn(() => ""),
    };
  }

  it("returns error when PLAN.md is missing", async () => {
    // Arrange: goal dir exists with GOAL.md but no PLAN.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-plan");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");

    const tool = getTool();
    const result = await tool.execute("test-id", { workspacePrefix: "goals/no-plan" }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/PLAN/i);
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, initialMessage)", async () => {
    createGoalTree(tempDir, "my-feature", { withGoal: true, withPlan: true });

    const tool = getTool();
    await tool.execute("test-id", { workspacePrefix: "goals/my-feature" }, undefined, undefined, makeCtx(tempDir));

    const task = readPendingTask(tempDir, "my-feature");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("revise-plan");
    expect(task!.params).toHaveProperty("workspacePrefix", "goals/my-feature");
    expect(task!.params).toHaveProperty("sessionName");
    expect(task!.params!.sessionName).toContain("revise-plan");
    expect(task!.params).toHaveProperty("queueKey", "my-feature");
    expect(task!.params).toHaveProperty("initialMessage");
  });
});

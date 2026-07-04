import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { readPendingTask } from "../../queues";
import { cleanupRevisionRequest, prepareSession } from "./callbacks";
import config, { register } from "./config";
import workflowSteps from "./workflow";

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
    stepFolders?: Array<{
      stepNumber: number;
      approved: boolean;
      withRevisionRequest?: boolean;
    }>;
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
      options.planContent ||
        "---\ntotalSteps: 3\nsteps:\n  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task\n  - name: step-3\n    complexity: task\n---\n# Plan\n",
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

    if (step.withRevisionRequest) {
      // Workspace-root REVISE_PLAN_NEEDED.md (unified location)
      fs.writeFileSync(
        path.join(goalDir, "REVISE_PLAN_NEEDED.md"),
        "# Revision needed\n",
        "utf-8",
      );
    }

    // Add some content files to make folders realistic
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(stepDir, "TEST.md"), "# Tests\n", "utf-8");
  }

  // Write PLAN.md with steps array if stepFolders are provided (for GoalState.steps() frontmatter derivation)
  if (
    options?.stepFolders &&
    options.stepFolders.length > 0 &&
    !options.withPlan
  ) {
    const totalSteps = Math.max(
      ...options.stepFolders.map((s) => s.stepNumber),
    );
    const stepsYaml = Array.from(
      { length: totalSteps },
      (_, i) => `  - name: step-${i + 1}\n    complexity: task`,
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
    fs.writeFileSync(
      path.join(archiveDir, "PLAN-2026-01-01T000000Z.md"),
      "# Old Plan\n",
      "utf-8",
    );
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// config structure
// ---------------------------------------------------------------------------

describe("config structure", () => {
  it("contract inputs includes GOAL.md, PLAN.md, and REVISE_PLAN_NEEDED.md", () => {
    const inputs = config.contract.inputs;
    expect(inputs.length).toBe(3);
    const names = inputs.map((i) => i.name);
    expect(names).toContain("goal");
    expect(names).toContain("existing-plan");
    expect(names).toContain("revise-plan-request");
    const revisePlanInput = inputs.find(
      (i) => i.name === "revise-plan-request",
    )!;
    expect(revisePlanInput.file).toBe("REVISE_PLAN_NEEDED.md");
  });

  it("contract outputs includes PLAN.md with schema", () => {
    expect(config.contract.outputs.length).toBe(1);
    const output = config.contract
      .outputs[0] as import("../../types").MarkdownFileSpec;
    expect(output.file).toBe("PLAN.md");
    expect(output.schema).toBeDefined();
  });

  it("prepareSession is a function", () => {
    expect(typeof config.prepareSession).toBe("function");
  });

  it("postExecute is defined and references cleanupRevisionRequest", () => {
    expect(config.postExecute).toBe(cleanupRevisionRequest);
  });
});

// ---------------------------------------------------------------------------
// config wiring consistency — integration
// ---------------------------------------------------------------------------

describe("config wiring consistency", () => {
  it("all lifecycle hooks point to the correct exported functions", () => {
    // prepareSession must be the exported prepareSession
    expect(config.prepareSession).toBe(prepareSession);
    // postExecute must be the exported cleanupRevisionRequest
    expect(config.postExecute).toBe(cleanupRevisionRequest);
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
    const planContent =
      "---\ntotalSteps: 3\n---\n# Original Plan\n\n## Step 1: Do something\n";
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
    const archiveFiles = fs
      .readdirSync(archiveDir)
      .filter((f) => /^PLAN-.*\.md$/.test(f));
    expect(archiveFiles.length).toBe(1);

    // Assert archived file content matches original
    const archivedContent = fs.readFileSync(
      path.join(archiveDir, archiveFiles[0]),
      "utf-8",
    );
    expect(archivedContent).toBe(planContent);

    // Assert original PLAN.md is preserved (copy-only behavior)
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(true);
  });

  it("creates PLAN_ARCHIVE/ directory if it does not exist", async () => {
    goalDir = createGoalTree(tempDir, "no-archive-dir", {
      withGoal: true,
      withPlan: true,
    });

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
    const archiveFiles = fs
      .readdirSync(archiveDir)
      .filter((f) => /^PLAN-.*\.md$/.test(f));

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
// Integration — end-to-end prepareSession workflow
// ---------------------------------------------------------------------------

describe("end-to-end lifecycle: prepareSession then cleanupRevisionRequest", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("prepareSession archives plan and preserves all folders; cleanupRevisionRequest deletes workspace-root document", async () => {
    const planContent =
      "---\ntotalSteps: 5\nsteps:\n  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task\n  - name: step-3\n    complexity: task\n  - name: step-4\n    complexity: task\n  - name: step-5\n    complexity: task\n---\n# Original Plan\n\n## Step 1: Done\n## Step 2: In progress\n## Step 3: Pending\n";

    goalDir = createGoalTree(tempDir, "full-lifecycle", {
      withGoal: true,
      withPlan: true,
      planContent: planContent,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: false },
      ],
    });

    // Create workspace-root REVISE_PLAN_NEEDED.md manually
    fs.writeFileSync(
      path.join(goalDir, "REVISE_PLAN_NEEDED.md"),
      "# Revision needed\n",
      "utf-8",
    );

    // Add SUMMARY.md to S03 to make it more realistic
    fs.writeFileSync(
      path.join(goalDir, "S03", "SUMMARY.md"),
      "# Summary\n",
      "utf-8",
    );

    // Phase 1: prepareSession — archive only, preserve all folders
    await prepareSession(goalDir);

    // PLAN_ARCHIVE/ has one timestamped file with correct content
    const archiveDir = path.join(goalDir, "PLAN_ARCHIVE");
    expect(fs.existsSync(archiveDir)).toBe(true);
    const archiveFiles = fs
      .readdirSync(archiveDir)
      .filter((f) => /^PLAN-.*\.md$/.test(f));
    expect(archiveFiles.length).toBe(1);
    const archivedContent = fs.readFileSync(
      path.join(archiveDir, archiveFiles[0]),
      "utf-8",
    );
    expect(archivedContent).toBe(planContent);

    // Original PLAN.md is preserved (copy-only behavior)
    expect(fs.existsSync(path.join(goalDir, "PLAN.md"))).toBe(true);

    // All step folders should still exist after prepareSession
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S01", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);

    // Workspace-root document should still exist after prepareSession
    expect(fs.existsSync(path.join(goalDir, "REVISE_PLAN_NEEDED.md"))).toBe(
      true,
    );

    // Phase 2: cleanupRevisionRequest — delete workspace-root document only
    await cleanupRevisionRequest(goalDir);

    // Workspace-root document should be deleted
    expect(fs.existsSync(path.join(goalDir, "REVISE_PLAN_NEEDED.md"))).toBe(
      false,
    );

    // All step folders should still exist (no folder deletion)
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupRevisionRequest — single-file deletion
// ---------------------------------------------------------------------------

describe("cleanupRevisionRequest", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes workspace-root REVISE_PLAN_NEEDED.md when it exists", async () => {
    goalDir = createGoalTree(tempDir, "cleanup-test", {
      withGoal: true,
      withPlan: true,
      stepFolders: [{ stepNumber: 1, approved: true }],
    });

    // Create the document at workspace root
    fs.writeFileSync(
      path.join(goalDir, "REVISE_PLAN_NEEDED.md"),
      "# Revision needed\n",
      "utf-8",
    );
    expect(fs.existsSync(path.join(goalDir, "REVISE_PLAN_NEEDED.md"))).toBe(
      true,
    );

    await cleanupRevisionRequest(goalDir);

    // Document should be deleted
    expect(fs.existsSync(path.join(goalDir, "REVISE_PLAN_NEEDED.md"))).toBe(
      false,
    );
  });

  it("does nothing when document does not exist (force: true)", async () => {
    goalDir = createGoalTree(tempDir, "no-doc", {
      withGoal: true,
      withPlan: true,
    });

    // Should not throw — force: true silently ignores missing files
    await expect(cleanupRevisionRequest(goalDir)).resolves.toBeUndefined();
  });

  it("preserves non-APPROVED S{NN}/ folders (no folder deletion)", async () => {
    goalDir = createGoalTree(tempDir, "preserves-folders", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: true },
        { stepNumber: 2, approved: false },
        { stepNumber: 3, approved: false },
      ],
    });

    // Create the document at workspace root
    fs.writeFileSync(
      path.join(goalDir, "REVISE_PLAN_NEEDED.md"),
      "# Revision needed\n",
      "utf-8",
    );

    await cleanupRevisionRequest(goalDir);

    // Document should be deleted
    expect(fs.existsSync(path.join(goalDir, "REVISE_PLAN_NEEDED.md"))).toBe(
      false,
    );
    // All step folders should still exist (no folder deletion)
    expect(fs.existsSync(path.join(goalDir, "S01"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S02"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03"))).toBe(true);
    // S02 and S03 content should be intact
    expect(fs.existsSync(path.join(goalDir, "S02", "TASK.md"))).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "S03", "TASK.md"))).toBe(true);
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
      sessionManager: {
        getSessionFile: vi.fn(() => ""),
        getEntries: vi.fn(() => []),
      },
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
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-plan" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    expect(result.content[0].text).toMatch(/PLAN/i);
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, initialMessage)", async () => {
    createGoalTree(tempDir, "my-feature", { withGoal: true, withPlan: true });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/my-feature", initialMessage: "test message" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "my-feature");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("revise-plan");
    expect(task?.params).toHaveProperty("workspacePrefix", "goals/my-feature");
    expect(task?.params).toHaveProperty("sessionName");
    expect(task?.params?.sessionName).toContain("revise-plan");
    expect(task?.params).toHaveProperty("queueKey", "my-feature");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
  });
});

// ---------------------------------------------------------------------------
// Workflow steps — self-review step exists
// ---------------------------------------------------------------------------

describe("revise-plan workflow steps", () => {
  it("contains a self-review step between write-plan and signal-completion", () => {
    const ids = workflowSteps.map((s) => s.id);
    const writePlanIdx = ids.indexOf("write-plan");
    const selfReviewIdx = ids.indexOf("self-review");
    const signalCompletionIdx = ids.indexOf("signal-completion");

    expect(selfReviewIdx).toBeGreaterThan(-1);
    expect(selfReviewIdx).toBe(writePlanIdx + 1);
    expect(signalCompletionIdx).toBe(selfReviewIdx + 1);
  });

  it("self-review step has instructions mentioning verification patterns", () => {
    const step = workflowSteps.find((s) => s.id === "self-review");
    expect(step).toBeDefined();
    const instructions = step!.instructions;
    expect(instructions).toMatch(/Verify|Validate|Check|Test|Confirm/);
  });

  it("self-review step instructions mention [COMPLETED] exclusion", () => {
    const step = workflowSteps.find((s) => s.id === "self-review");
    expect(step).toBeDefined();
    const instructions = step!.instructions;
    expect(instructions).toContain("[COMPLETED]");
  });
});

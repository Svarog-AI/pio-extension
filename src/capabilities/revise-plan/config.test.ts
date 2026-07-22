import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { readPendingTask } from "../../queues";
import { prepareSession } from "./callbacks";
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
  it("contract inputs includes GOAL.md, PLAN.md, and dynamic revision-context", () => {
    const inputs = config.contract.inputs;
    expect(inputs.length).toBe(3);
    const names = inputs.map((i) => i.name);
    expect(names).toContain("goal");
    expect(names).toContain("existing-plan");
    expect(names).toContain("revision-context");
    const revisionContextInput = inputs.find(
      (i) => i.name === "revision-context",
    )!;
    expect(revisionContextInput.paramKey).toBe("revisionContextFile");
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

  it("postExecute is absent (cleanup handled by resolver-based cleanup)", () => {
    expect((config as any).postExecute).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// config wiring consistency — integration
// ---------------------------------------------------------------------------

describe("config wiring consistency", () => {
  it("all lifecycle hooks point to the correct exported functions", () => {
    // prepareSession must be the exported prepareSession
    expect(config.prepareSession).toBe(prepareSession);
    // postExecute is absent — cleanup handled by resolver-based cleanup
    expect((config as any).postExecute).toBeUndefined();
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

  it("preserves non-APPROVED step folders (cleanup handled by resolver-based cleanup)", async () => {
    goalDir = createGoalTree(tempDir, "mixed-steps", {
      withGoal: true,
      withPlan: true,
      stepFolders: [
        { stepNumber: 1, approved: false },
        { stepNumber: 2, approved: true },
      ],
    });

    await prepareSession(goalDir);

    // S01 should still exist — cleanup is handled by resolver-based cleanup
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

  it("preserves multiple non-APPROVED folders (cleanup handled by resolver-based cleanup)", async () => {
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

    // All folders should still exist — cleanup is handled by resolver-based cleanup
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

  it("forwards goalFile to enqueued task params when provided", async () => {
    createGoalTree(tempDir, "goal-file-test", {
      withGoal: true,
      withPlan: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/goal-file-test", goalFile: "GOAL.md" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "goal-file-test");
    expect(task?.params?.goalFile).toBe("GOAL.md");
  });

  it("omits goalFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-goal-file", { withGoal: true, withPlan: true });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-goal-file" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "no-goal-file");
    expect(task?.params?.goalFile).toBeUndefined();
  });

  it("forwards planFile to enqueued task params when provided", async () => {
    createGoalTree(tempDir, "plan-file-test", {
      withGoal: true,
      withPlan: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/plan-file-test", planFile: "PLAN.md" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "plan-file-test");
    expect(task?.params?.planFile).toBe("PLAN.md");
  });

  it("omits planFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-plan-file", { withGoal: true, withPlan: true });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-plan-file" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "no-plan-file");
    expect(task?.params?.planFile).toBeUndefined();
  });

  it("forwards revisionContextFile to enqueued task params when provided", async () => {
    createGoalTree(tempDir, "revision-ctx-test", {
      withGoal: true,
      withPlan: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-id",
      {
        workspacePrefix: "goals/revision-ctx-test",
        revisionContextFile: "REVISE_PLAN_NEEDED.md",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "revision-ctx-test");
    expect(task?.params?.revisionContextFile).toBe("REVISE_PLAN_NEEDED.md");
  });

  it("omits revisionContextFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-revision-ctx", {
      withGoal: true,
      withPlan: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-revision-ctx" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "no-revision-ctx");
    expect(task?.params?.revisionContextFile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Workflow phases — self-review step exists
// ---------------------------------------------------------------------------

describe("revise-plan workflow phases", () => {
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

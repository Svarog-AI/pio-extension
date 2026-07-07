import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPendingTask } from "../../queues";
import config, { register } from "./config";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-finalize-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a minimal goal workspace tree.
 * Options control which files are present.
 */
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: { withQualityGate?: boolean; withPlan?: boolean },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // GOAL.md is required for goal workspace validity
  fs.writeFileSync(
    path.join(goalDir, "GOAL.md"),
    "# Goal\n\nTest goal.",
    "utf-8",
  );

  // Optionally create PLAN.md
  if (options?.withPlan) {
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "---\ntotalSteps: 1\nsteps:\n  - name: step-1\n    complexity: task\n---\n# Plan\n\n### Step 1: Test\n",
      "utf-8",
    );
  }

  // Optionally create QUALITY_GATE.md
  if (options?.withQualityGate) {
    fs.writeFileSync(
      path.join(goalDir, "QUALITY_GATE.md"),
      "---\nstatus: approved\n---\n# Quality Gate\n\nAll gates passed.",
      "utf-8",
    );
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// config structure
// ---------------------------------------------------------------------------

describe("config", () => {
  it("writeAllowlist is absent (auto-derived from CONTRACT.outputs)", () => {
    expect("writeAllowlist" in config).toBe(false);
  });

  it("CONTRACT.outputs declares 7 PROJECT files with projectRelative: true", () => {
    expect(config.contract.outputs).toHaveLength(7);
    const expectedFiles = [
      "PROJECT/OVERVIEW.md",
      "PROJECT/DEVELOPMENT.md",
      "PROJECT/CONVENTIONS.md",
      "PROJECT/GIT.md",
      "PROJECT/ARCHITECTURE.md",
      "PROJECT/DEPENDENCIES.md",
      "PROJECT/GLOSSARY.md",
    ];
    const outputFiles = config.contract.outputs.map((o: any) => o.file);
    for (const f of expectedFiles) {
      expect(outputFiles).toContain(f);
    }
  });

  it("CONTRACT.outputs all have projectRelative: true", () => {
    for (const entry of config.contract.outputs) {
      if ("file" in entry) {
        expect((entry as any).projectRelative).toBe(true);
      }
    }
  });

  it("CONTRACT.outputs have requiredWhen returning false (optional outputs)", () => {
    for (const entry of config.contract.outputs) {
      if ("requiredWhen" in entry && entry.requiredWhen) {
        expect(entry.requiredWhen()).toBe(false);
      }
    }
  });

  it("validation is undefined (no file validation)", () => {
    expect((config as any).validation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a tool named pio_finalize_goal", () => {
    const registeredTools: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push(tool);
      }),
      registerCommand: vi.fn(),
    };

    register(mockPi as any);

    const tool = registeredTools.find((t) => t.name === "pio_finalize_goal");
    expect(tool).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_finalize_goal
// ---------------------------------------------------------------------------

describe("finalizeGoalTool.execute", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  /**
   * Access the tool definition from the module.
   * finalizeGoalTool is not exported, but we can access it via register's registration.
   */
  function getTool() {
    const registeredTools: Array<any> = [];
    const mockPi = {
      registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      registerCommand: vi.fn(),
    };
    register(mockPi as any);
    return registeredTools[0];
  }

  /** Minimal ExtensionContext mock — only cwd is needed for the tool execute flow. */
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

  it("enqueues task with workspacePrefix and other params when goal is complete", async () => {
    // Arrange: create completed goal with quality gate passed
    createGoalTree(tempDir, "my-goal", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();

    // Act: call execute
    const result = await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/my-goal", initialMessage: "test message" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: result is success message
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued with correct params
    const task = readPendingTask(tempDir, "my-goal");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("finalize-goal");
    expect(task?.params).toHaveProperty("workspacePrefix", "goals/my-goal");
    expect(task?.params).toHaveProperty("sessionName", "my-goal finalize-goal");
    expect(task?.params).toHaveProperty("queueKey", "my-goal");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
    expect(task?.params).not.toHaveProperty("goalDir");
  });

  it("enqueues task when workspace does not exist (validation deferred to launch)", async () => {
    // Arrange: no goal created
    const tool = getTool();

    // Act
    const result = await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/nonexistent" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: task was enqueued (pre-validation removed, launch validates)
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued
    const task = readPendingTask(tempDir, "nonexistent");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("finalize-goal");
  });

  it("enqueues task when goal is not complete (validation deferred to launch)", async () => {
    // Arrange: create goal with PLAN.md but without QUALITY_GATE.md
    createGoalTree(tempDir, "incomplete", {
      withPlan: true,
      withQualityGate: false,
    });

    const tool = getTool();

    // Act
    const result = await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/incomplete" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: task was enqueued (pre-validation removed, launch validates)
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued
    const task = readPendingTask(tempDir, "incomplete");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("finalize-goal");
  });

  it("forwards goalFile to enqueued task params when provided", async () => {
    createGoalTree(tempDir, "goal-file-test", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/goal-file-test", goalFile: "GOAL.md" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "goal-file-test");
    expect(task?.params?.goalFile).toBe("GOAL.md");
  });

  it("omits goalFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-goal-file", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
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
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/plan-file-test", planFile: "PLAN.md" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "plan-file-test");
    expect(task?.params?.planFile).toBe("PLAN.md");
  });

  it("omits planFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-plan-file", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/no-plan-file" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "no-plan-file");
    expect(task?.params?.planFile).toBeUndefined();
  });

  it("forwards qualityGateFile to enqueued task params when provided", async () => {
    createGoalTree(tempDir, "quality-gate-file-test", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
      {
        workspacePrefix: "goals/quality-gate-file-test",
        qualityGateFile: "QUALITY_GATE.md",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "quality-gate-file-test");
    expect(task?.params?.qualityGateFile).toBe("QUALITY_GATE.md");
  });

  it("omits qualityGateFile from enqueued task params when not provided", async () => {
    createGoalTree(tempDir, "no-quality-gate-file", {
      withPlan: true,
      withQualityGate: true,
    });

    const tool = getTool();
    await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/no-quality-gate-file" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "no-quality-gate-file");
    expect(task?.params?.qualityGateFile).toBeUndefined();
  });
});

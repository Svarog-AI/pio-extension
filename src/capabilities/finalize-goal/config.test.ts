import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import config, { register } from "./config";
import { readPendingTask } from "../../queues";

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
  options?: { withCompletionSummary?: boolean; withPlan?: boolean },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // GOAL.md is required for goal workspace validity
  fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n\nTest goal.", "utf-8");

  // Optionally create PLAN.md
  if (options?.withPlan) {
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 1\nsteps:\n  - name: step-1\n    complexity: task\n---\n# Plan\n\n### Step 1: Test\n", "utf-8");
  }

  // Optionally create COMPLETION_SUMMARY.md
  if (options?.withCompletionSummary) {
    fs.writeFileSync(path.join(goalDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Goal Complete\n\nAll steps approved.", "utf-8");
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

  it("registers a command named pio-finalize-goal", () => {
    const registeredCommands: Array<{ name: string; options: { description: string } }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, options: { description: string; handler: Function }) => {
        registeredCommands.push({ name, options });
      }),
    };

    register(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-finalize-goal");
    expect(command).toBeDefined();
  });

  it("command description references PROJECT documentation or finalization", () => {
    const registeredCommands: Array<{ name: string; options: { description: string } }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, options: { description: string; handler: Function }) => {
        registeredCommands.push({ name, options });
      }),
    };

    register(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-finalize-goal");
    expect(command).toBeDefined();
    const desc = command!.options.description.toLowerCase();
    expect(desc).toMatch(/project|finalize|\.pio\/project/i);
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

  it("enqueues task with workspacePrefix and other params when goal is complete", async () => {
    // Arrange: create completed goal
    createGoalTree(tempDir, "my-goal", { withPlan: true, withCompletionSummary: true });

    const tool = getTool();

    // Act: call execute
    const result = await tool.execute("test-call-id", { workspacePrefix: "goals/my-goal" }, undefined, undefined, makeCtx(tempDir));

    // Assert: result is success message
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued with correct params
    const task = readPendingTask(tempDir, "my-goal");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("finalize-goal");
    expect(task!.params).toHaveProperty("workspacePrefix", "goals/my-goal");
    expect(task!.params).toHaveProperty("sessionName", "my-goal finalize-goal");
    expect(task!.params).toHaveProperty("queueKey", "my-goal");
    expect(task!.params).toHaveProperty("initialMessage");
    expect(task!.params).not.toHaveProperty("goalDir");
  });

  it("enqueues task when workspace does not exist (validation deferred to launch)", async () => {
    // Arrange: no goal created
    const tool = getTool();

    // Act
    const result = await tool.execute("test-call-id", { workspacePrefix: "goals/nonexistent" }, undefined, undefined, makeCtx(tempDir));

    // Assert: task was enqueued (pre-validation removed, launch validates)
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued
    const task = readPendingTask(tempDir, "nonexistent");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("finalize-goal");
  });

  it("enqueues task when goal is not complete (validation deferred to launch)", async () => {
    // Arrange: create goal with PLAN.md but without COMPLETION_SUMMARY.md
    createGoalTree(tempDir, "incomplete", { withPlan: true, withCompletionSummary: false });

    const tool = getTool();

    // Act
    const result = await tool.execute("test-call-id", { workspacePrefix: "goals/incomplete" }, undefined, undefined, makeCtx(tempDir));

    // Assert: task was enqueued (pre-validation removed, launch validates)
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued
    const task = readPendingTask(tempDir, "incomplete");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("finalize-goal");
  });
});

// ---------------------------------------------------------------------------
// Command handler — /pio-finalize-goal
// ---------------------------------------------------------------------------

describe("handleFinalizeGoal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  /** Capture the command handler from register registration. */
  function getHandler() {
    let capturedHandler: Function | undefined;
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((_name: string, options: { handler: Function }) => {
        capturedHandler = options.handler;
      }),
    };
    register(mockPi as any);
    return capturedHandler!;
  }

  /** Minimal ExtensionCommandContext mock. */
  function makeCtx(cwd: string) {
    const notifyMock = vi.fn();
    return {
      cwd,
      ui: { notify: notifyMock },
      hasUI: false,
      sessionManager: { getSessionFile: vi.fn(() => "") },
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
      waitForIdle: vi.fn().mockResolvedValue(undefined),
      newSession: vi.fn().mockResolvedValue({ cancelled: false }),
      fork: vi.fn().mockResolvedValue({ cancelled: false }),
      navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
      switchSession: vi.fn().mockResolvedValue({ cancelled: false }),
      reload: vi.fn().mockResolvedValue(undefined),
      _notify: notifyMock,
    };
  }

  it("shows usage message when no arguments provided", async () => {
    // Arrange
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler(undefined, ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/usage|Usage/i), "warning");
  });

  it("shows usage message when empty arguments provided", async () => {
    // Arrange
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("   ", ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/usage|Usage/i), "warning");
  });

  it("launches session when workspace exists", async () => {
    // Arrange: create completed goal
    createGoalTree(tempDir, "completed-goal", { withPlan: true, withCompletionSummary: true });

    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("--workspace-prefix goals/completed-goal", ctx);

    // Assert: newSession was called (launchCapability does this)
    expect(ctx.newSession).toHaveBeenCalled();
  });

  it("shows error when workspace does not exist (validation at launch time)", async () => {
    // Arrange
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("--workspace-prefix goals/nonexistent-goal", ctx);

    // Assert: launchCapability validates inputs and throws on missing files;
    // command handler catches and notifies
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/missing|validation/i), "error");
  });

  it("shows error when goal is not complete (validation at launch time)", async () => {
    // Arrange: create goal with PLAN.md but without COMPLETION_SUMMARY.md
    createGoalTree(tempDir, "incomplete", { withPlan: true, withCompletionSummary: false });

    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("--workspace-prefix goals/incomplete", ctx);

    // Assert: launchCapability validates inputs and throws on missing files;
    // command handler catches and notifies
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/missing|COMPLETION_SUMMARY/i), "error");
  });
});

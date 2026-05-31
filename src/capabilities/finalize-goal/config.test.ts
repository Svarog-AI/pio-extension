import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CAPABILITY_CONFIG, setupFinalizeGoal, validateFinalizeGoal } from "./config";
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
  options?: { withCompleted?: boolean },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // GOAL.md is required for goal workspace validity
  fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n\nTest goal.", "utf-8");

  // Optionally create COMPLETED marker
  if (options?.withCompleted) {
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// CAPABILITY_CONFIG structure
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG", () => {
  it("prompt is 'finalize-goal.md'", () => {
    expect(CAPABILITY_CONFIG.prompt).toBe("finalize-goal.md");
  });

  it("writeAllowlist contains exactly 7 file paths", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toHaveLength(7);
  });

  it("writeAllowlist includes OVERVIEW.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/OVERVIEW.md");
  });

  it("writeAllowlist includes DEVELOPMENT.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/DEVELOPMENT.md");
  });

  it("writeAllowlist includes CONVENTIONS.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/CONVENTIONS.md");
  });

  it("writeAllowlist includes GIT.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/GIT.md");
  });

  it("writeAllowlist includes ARCHITECTURE.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/ARCHITECTURE.md");
  });

  it("writeAllowlist includes DEPENDENCIES.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/DEPENDENCIES.md");
  });

  it("writeAllowlist includes GLOSSARY.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/GLOSSARY.md");
  });

  it("validation is undefined (no file validation)", () => {
    expect(CAPABILITY_CONFIG.validation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setupFinalizeGoal registration
// ---------------------------------------------------------------------------

describe("setupFinalizeGoal", () => {
  it("registers a tool named pio_finalize_goal", () => {
    const registeredTools: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push(tool);
      }),
      registerCommand: vi.fn(),
    };

    setupFinalizeGoal(mockPi as any);

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

    setupFinalizeGoal(mockPi as any);

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

    setupFinalizeGoal(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-finalize-goal");
    expect(command).toBeDefined();
    const desc = command!.options.description.toLowerCase();
    expect(desc).toMatch(/project|finalize|\.pio\/project/i);
  });
});

// ---------------------------------------------------------------------------
// validateFinalizeGoal
// ---------------------------------------------------------------------------

describe("validateFinalizeGoal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: true when goal dir exists and COMPLETED marker is present", async () => {
    // Arrange: create goal dir with COMPLETED
    createGoalTree(tempDir, "completed-goal", { withCompleted: true });

    // Act
    const result = await validateFinalizeGoal("completed-goal", tempDir);

    // Assert
    expect(result.ready).toBe(true);
  });

  it("returns error when goal directory does not exist", async () => {
    // Arrange: no goal dir created
    // Act
    const result = await validateFinalizeGoal("nonexistent-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/not exist|does not exist|create/i);
    }
  });

  it("returns error when COMPLETED marker is missing (goal not complete)", async () => {
    // Arrange: create goal dir without COMPLETED
    createGoalTree(tempDir, "incomplete-goal", { withCompleted: false });

    // Act
    const result = await validateFinalizeGoal("incomplete-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/not.*complete|complete|finish/i);
    }
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
   * finalizeGoalTool is not exported, but we can access it via setupFinalizeGoal's registration.
   */
  function getTool() {
    const registeredTools: Array<any> = [];
    const mockPi = {
      registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      registerCommand: vi.fn(),
    };
    setupFinalizeGoal(mockPi as any);
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

  it("enqueues task with goalDir (not goalName) when goal is complete", async () => {
    // Arrange: create completed goal
    createGoalTree(tempDir, "my-goal", { withCompleted: true });

    const tool = getTool();

    // Act: call execute
    const result = await tool.execute("test-call-id", { name: "my-goal" }, undefined, undefined, makeCtx(tempDir));

    // Assert: result is success message
    const text = result.content[0].text;
    expect(text).toContain("queued");

    // Assert: task was enqueued with correct params (goalDir, NOT goalName)
    const task = readPendingTask(tempDir, "my-goal");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("finalize-goal");
    expect(task!.params).toHaveProperty("goalDir");
    expect(task!.params).not.toHaveProperty("goalName");
  });

  it("returns error when goal does not exist", async () => {
    // Arrange: no goal created
    const tool = getTool();

    // Act
    const result = await tool.execute("test-call-id", { name: "nonexistent" }, undefined, undefined, makeCtx(tempDir));

    // Assert: error message mentions goal doesn't exist
    const text = result.content[0].text;
    expect(text).toMatch(/not exist|does not exist/i);

    // Assert: no task was enqueued
    const task = readPendingTask(tempDir, "nonexistent");
    expect(task).toBeUndefined();
  });

  it("returns error when goal is not complete", async () => {
    // Arrange: create goal without COMPLETED
    createGoalTree(tempDir, "incomplete", { withCompleted: false });

    const tool = getTool();

    // Act
    const result = await tool.execute("test-call-id", { name: "incomplete" }, undefined, undefined, makeCtx(tempDir));

    // Assert: error message mentions not complete
    const text = result.content[0].text;
    expect(text).toMatch(/not.*complete|finish/i);

    // Assert: no task was enqueued
    const task = readPendingTask(tempDir, "incomplete");
    expect(task).toBeUndefined();
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

  /** Capture the command handler from setupFinalizeGoal registration. */
  function getHandler() {
    let capturedHandler: Function | undefined;
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((_name: string, options: { handler: Function }) => {
        capturedHandler = options.handler;
      }),
    };
    setupFinalizeGoal(mockPi as any);
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

  it("shows error when goal does not exist", async () => {
    // Arrange
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("nonexistent-goal", ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/not exist|does not exist/i), "error");
  });

  it("shows error when goal is not complete", async () => {
    // Arrange: create goal without COMPLETED
    createGoalTree(tempDir, "incomplete", { withCompleted: false });

    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    // Act
    await handler("incomplete", ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/not.*complete|finish/i), "error");
  });
});

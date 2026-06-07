import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import config, { register } from "./config";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-execute-plan-test-"));
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
  options?: { withGoal?: boolean; withPlan?: boolean },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  if (options?.withGoal) {
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n\nTest goal.", "utf-8");
  }
  if (options?.withPlan) {
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n\n### Step 1: Test\n", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// config structure
// ---------------------------------------------------------------------------

describe("config", () => {
  it("capability is execute-plan", () => {
    expect(config.capability).toBe("execute-plan");
  });

  it("inputValidation requires GOAL.md and PLAN.md", () => {
    expect(config.inputValidation).toEqual({
      requiredFiles: ["GOAL.md", "PLAN.md"],
    });
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a tool named pio_execute_plan", () => {
    const registeredTools: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push(tool);
      }),
      registerCommand: vi.fn(),
    };

    register(mockPi as any);

    const tool = registeredTools.find((t) => t.name === "pio_execute_plan");
    expect(tool).toBeDefined();
  });

  it("registers a command named pio-execute-plan", () => {
    const registeredCommands: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string) => {
        registeredCommands.push({ name });
      }),
    };

    register(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-execute-plan");
    expect(command).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_execute_plan
// ---------------------------------------------------------------------------

describe("execute-plan tool execute — pre-launch validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  /** Access the tool definition from the module. */
  function getTool() {
    const registeredTools: Array<any> = [];
    const mockPi = {
      registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
      registerCommand: vi.fn(),
    };
    register(mockPi as any);
    return registeredTools[0];
  }

  /** Minimal ExtensionContext mock. */
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

  it("enqueues task when GOAL.md and PLAN.md exist", async () => {
    createGoalTree(tempDir, "valid", { withGoal: true, withPlan: true });

    const tool = getTool();
    const result = await tool.execute("test-id", { name: "valid" }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toContain("queued");
  });

  it("returns error when goal workspace does not exist", async () => {
    const tool = getTool();
    const result = await tool.execute("test-id", { name: "nonexistent" }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/does not exist/i);
  });

  it("returns error when GOAL.md is missing", async () => {
    createGoalTree(tempDir, "no-goal", { withGoal: false, withPlan: true });

    const tool = getTool();
    const result = await tool.execute("test-id", { name: "no-goal" }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/GOAL\.md/i);
  });

  it("returns error when PLAN.md is missing", async () => {
    createGoalTree(tempDir, "no-plan", { withGoal: true, withPlan: false });

    const tool = getTool();
    const result = await tool.execute("test-id", { name: "no-plan" }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/PLAN\.md/i);
  });
});

// ---------------------------------------------------------------------------
// Command handler — /pio-execute-plan
// ---------------------------------------------------------------------------

describe("handleExecutePlan", () => {
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
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler(undefined, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/usage|Usage/i), "warning");
  });

  it("shows error when goal workspace does not exist", async () => {
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler("nonexistent", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/does not exist/i), "error");
  });

  it("shows error when GOAL.md is missing", async () => {
    createGoalTree(tempDir, "no-goal", { withGoal: false, withPlan: true });

    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler("no-goal", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/GOAL\.md/i), "error");
  });

  it("shows error when PLAN.md is missing", async () => {
    createGoalTree(tempDir, "no-plan", { withGoal: true, withPlan: false });

    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler("no-plan", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/PLAN\.md/i), "error");
  });
});

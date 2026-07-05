import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPendingTask } from "../../queues";
import config, { CONTRACT, register } from "./config";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-quality-gate-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createWorkspace(
  tempDir: string,
  goalName: string,
  requirementsFile: string,
  requirementsContent = "# Requirements\n\nTest requirements.",
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, requirementsFile),
    requirementsContent,
    "utf-8",
  );
  return goalDir;
}

// ---------------------------------------------------------------------------
// config structure
// ---------------------------------------------------------------------------

describe("config", () => {
  it("capability is quality-gate", () => {
    expect(config.capability).toBe("quality-gate");
  });

  it("contract inputs declares requirements with paramKey", () => {
    const input = CONTRACT.inputs.find((i) => i.name === "requirements");
    expect(input).toBeDefined();
    expect(input?.paramKey).toBe("requirementsFile");
  });

  it("contract outputs declares quality-gate-report with QUALITY_GATE.md", () => {
    const output = Array.isArray(CONTRACT.outputs)
      ? CONTRACT.outputs.find((o: any) => o.name === "quality-gate-report")
      : undefined;
    expect(output).toBeDefined();
    expect((output as any)?.file).toBe("QUALITY_GATE.md");
  });

  it("contract outputs have schema defined", () => {
    const output = Array.isArray(CONTRACT.outputs)
      ? CONTRACT.outputs.find((o: any) => o.name === "quality-gate-report")
      : undefined;
    expect((output as any)?.schema).toBeDefined();
  });

  it("skills mandatory includes pio-git and ask-user", () => {
    expect(config.skills?.mandatory).toContain("pio-git");
    expect(config.skills?.mandatory).toContain("ask-user");
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a tool named pio_quality_gate", () => {
    const registeredTools: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push(tool);
      }),
      registerCommand: vi.fn(),
    };

    register(mockPi as any);

    const tool = registeredTools.find((t) => t.name === "pio_quality_gate");
    expect(tool).toBeDefined();
  });

  it("registers a command named pio-quality-gate", () => {
    const registeredCommands: Array<{
      name: string;
      options: { description: string };
    }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(
        (name: string, options: { description: string; handler: Function }) => {
          registeredCommands.push({ name, options });
        },
      ),
    };

    register(mockPi as any);

    const command = registeredCommands.find(
      (c) => c.name === "pio-quality-gate",
    );
    expect(command).toBeDefined();
  });

  it("command description references quality gate", () => {
    const registeredCommands: Array<{
      name: string;
      options: { description: string };
    }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(
        (name: string, options: { description: string; handler: Function }) => {
          registeredCommands.push({ name, options });
        },
      ),
    };

    register(mockPi as any);

    const command = registeredCommands.find(
      (c) => c.name === "pio-quality-gate",
    );
    expect(command).toBeDefined();
    const desc = command?.options.description.toLowerCase();
    expect(desc).toMatch(/quality.?gate/i);
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_quality_gate
// ---------------------------------------------------------------------------

describe("qualityGateTool.execute", () => {
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

  it("enqueues task with workspacePrefix and other params", async () => {
    createWorkspace(tempDir, "my-goal", "COMPLETION_SUMMARY.md");

    const tool = getTool();

    const result = await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/my-goal", initialMessage: "test message" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const text = result.content[0].text;
    expect(text).toContain("queued");

    const task = readPendingTask(tempDir, "my-goal");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("quality-gate");
    expect(task?.params).toHaveProperty("workspacePrefix", "goals/my-goal");
    expect(task?.params).toHaveProperty("sessionName", "my-goal quality-gate");
    expect(task?.params).toHaveProperty("queueKey", "my-goal");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
  });

  it("enqueues task when workspace does not exist", async () => {
    const tool = getTool();

    const result = await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/nonexistent" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const text = result.content[0].text;
    expect(text).toContain("queued");

    const task = readPendingTask(tempDir, "nonexistent");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("quality-gate");
  });
});

// ---------------------------------------------------------------------------
// Command handler — /pio-quality-gate
// ---------------------------------------------------------------------------

describe("handleQualityGate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function getHandler() {
    let capturedHandler: Function | undefined;
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(
        (_name: string, options: { handler: Function }) => {
          capturedHandler = options.handler;
        },
      ),
    };
    register(mockPi as any);
    return capturedHandler!;
  }

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

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/usage|Usage/i),
      "warning",
    );
  });

  it("shows usage message when empty arguments provided", async () => {
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler("   ", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/usage|Usage/i),
      "warning",
    );
  });

  it("shows error when workspace does not exist", async () => {
    const handler = getHandler();
    const ctx = makeCtx(tempDir);

    await handler("--workspace-prefix goals/nonexistent-goal", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringMatching(/missing|validation/i),
      "error",
    );
  });
});

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
      { workspacePrefix: "goals/my-goal", additionalContext: "test message" },
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
    expect(task?.params).toHaveProperty("additionalContext");
    expect(task?.params?.additionalContext).toBe("test message");
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
// Tool execute — requirementsFile forwarding
// ---------------------------------------------------------------------------

describe("qualityGateTool.execute — requirementsFile forwarding", () => {
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

  it("forwards requirementsFile to enqueued task params when provided", async () => {
    createWorkspace(tempDir, "my-goal", "COMPLETION_SUMMARY.md");

    const tool = getTool();

    await tool.execute(
      "test-call-id",
      {
        workspacePrefix: "goals/my-goal",
        requirementsFile: "CUSTOM_REQUIREMENTS.md",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "my-goal");
    expect(task?.params?.requirementsFile).toBe("CUSTOM_REQUIREMENTS.md");
  });

  it("omits requirementsFile from enqueued task params when not provided", async () => {
    createWorkspace(tempDir, "my-goal", "COMPLETION_SUMMARY.md");

    const tool = getTool();

    await tool.execute(
      "test-call-id",
      { workspacePrefix: "goals/my-goal" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "my-goal");
    expect(task?.params?.requirementsFile).toBeUndefined();
  });
});

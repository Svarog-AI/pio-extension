import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import config, { CONTRACT, register } from "./config";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const mockEnqueueTask = vi.hoisted(() => vi.fn());

vi.mock("../../queues", () => ({
  enqueueTask: mockEnqueueTask,
  readPendingTask: vi.fn(),
  listPendingTasks: vi.fn(),
  queueDir: vi.fn().mockReturnValue("/mock/queue"),
}));

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-playground-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CONTRACT
// ---------------------------------------------------------------------------

describe("CONTRACT", () => {
  it("has empty inputs array", () => {
    expect(CONTRACT.inputs).toEqual([]);
  });

  it("has exactly one output with correct name and file", () => {
    expect(CONTRACT.outputs).toHaveLength(1);
    const output = CONTRACT.outputs[0];
    // Output is a MarkdownFileSpec (not a OneOfGroup or array)
    expect(Array.isArray(output)).toBe(false);
    expect(output).not.toHaveProperty("kind");
    expect((output as any).name).toBe("playground-output");
    expect((output as any).file).toBe("PLAYGROUND.md");
  });
});

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (default export)
// ---------------------------------------------------------------------------

describe("CapabilityPackageConfig (default export)", () => {
  it("has capability name workflow-playground", () => {
    expect(config.capability).toBe("workflow-playground");
  });

  it("references CONTRACT", () => {
    expect(config.contract).toBe(CONTRACT);
  });

  it("has writeAllowlist with PLAYGROUND.md", () => {
    expect(config.writeAllowlist).toEqual(["PLAYGROUND.md"]);
  });

  it("defaultInitialMessage returns a non-empty instructional string", () => {
    const msg = config.defaultInitialMessage("", undefined);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).not.toBe("Ready.");
  });
});

// ---------------------------------------------------------------------------
// pio_launch_playground tool
// ---------------------------------------------------------------------------

describe("pio_launch_playground tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mockEnqueueTask.mockClear();
  });

  afterEach(() => cleanup(tempDir));

  it("is registered with name pio_launch_playground", () => {
    const tool = getTool();
    expect(tool.name).toBe("pio_launch_playground");
  });

  it("creates directory and enqueues task without checking workspace existence", async () => {
    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/test-playground" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: workspace was created
    expect(
      fs.existsSync(path.join(tempDir, ".pio", "goals", "test-playground")),
    ).toBe(true);

    // Assert: task was enqueued
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("queued");
  });

  it("applies default workspacePrefix when not provided", async () => {
    const tool = getTool();
    // Call with no workspacePrefix — the execute body should fall back to "goals/test-playground"
    await tool.execute("test-id", {}, undefined, undefined, makeCtx(tempDir));

    // Assert: default workspace was created
    expect(
      fs.existsSync(path.join(tempDir, ".pio", "goals", "test-playground")),
    ).toBe(true);

    // Assert: task was enqueued with default prefix
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempDir,
      expect.any(String),
      expect.objectContaining({
        capability: "workflow-playground",
        params: expect.objectContaining({
          workspacePrefix: "goals/test-playground",
        }),
      }),
    );
  });

  it("does not check if workspace exists before creating", async () => {
    // Pre-create the workspace directory
    const workspaceDir = path.join(tempDir, ".pio", "goals", "test-playground");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/test-playground" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: no collision error — playground always allows overwriting
    expect(result.content[0].text).not.toContain("ask_user");
    expect(result.content[0].text).not.toContain("already exists");

    // Assert: task was still enqueued
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
  });
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";

import { register } from "./config";

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-create-goal-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// createGoalTool.execute — collision detection
// ---------------------------------------------------------------------------

describe("createGoalTool.execute — collision detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mockEnqueueTask.mockClear();
  });

  afterEach(() => cleanup(tempDir));

  it("returns message mentioning ask_user when workspace already exists and is non-empty", async () => {
    // Arrange: create a non-empty workspace directory
    const workspaceDir = path.join(tempDir, ".pio", "goals", "existing-goal");
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, "GOAL.md"), "# Existing Goal", "utf-8");

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/existing-goal" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: message instructs agent to call ask_user
    expect(result.content[0].text).toContain("ask_user");
  });

  it("does not create directory or enqueue task on collision", async () => {
    // Arrange: create a non-empty workspace
    const workspaceDir = path.join(tempDir, ".pio", "goals", "existing-goal");
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, "GOAL.md"), "# Existing Goal", "utf-8");

    const tool = getTool();
    await tool.execute(
      "test-id",
      { workspacePrefix: "goals/existing-goal" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: no task was enqueued
    expect(mockEnqueueTask).not.toHaveBeenCalled();
  });

  it("creates directory and enqueues task when workspace does not exist", async () => {
    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/new-goal" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: workspace was created
    expect(fs.existsSync(path.join(tempDir, ".pio", "goals", "new-goal"))).toBe(true);

    // Assert: task was enqueued
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("queued");
  });
});

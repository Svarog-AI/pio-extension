import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-direct-tools-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const mockEnqueueTask = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());

vi.mock("./queues", () => ({
  enqueueTask: mockEnqueueTask,
  readPendingTask: vi.fn(),
  listPendingTasks: vi.fn(),
  queueDir: vi.fn().mockReturnValue("/mock/queue"),
}));

vi.mock("./state-machines", () => ({
  dispatch: mockDispatch,
  getOutgoingEdges: vi.fn(),
  registerMachine: vi.fn(),
  unregisterMachine: vi.fn(),
  recordTransition: mockRecordTransition,
  goalDrivenDevelopment: { id: "goal-driven-development" },
}));

const mockResolveCapabilityConfigDirect = vi.hoisted(() => vi.fn());

vi.mock("./capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfigDirect,
}));



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ExtensionCommandContext with a pio-config entry.
 */
function makeMockCtx(configData?: Record<string, unknown>): ExtensionCommandContext {
  return {
    cwd: "/test/cwd",
    sessionManager: {
      getEntries: () =>
        configData
          ? [{ type: "custom" as const, customType: "pio-config" as const, data: configData }]
          : [],
    },
    ui: {
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
}

/**
 * Build a mock context with no pio-config entry (not in a capability session).
 */
function makeMockCtxNoConfig(): ExtensionCommandContext {
  return {
    cwd: "/test/cwd",
    sessionManager: {
      getEntries: () => [],
    },
    ui: {
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
}

// ---------------------------------------------------------------------------
// Tests — goalFromIssueTool.execute
// ---------------------------------------------------------------------------

describe("goalFromIssueTool.execute", () => {
  let tempCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let goalFromIssueTool: { execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempCwd = createTempDir();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempCwd);
    mockEnqueueTask.mockClear();
    mockRecordTransition.mockClear();
    mockResolveCapabilityConfigDirect.mockClear();

    // Import fresh to get the real tool definition
    const { setupDirectTools } = await import("./direct-tools");

    // Capture the registered tool
    const registeredTools: { name: string; execute: Function }[] = [];
    const mockPi = {
      registerTool: (t: { name: string; execute: Function }) => {
        registeredTools.push({ name: t.name, execute: t.execute });
      },
      registerCommand: vi.fn(),
      on: vi.fn(),
      setSessionName: vi.fn(),
    };
    setupDirectTools(mockPi as any);

    goalFromIssueTool = registeredTools.find((t) => t.name === "pio_goal_from_issue");
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cleanup(tempCwd);
  });

  it("returns error when issue does not exist", async () => {
    const mockCtx = makeMockCtxNoConfig();
    (mockCtx as any).cwd = tempCwd;

    const result = await goalFromIssueTool!.execute(
      "test-id",
      { issuePath: "nonexistent-issue" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("not found");
  });

  it("returns error when goal workspace already exists", async () => {
    // Arrange: create issue file and goal workspace
    const issuesDir = path.join(tempCwd, ".pio", "issues");
    fs.mkdirSync(issuesDir, { recursive: true });
    fs.writeFileSync(path.join(issuesDir, "my-issue.md"), "# My Issue\n\nDescription", "utf-8");

    // Create goal workspace (collision)
    const goalsDir = path.join(tempCwd, ".pio", "goals", "my-issue");
    fs.mkdirSync(goalsDir, { recursive: true });

    const mockCtx = makeMockCtxNoConfig();
    (mockCtx as any).cwd = tempCwd;

    const result = await goalFromIssueTool!.execute(
      "test-id",
      { issuePath: "my-issue.md" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toMatch(/already exists/i);
    expect(result.content[0].text).toContain("ask_user");
    expect(result.content[0].text).toContain("/pio-delete-goal");
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, initialMessage)", async () => {
    // Arrange: create issue file
    const issuesDir = path.join(tempCwd, ".pio", "issues");
    fs.mkdirSync(issuesDir, { recursive: true });
    fs.writeFileSync(path.join(issuesDir, "fix-bug.md"), "# Fix Bug\n\nFix a bug", "utf-8");

    const mockCtx = makeMockCtxNoConfig();
    (mockCtx as any).cwd = tempCwd;

    await goalFromIssueTool!.execute(
      "test-id",
      { issuePath: "fix-bug.md" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempCwd,
      "fix-bug",
      expect.objectContaining({
        capability: "create-goal",
        params: expect.objectContaining({
          workspacePrefix: "goals/fix-bug",
          sessionName: "fix-bug create-goal",
          queueKey: "fix-bug",
          initialMessage: expect.stringContaining("fix-bug"),
        }),
      }),
    );
  });

  it("includes fileCleanup in enqueued params", async () => {
    // Arrange: create issue file
    const issuesDir = path.join(tempCwd, ".pio", "issues");
    fs.mkdirSync(issuesDir, { recursive: true });
    const issuePath = path.join(issuesDir, "some-issue.md");
    fs.writeFileSync(issuePath, "# Some Issue\n\nDescription", "utf-8");

    const mockCtx = makeMockCtxNoConfig();
    (mockCtx as any).cwd = tempCwd;

    await goalFromIssueTool!.execute(
      "test-id",
      { issuePath: "some-issue.md" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    const call = mockEnqueueTask.mock.calls[0];
    expect(call[2].params.fileCleanup).toContain(issuePath);
  });
});

// ---------------------------------------------------------------------------
// Tests — handleGoalFromIssue (command handler)
// ---------------------------------------------------------------------------

describe("handleGoalFromIssue — command handler", () => {
  let tempCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let handler: Function | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempCwd = createTempDir();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempCwd);
    mockEnqueueTask.mockClear();
    mockRecordTransition.mockClear();
    mockResolveCapabilityConfigDirect.mockClear();

    // Import fresh to get the real definitions
    const { setupDirectTools } = await import("./direct-tools");

    // Capture the registered command
    const registeredCommands: Array<{ name: string; handler: Function }> = [];
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: (name: string, config: { handler: Function }) => {
        registeredCommands.push({ name, handler: config.handler });
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };
    setupDirectTools(mockPi as any);

    handler = registeredCommands.find((c) => c.name === "pio-goal-from-issue")?.handler;
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cleanup(tempCwd);
  });

  it("shows goal name in collision notification (not undefined)", async () => {
    // Arrange: create issue file and goal workspace (collision)
    const issuesDir = path.join(tempCwd, ".pio", "issues");
    fs.mkdirSync(issuesDir, { recursive: true });
    fs.writeFileSync(path.join(issuesDir, "my-issue.md"), "# My Issue", "utf-8");

    const goalsDir = path.join(tempCwd, ".pio", "goals", "my-issue");
    fs.mkdirSync(goalsDir, { recursive: true });

    const mockNotify = vi.fn();
    const mockCtx = {
      cwd: tempCwd,
      ui: { notify: mockNotify },
      sessionManager: { getEntries: () => [] },
    };

    // Act
    await handler!("my-issue.md", mockCtx);

    // Assert: notification contains the actual goal name, not "undefined"
    expect(mockNotify).toHaveBeenCalled();
    const [message, severity] = mockNotify.mock.calls[0];
    expect(message).toContain("my-issue");
    expect(message).not.toContain("undefined");
    expect(message).not.toContain("ask_user");
    expect(message).toContain("already exists");
    expect(severity).toBe("warning");
  });

  it("shows issue-not-found message when issue file does not exist", async () => {
    // Arrange: no issue file
    const mockNotify = vi.fn();
    const mockCtx = {
      cwd: tempCwd,
      ui: { notify: mockNotify },
      sessionManager: { getEntries: () => [] },
    };

    // Act
    await handler!("nonexistent.md", mockCtx);

    // Assert: notification says not found (not a collision message)
    expect(mockNotify).toHaveBeenCalled();
    const [message, severity] = mockNotify.mock.calls[0];
    expect(message).toContain("not found");
    expect(message).not.toContain("already exists");
    expect(severity).toBe("warning");
  });
});

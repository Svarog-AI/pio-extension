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
// Tests — pio_transition tool
// ---------------------------------------------------------------------------

describe("pio_transition tool", () => {
  let tempCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let transitionTool: { execute: Function } | undefined;

  beforeEach(async () => {
    vi.resetModules();
    tempCwd = createTempDir();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempCwd);
    mockEnqueueTask.mockClear();
    mockRecordTransition.mockClear();
    mockResolveCapabilityConfigDirect.mockClear();
    mockResolveCapabilityConfigDirect.mockImplementation((_cwd, params) => {
      const cap = typeof params?.capability === "string" ? params.capability : "unknown";
      // getSessionConfig passes { capability, ...sessionParams } to resolveCapabilityConfig
      // sessionParams may contain workingDir override for tests
      const { capability: _cap, workingDir, ...rest } = params ?? {};
      return {
        capability: cap,
        workingDir: workingDir ?? "/test/.pio/goals/test",
        sessionParams: rest,
        contract: { inputs: [], outputs: [] },
      };
    });

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

    transitionTool = registeredTools.find((t) => t.name === "pio_transition");
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cleanup(tempCwd);
  });

  it("returns error when not inside a capability session", async () => {
    const mockCtx = makeMockCtxNoConfig();

    const result = await transitionTool!.execute(
      "test-id",
      { capability: "create-plan" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("Not inside a capability session");
  });

  it("enqueues task with correct queue key derived from queueKey", async () => {
    const mockCtx = makeMockCtx({
      capability: "execute-task",
      sessionParams: { queueKey: "my-feature", stepNumber: 1, workingDir: "/repo/.pio/goals/my-feature" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "review-task" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempCwd,
      "my-feature",
      expect.objectContaining({
        capability: "review-task",
        params: expect.objectContaining({ queueKey: "my-feature", stepNumber: 1 }),
      }),
    );
  });

  it("falls back to capability name as queue key when queueKey is absent", async () => {
    const mockCtx = makeMockCtx({
      capability: "some-capability",
      sessionParams: { workingDir: "/some/other/dir" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "next-capability" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempCwd,
      "some-capability",
      expect.objectContaining({
        capability: "next-capability",
      }),
    );
  });

  it("merges user-provided params on top of session params", async () => {
    const mockCtx = makeMockCtx({
      capability: "execute-task",
      sessionParams: { queueKey: "my-feature", stepNumber: 1, existing: "value", workingDir: "/repo/.pio/goals/my-feature" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "review-task", params: { stepNumber: 2, newUser: "data" } },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempCwd,
      "my-feature",
      expect.objectContaining({
        capability: "review-task",
        params: expect.objectContaining({
          queueKey: "my-feature",
          stepNumber: 2,
          existing: "value",
          newUser: "data",
        }),
      }),
    );
  });

  it("calls recordTransition only when in a goal workspace", async () => {
    // Goal workspace — should call recordTransition
    const mockCtxGoal = makeMockCtx({
      capability: "execute-task",
      sessionParams: { queueKey: "my-feature", workingDir: "/repo/.pio/goals/my-feature" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "review-task" },
      new AbortController().signal,
      () => {},
      mockCtxGoal,
    );

    expect(mockRecordTransition).toHaveBeenCalledTimes(1);
    mockRecordTransition.mockClear();

    // Non-goal workspace — should NOT call recordTransition
    const mockCtxNonGoal = makeMockCtx({
      capability: "execute-task",
      sessionParams: { workingDir: "/some/random/dir" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "review-task" },
      new AbortController().signal,
      () => {},
      mockCtxNonGoal,
    );

    expect(mockRecordTransition).not.toHaveBeenCalled();
  });

  it("uses stateMachineId from session params when available", async () => {
    const mockCtx = makeMockCtx({
      capability: "execute-task",
      sessionParams: { queueKey: "my-feature", stateMachineId: "custom-machine", workingDir: "/repo/.pio/goals/my-feature" },
    });

    await transitionTool!.execute(
      "test-id",
      { capability: "review-task" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    // recordTransition should be called with the custom stateMachineId
    expect(mockRecordTransition).toHaveBeenCalledWith(
      "/repo/.pio/goals/my-feature",
      "execute-task",
      expect.objectContaining({
        capability: "review-task",
        stateMachineId: "custom-machine",
      }),
    );
  });

  it("returns success message with next-task hint", async () => {
    const mockCtx = makeMockCtx({
      capability: "execute-task",
      sessionParams: { queueKey: "my-feature", workingDir: "/repo/.pio/goals/my-feature" },
    });

    const result = await transitionTool!.execute(
      "test-id",
      { capability: "review-task" },
      new AbortController().signal,
      () => {},
      mockCtx,
    );

    expect(result.content[0].text).toContain("Task enqueued: review-task");
    expect(result.content[0].text).toContain("/pio-next-task");
  });
});

// ---------------------------------------------------------------------------
// Tests — /pio-transition command
// ---------------------------------------------------------------------------

describe("/pio-transition command", () => {
  let handleTransition: (args: string | undefined, ctx: ExtensionCommandContext) => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    mockDispatch.mockClear();

    // Import fresh
    const { setupDirectTools } = await import("./direct-tools");

    // Capture the registered command handler
    let commandHandler: Function | undefined;
    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: (_name: string, opts: { handler: Function }) => {
        if (_name === "pio-transition") {
          commandHandler = opts.handler;
        }
      },
      on: vi.fn(),
      setSessionName: vi.fn(),
    };
    setupDirectTools(mockPi as any);
    handleTransition = commandHandler as any;
  });

  it("reports error when not in a capability session", async () => {
    const mockCtx = makeMockCtxNoConfig();
    const notifySpy = vi.spyOn((mockCtx as any).ui, "notify");

    await handleTransition(undefined, mockCtx);

    expect(notifySpy).toHaveBeenCalledWith(
      "Not inside a capability session. Cannot determine transition context.",
      "info",
    );
  });

  it("lists the sole transition when only one match exists", async () => {
    mockDispatch.mockReturnValue([
      { capability: "create-plan", stateMachineId: "goal-driven-development" },
    ]);

    const mockCtx = makeMockCtx({
      capability: "create-goal",
      sessionParams: { queueKey: "my-feature", workingDir: "/repo/.pio/goals/my-feature" },
    });
    const notifySpy = vi.spyOn((mockCtx as any).ui, "notify");

    await handleTransition(undefined, mockCtx);

    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining("create-plan"),
      "info",
    );
    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining("Only transition"),
      "info",
    );
  });

  it("displays numbered list for multiple matches", async () => {
    mockDispatch.mockReturnValue([
      { capability: "revise-plan", stateMachineId: "goal-driven-development" },
      { capability: "execute-task", stateMachineId: "goal-driven-development" },
    ]);

    const mockCtx = makeMockCtx({
      capability: "evolve-plan",
      sessionParams: { queueKey: "my-feature", stepNumber: 1, workingDir: "/repo/.pio/goals/my-feature" },
    });
    const notifySpy = vi.spyOn((mockCtx as any).ui, "notify");

    await handleTransition(undefined, mockCtx);

    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining("1. revise-plan"),
      "info",
    );
    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining("2. execute-task"),
      "info",
    );
  });

  it("reports terminal state when no transitions match", async () => {
    mockDispatch.mockReturnValue([]);

    const mockCtx = makeMockCtx({
      capability: "finalize-goal",
      workingDir: "/repo/.pio/goals/my-feature",
      sessionParams: { queueKey: "my-feature" },
    });
    const notifySpy = vi.spyOn((mockCtx as any).ui, "notify");

    await handleTransition(undefined, mockCtx);

    expect(notifySpy).toHaveBeenCalledWith(
      expect.stringContaining("terminal"),
      "info",
    );
  });
});

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

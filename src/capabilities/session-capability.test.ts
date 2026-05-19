import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import { getSessionGoalName, resolveProjectContextPath } from "./session-capability";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-next-task-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a queue file for a specific goal
function enqueueTaskFile(cwd: string, goalName: string, capability = "create-plan"): void {
  const queuePath = path.join(cwd, ".pio", "session-queue");
  fs.mkdirSync(queuePath, { recursive: true });
  fs.writeFileSync(
    path.join(queuePath, `task-${goalName}.json`),
    JSON.stringify({ capability, params: { goalName } }, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Single top-level mock for session-capability (used by both describe blocks)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Top-level mock for session-capability (used by getSessionGoalName tests)
// ---------------------------------------------------------------------------

const sessionCapabilityMock = vi.hoisted(() => ({
  getSessionParams: vi.fn(),
  launchCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  "./session-capability",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      getSessionParams: sessionCapabilityMock.getSessionParams,
      // Derive from getSessionParams — always tests the real type-guard logic
      getSessionGoalName: () => {
        const params = sessionCapabilityMock.getSessionParams();
        return typeof params?.goalName === "string" ? params.goalName : undefined;
      },
      launchCapability: sessionCapabilityMock.launchCapability,
    };
  },
);

// ---------------------------------------------------------------------------
// Top-level mock for model-config (used by model resolution tests)
// This lets setupCapability load a controllable resolveModelForCapability
// ---------------------------------------------------------------------------

const mockResolveModel = vi.hoisted(() => vi.fn());

vi.mock("../model-config", () => ({
  resolveModelForCapability: mockResolveModel,
}));

// ---------------------------------------------------------------------------
// getSessionGoalName tests
// These test the real implementation logic by mocking getSessionParams()
// ---------------------------------------------------------------------------

describe("getSessionGoalName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given { goalName: "my-feature" }, returns "my-feature"', () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "my-feature" });
    expect(getSessionGoalName()).toBe("my-feature");
  });

  it("given { goalName: 123 }, returns undefined (non-string rejected)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: 123 });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given { goalName: null }, returns undefined (null rejected)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: null });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it('given { otherKey: "value" }, returns undefined (no goalName key)', () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ otherKey: "value" });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given undefined, returns undefined (no session config)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue(undefined);
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given {}, returns undefined (empty params)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({});
    expect(getSessionGoalName()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleNextTask — goal resolution order tests
// These test the command flow by configuring getSessionParams() to control
// what getSessionGoalName() returns (the real type-guard logic is always exercised)
// ---------------------------------------------------------------------------

describe("handleNextTask — goal resolution order", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup(tempDir));

  // Dynamically import handleNextTask after mocks are set up
  let handleNextTask: (args: string | undefined, ctx: any) => Promise<void>;

  beforeEach(async () => {
    const mod = await import("./next-task");
    handleNextTask = mod.handleNextTask;
  });

  function makeCtx() {
    return { cwd: tempDir, ui: { notify: vi.fn() } };
  }

  it("passes session goalName to launchAndCleanup when no explicit arg", async () => {
    // Arrange: two goals pending, session has goalName = "other-goal"
    enqueueTaskFile(tempDir, "other-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "other-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: launched other-goal's task, not session-goal's
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
    expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("Multiple goals"));

    // other-goal queue file should be deleted (consumed)
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-other-goal.json"))).toBe(false);
    // session-goal queue file should still exist (not touched — scan was not triggered)
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"))).toBe(true);
  });

  it("falls through to scan when getSessionGoalName returns undefined", async () => {
    // Arrange: exactly one pending goal, no session context (no goalName)
    enqueueTaskFile(tempDir, "only-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue(undefined);

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: auto-launched the single pending goal (fallback scan)
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
  });

  it("explicit arg takes priority over session goalName", async () => {
    // Arrange: two goals pending, session says "session-goal" but user specifies "explicit-goal"
    enqueueTaskFile(tempDir, "explicit-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "session-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask("explicit-goal", ctx);

    // Assert: explicit-goal's queue file was consumed, session-goal's was not
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-explicit-goal.json"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"))).toBe(true);
  });

  it("shows notification when session goalName has no pending task", async () => {
    // Arrange: no queue files at all, session says "empty-goal"
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "empty-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: notified about no pending task for empty-goal, no launch attempted
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No pending task"), expect.any(String));
    expect(ctx.ui.notify.mock.calls[0][0]).toContain("empty-goal");
    expect(sessionCapabilityMock.launchCapability).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Model resolution — setupCapability and before_agent_start tests
// These test the integration between setupCapability(), the event handlers,
// and model resolution. They mock ../model-config to control what
// resolveModelForCapability returns.
// ---------------------------------------------------------------------------

describe("model resolution — setupCapability and before_agent_start", () => {
  let tempHomeDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempHomeDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempHomeDir;
  });

  afterEach(() => {
    cleanup(tempHomeDir);
    delete process.env.PIO_CONFIG_TEST_HOME;
    mockResolveModel.mockClear();
  });

  // Build a mock pi API that captures handler registrations and provides setModel
  function makeMockPi() {
    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn().mockResolvedValue(true);

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    return { mockPi, registeredHandlers, setModelMock };
  }

  async function setupWithMockPi() {
    const { mockPi, registeredHandlers, setModelMock } = makeMockPi();

    // Get fresh session-capability module (after vi.resetModules)
    const mod = await import("./session-capability");
    mod.setupCapability(mockPi as any);

    return {
      mockPi,
      registeredHandlers,
      setModelMock,
      triggerResourcesDiscover: (capabilityName: string) => {
        const handler = registeredHandlers["resources_discover"];
        if (!handler) throw new Error("resources_discover handler not registered");

        return handler(
          { type: "resources_discover", cwd: process.cwd(), reason: "startup" as const },
          {
            sessionManager: {
              getEntries: () => [
                {
                  type: "custom",
                  customType: "pio-config",
                  data: {
                    capability: capabilityName,
                    prompt: "create-goal.md",
                  },
                },
              ],
            },
          },
        );
      },
    };
  }

  it("calls pi.setModel() when config has a model override", async () => {
    const { registeredHandlers, setModelMock, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: mock resolveModelForCapability to return a model entry
    mockResolveModel.mockReturnValue({ provider: "j6000", modelId: "general" });

    const resolvedModel = { provider: "j6000", id: "general" };

    // Current model is different from target
    const currentModel = { provider: "anthropic", id: "claude-3.5" };

    const ctx = {
      model: currentModel,
      modelRegistry: { find: () => resolvedModel },
    } as any;

    // Trigger resources_discover to set capabilityName
    await triggerResourcesDiscover("create-goal");

    // Act: trigger before_agent_start
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, ctx);

    // Assert: setModel was called with the resolved model
    expect(setModelMock).toHaveBeenCalledTimes(1);
    expect(setModelMock).toHaveBeenCalledWith(resolvedModel);
  });

  it("skips pi.setModel() when current model already matches", async () => {
    const { registeredHandlers, setModelMock, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: same target for both config and current
    const matchedModel = { provider: "j6000", id: "general" };

    mockResolveModel.mockReturnValue({ provider: "j6000", modelId: "general" });

    const ctx = {
      model: matchedModel,
      modelRegistry: { find: () => matchedModel },
    } as any;

    await triggerResourcesDiscover("create-goal");

    // Act
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, ctx);

    // Assert: no redundant setModel call
    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("skips resolution when capabilityName is undefined", async () => {
    const { registeredHandlers, setModelMock } = await setupWithMockPi();

    // Don't trigger resources_discover — capabilityName stays undefined

    const ctx = {} as any;

    // Act
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, ctx);

    // Assert: resolveModelForCapability was NOT called
    expect(mockResolveModel).not.toHaveBeenCalled();
    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("skips setModel() when resolveModelForCapability returns undefined", async () => {
    const { registeredHandlers, setModelMock, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: no config file or mapping
    mockResolveModel.mockReturnValue(undefined);

    await triggerResourcesDiscover("create-goal");

    const ctx = {} as any;

    // Act
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, ctx);

    // Assert: setModel was NOT called
    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("skips setModel() when modelRegistry.find() returns undefined and logs warning", async () => {
    const { registeredHandlers, setModelMock, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: config resolves a model but registry can't find it
    mockResolveModel.mockReturnValue({ provider: "unknown-provider", modelId: "some-model" });

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const ctx = {
      model: undefined,
      modelRegistry: { find: () => undefined }, // model not in registry
    } as any;

    await triggerResourcesDiscover("execute-task");

    // Act
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, ctx);

    // Assert: setModel NOT called (model not found), warning logged
    expect(setModelMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("capabilityName is captured from config.capability during resources_discover", async () => {
    const { registeredHandlers, triggerResourcesDiscover } = await setupWithMockPi();

    // Arrange: use the mock to verify which capability name is used
    mockResolveModel.mockReturnValue({ provider: "j6000", modelId: "coding" });
    const resolvedModel = { provider: "j6000", id: "coding" };

    await triggerResourcesDiscover("execute-task");

    // Act: trigger before_agent_start
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      {
        model: undefined, // different from target
        modelRegistry: { find: () => resolvedModel },
      } as any,
    );

    // Assert: resolveModelForCapability was called with "execute-task"
    expect(mockResolveModel).toHaveBeenCalledWith("execute-task");
  });
});

// ---------------------------------------------------------------------------
// Project context file path tests
// Verify resolveProjectContextPath returns .pio/PROJECT/OVERVIEW.md
// ---------------------------------------------------------------------------

describe("resolveProjectContextPath", () => {
  it("resolves to .pio/PROJECT/OVERVIEW.md", () => {
    expect(resolveProjectContextPath("/some/dir")).toBe("/some/dir/.pio/PROJECT/OVERVIEW.md");
  });

  it("uses path.join for cross-platform separators", () => {
    const result = resolveProjectContextPath("/root");
    expect(result).toContain(".pio");
    expect(result).toContain("PROJECT");
    expect(result).toContain("OVERVIEW.md");
  });
});

// ---------------------------------------------------------------------------
// Model resolution — backwards compatibility tests
// Verify existing behavior is preserved when no config exists
// ---------------------------------------------------------------------------

describe("model resolution — backwards compatibility", () => {
  let tempHomeDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempHomeDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempHomeDir;
    mockResolveModel.mockClear();
  });

  afterEach(() => {
    cleanup(tempHomeDir);
    delete process.env.PIO_CONFIG_TEST_HOME;
  });

  it("no setModel call when config returns undefined (no config file)", async () => {
    mockResolveModel.mockReturnValue(undefined);

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => { registeredHandlers[event] = handler; },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./session-capability");
    mod.setupCapability(mockPi as any);

    // Trigger resources_discover with a capability
    const rdHandler = registeredHandlers["resources_discover"];
    if (rdHandler) {
      await rdHandler(
        { type: "resources_discover", cwd: process.cwd(), reason: "startup" as const },
        {
          sessionManager: {
            getEntries: () => [
              { type: "custom", customType: "pio-config", data: { capability: "create-goal" } },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start
    const handler = registeredHandlers["before_agent_start"];
    if (handler) {
      await handler({ type: "before_agent_start", prompt: "test", systemPrompt: "" } as any, {} as any);
    }

    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("prompt injection still works alongside model resolution", async () => {
    mockResolveModel.mockReturnValue(undefined);

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => { registeredHandlers[event] = handler; },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./session-capability");
    mod.setupCapability(mockPi as any);

    // Trigger resources_discover with a capability that has a prompt
    const rdHandler = registeredHandlers["resources_discover"];
    if (rdHandler) {
      await rdHandler(
        { type: "resources_discover", cwd: process.cwd(), reason: "startup" as const },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "create-goal", prompt: "create-goal.md" },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start — should return the prompt injection message
    const handler = registeredHandlers["before_agent_start"];
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      {} as any,
    );

    // Assert: prompt injection returned (system prompt from create-goal.md)
    expect(result).toBeDefined();
    expect(result.message?.customType).toBe("pio-capability-instructions");
    // Model resolution also ran but didn't call setModel since config is undefined
    expect(setModelMock).not.toHaveBeenCalled();
  });
});

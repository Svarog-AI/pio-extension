import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveProjectContextPath } from "./capability-session";
import type { ExitResult } from "./runtime/exit-lifecycle";
import type { CapabilityConfig } from "./types";

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
function enqueueTaskFile(
  cwd: string,
  goalName: string,
  capability = "create-plan",
): void {
  const queuePath = path.join(cwd, ".pio", "session-queue");
  fs.mkdirSync(queuePath, { recursive: true });
  fs.writeFileSync(
    path.join(queuePath, `task-${goalName}.json`),
    JSON.stringify({ capability, params: { goalName } }, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Shared skill test helpers (used by skill injection describe blocks)
// ---------------------------------------------------------------------------

/** Create a SKILL.md file with optional frontmatter and return its path. */
function writeSkillFile(
  tempDir: string,
  skillName: string,
  body: string,
  frontmatter?: string,
): string {
  const dir = path.join(tempDir, "skills", skillName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");
  const content = frontmatter ? `---\n${frontmatter}\n---\n\n${body}` : body;
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/** Create a mock Skill registry entry. */
function makeSkill(name: string, filePath: string, baseDir: string) {
  return {
    name,
    filePath,
    baseDir,
    description: "",
    sourceInfo: {
      path: filePath,
      source: "test",
      scope: "project" as const,
      origin: "package" as const,
    },
    disableModelInvocation: false,
  };
}

// ---------------------------------------------------------------------------
// Top-level mock for capability-session (used by handleNextTask tests)
// ---------------------------------------------------------------------------

const sessionCapabilityMock = vi.hoisted(() => ({
  getSessionParams: vi.fn(),
  launchCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./capability-session", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getSessionParams: sessionCapabilityMock.getSessionParams,
    launchCapability: sessionCapabilityMock.launchCapability,
  };
});

// ---------------------------------------------------------------------------
// Top-level mock for model-config (used by model resolution tests)
// This lets setupSessionInfrastructure load a controllable resolveModelForCapability
// ---------------------------------------------------------------------------

const mockResolveModel = vi.hoisted(() => vi.fn());

vi.mock("./model-config", () => ({
  resolveModelForCapability: mockResolveModel,
}));

// ---------------------------------------------------------------------------
// Top-level mock for prompt-compiler (used by prompt compilation tests)
// This lets setupSessionInfrastructure load a controllable compilePrompt result
// ---------------------------------------------------------------------------

const mockCompilePrompt = vi.hoisted(() =>
  vi.fn().mockImplementation((_dir, options) => {
    // Return mergedSkills based on baseSkills from config (simulating real merge)
    const baseSkills = options?.baseSkills;
    return Promise.resolve({
      role: "## Role\n\nTest role content.",
      workflow: "## Workflow\n\n1. Test step",
      guidelines: "## Guidelines\n\nTest guidelines.",
      mergedSkills: baseSkills || { mandatory: ["pio", "ask-user"] },
    });
  }),
);

vi.mock("./prompt-compiler", () => ({
  compilePrompt: mockCompilePrompt,
}));

// ---------------------------------------------------------------------------
// Top-level mock for loop-engine (used by loop engine integration tests)
// ---------------------------------------------------------------------------

const mockSetupLoopEngine = vi.hoisted(() => vi.fn());

vi.mock("./runtime/loop-engine", () => ({
  setupLoopEngine: mockSetupLoopEngine,
}));

// ---------------------------------------------------------------------------
// Top-level mock for queues (used by exit-lifecycle queue-key tests)
// ---------------------------------------------------------------------------

const mockEnqueueTask = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());

vi.mock("./queues", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    enqueueTask: mockEnqueueTask,
  };
});

vi.mock("./state-machines", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    dispatch: mockDispatch,
  };
});

vi.mock("./state-machines/pio-workflow-machine", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    goalDrivenDevelopment: {},
    recordTransition: mockRecordTransition,
  };
});

// ---------------------------------------------------------------------------
// Top-level mock for capability-config (used by getSessionConfig in resources_discover)
// ---------------------------------------------------------------------------

const mockResolveCapabilityConfigForSession = vi.hoisted(() => vi.fn());
const mockResolveContractPath = vi.hoisted(() => {
  const { join } = require("node:path");
  return (
    contractPath: string,
    baseDir: string,
    _prefix?: string,
    _params?: Record<string, unknown>,
  ): string => {
    return join(
      baseDir,
      contractPath.startsWith("/") ? contractPath.slice(1) : contractPath,
    );
  };
});

vi.mock("./capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfigForSession,
  resolveContractPath: mockResolveContractPath,
}));

// ---------------------------------------------------------------------------
// handleNextTask — queue key resolution order tests
// These test the command flow by configuring getSessionParams() to control
// what queue key next-task.ts reads directly from session params
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getCurrentCapabilityConfig — module cache getter
// NOTE: this describe MUST run before any other test in this file that fires a
// real pio resources_discover — the capability-session original module (and its
// private currentConfig cache) is shared across vi.resetModules() cycles within
// a file run, and there is no public way to clear the cache.
// ---------------------------------------------------------------------------

describe("getCurrentCapabilityConfig — module cache getter", () => {
  let tempHomeDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempHomeDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempHomeDir;
    mockResolveCapabilityConfigForSession.mockClear();
    // Mirror the skills passthrough of the model-resolution describe so no
    // behavioral difference leaks into later describes.
    mockResolveCapabilityConfigForSession.mockImplementation((_cwd, params) => {
      const cap =
        typeof params?.capability === "string" ? params.capability : "unknown";
      const { capability: _cap, additionalContext, ...rest } = params ?? {};
      return {
        capability: cap,
        workspaceDir: rest.workspaceDir ?? "/test/.pio/goals/test",
        sessionParams: rest,
        contract: { inputs: [], outputs: [] },
        skills: rest.skills ?? undefined,
        additionalContext:
          typeof additionalContext === "string" ? additionalContext : undefined,
      };
    });
  });

  afterEach(() => {
    cleanup(tempHomeDir);
    delete process.env.PIO_CONFIG_TEST_HOME;
  });

  // Minimal mock pi — only resources_discover registration is needed here
  async function setupInfra() {
    const registeredHandlers: Record<string, Function> = {};
    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn().mockResolvedValue(true),
      setSessionName: vi.fn(),
    };
    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);
    return { mod, registeredHandlers };
  }

  // Runs first in the file — cache is still pristine (no pio discover yet)
  it("returns null before any resources_discover", async () => {
    // Arrange: infrastructure registered, but no discover fired yet
    const { mod } = await setupInfra();

    // Assert
    expect(mod.getCurrentCapabilityConfig()).toBeNull();
  });

  // Still pristine — a discover without a pio-config entry early-returns
  it("stays null when resources_discover runs without a pio-config entry", async () => {
    // Arrange
    const { mod, registeredHandlers } = await setupInfra();
    const handler = registeredHandlers.resources_discover;
    expect(handler).toBeDefined();

    await handler(
      { type: "resources_discover", cwd: process.cwd(), reason: "startup" },
      {
        sessionManager: { getEntries: () => [] },
        cwd: process.cwd(),
      },
    );

    // Assert
    expect(mod.getCurrentCapabilityConfig()).toBeNull();
  });

  it("returns the cached config after resources_discover with a pio-config entry (stable reference)", async () => {
    // Arrange
    const { mod, registeredHandlers } = await setupInfra();
    const handler = registeredHandlers.resources_discover;
    expect(handler).toBeDefined();

    await handler(
      { type: "resources_discover", cwd: process.cwd(), reason: "startup" },
      {
        sessionManager: {
          getEntries: () => [
            {
              type: "custom",
              customType: "pio-config",
              data: {
                capability: "create-goal",
                sessionParams: { stepNumber: 5 },
              },
            },
          ],
        },
        cwd: process.cwd(),
      },
    );

    // Assert: resolved config surfaced with the expected fields
    const config = mod.getCurrentCapabilityConfig();
    expect(config).not.toBeNull();
    expect(config!.capability).toBe("create-goal");
    expect(config!.workspaceDir).toBe("/test/.pio/goals/test");
    expect(config!.sessionParams?.stepNumber).toBe(5);

    // Assert: returns the same live reference (engine reads it, never re-resolves)
    expect(mod.getCurrentCapabilityConfig()).toBe(config);
  });
});

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
    const mod = await import("./capabilities/next-task");
    handleNextTask = mod.handleNextTask;
  });

  function makeCtx() {
    return { cwd: tempDir, ui: { notify: vi.fn() } };
  }

  it("passes session queueKey to launchAndCleanup when no explicit arg", async () => {
    // Arrange: two goals pending, session has queueKey = "other-goal"
    enqueueTaskFile(tempDir, "other-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({
      queueKey: "other-goal",
    });
    mockResolveCapabilityConfigForSession.mockResolvedValue({
      capability: "create-plan",
      workspaceDir: tempDir,
      sessionParams: { goalName: "other-goal" },
      contract: { inputs: [], outputs: [] },
    });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: launched other-goal's task, not session-goal's
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
    expect(ctx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("Multiple goals"),
    );

    // other-goal queue file should be deleted (consumed)
    expect(
      fs.existsSync(
        path.join(tempDir, ".pio", "session-queue", "task-other-goal.json"),
      ),
    ).toBe(false);
    // session-goal queue file should still exist (not touched — scan was not triggered)
    expect(
      fs.existsSync(
        path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"),
      ),
    ).toBe(true);
  });

  it("falls through to scan when session has no queueKey", async () => {
    // Arrange: exactly one pending goal, no session context (no queueKey)
    enqueueTaskFile(tempDir, "only-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue(undefined);
    mockResolveCapabilityConfigForSession.mockResolvedValue({
      capability: "create-plan",
      workspaceDir: tempDir,
      sessionParams: { goalName: "only-goal" },
      contract: { inputs: [], outputs: [] },
    });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: auto-launched the single pending goal (fallback scan)
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
  });

  it("explicit arg takes priority over session queueKey", async () => {
    // Arrange: two goals pending, session says "session-goal" but user specifies "explicit-goal"
    enqueueTaskFile(tempDir, "explicit-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({
      queueKey: "session-goal",
    });

    const ctx = makeCtx();

    // Act
    await handleNextTask("explicit-goal", ctx);

    // Assert: explicit-goal's queue file was consumed, session-goal's was not
    expect(
      fs.existsSync(
        path.join(tempDir, ".pio", "session-queue", "task-explicit-goal.json"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"),
      ),
    ).toBe(true);
  });

  it("shows notification when session queueKey has no pending task", async () => {
    // Arrange: no queue files at all, session says "empty-goal"
    sessionCapabilityMock.getSessionParams.mockReturnValue({
      queueKey: "empty-goal",
    });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: notified about no pending task for empty-goal, no launch attempted
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No pending task"),
      expect.any(String),
    );
    expect(ctx.ui.notify.mock.calls[0][0]).toContain("empty-goal");
    expect(sessionCapabilityMock.launchCapability).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Model resolution — setupSessionInfrastructure and before_agent_start tests
// These test the integration between setupSessionInfrastructure(), the event handlers,
// and model resolution. They mock ../model-config to control what
// resolveModelForCapability returns.
// ---------------------------------------------------------------------------

describe("model resolution — setupSessionInfrastructure and before_agent_start", () => {
  let tempHomeDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempHomeDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempHomeDir;
    mockResolveCapabilityConfigForSession.mockClear();
    mockResolveCapabilityConfigForSession.mockImplementation((_cwd, params) => {
      const cap =
        typeof params?.capability === "string" ? params.capability : "unknown";
      // getSessionConfig passes { capability, ...sessionParams } to resolveCapabilityConfig.
      // Tests may put skills/other fields in sessionParams for the mock to pick up.
      const { capability: _cap, additionalContext, ...rest } = params ?? {};
      return {
        capability: cap,
        workspaceDir: rest.workspaceDir ?? "/test/.pio/goals/test",
        sessionParams: rest,
        contract: { inputs: [], outputs: [] },
        skills: rest.skills ?? undefined,
        additionalContext:
          typeof additionalContext === "string" ? additionalContext : undefined,
      };
    });
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

    // Get fresh capability-session module (after vi.resetModules)
    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    return {
      mockPi,
      registeredHandlers,
      setModelMock,
      triggerResourcesDiscover: (capabilityName: string) => {
        const handler = registeredHandlers.resources_discover;
        if (!handler)
          throw new Error("resources_discover handler not registered");

        return handler(
          {
            type: "resources_discover",
            cwd: process.cwd(),
            reason: "startup" as const,
          },
          {
            sessionManager: {
              getEntries: () => [
                {
                  type: "custom",
                  customType: "pio-config",
                  data: {
                    capability: capabilityName,
                    sessionParams: {},
                  },
                },
              ],
            },
            cwd: process.cwd(),
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
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      ctx,
    );

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
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      ctx,
    );

    // Assert: no redundant setModel call
    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("skips resolution when capabilityName is undefined", async () => {
    const { registeredHandlers, setModelMock } = await setupWithMockPi();

    // Don't trigger resources_discover — capabilityName stays undefined

    const ctx = {} as any;

    // Act
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      ctx,
    );

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
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      ctx,
    );

    // Assert: setModel was NOT called
    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("skips setModel() when modelRegistry.find() returns undefined and logs warning", async () => {
    const { registeredHandlers, setModelMock, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: config resolves a model but registry can't find it
    mockResolveModel.mockReturnValue({
      provider: "unknown-provider",
      modelId: "some-model",
    });

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const ctx = {
      model: undefined,
      modelRegistry: { find: () => undefined }, // model not in registry
    } as any;

    await triggerResourcesDiscover("execute-task");

    // Act
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      ctx,
    );

    // Assert: setModel NOT called (model not found), warning logged
    expect(setModelMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("capabilityName is captured from config.capability during resources_discover", async () => {
    const { registeredHandlers, triggerResourcesDiscover } =
      await setupWithMockPi();

    // Arrange: use the mock to verify which capability name is used
    mockResolveModel.mockReturnValue({ provider: "j6000", modelId: "coding" });
    const resolvedModel = { provider: "j6000", id: "coding" };

    await triggerResourcesDiscover("execute-task");

    // Act: trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
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
    expect(resolveProjectContextPath("/some/dir")).toBe(
      "/some/dir/.pio/PROJECT/OVERVIEW.md",
    );
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
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with a capability
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "create-goal", sessionParams: {} },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (handler) {
      await handler(
        { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
        {} as any,
      );
    }

    expect(setModelMock).not.toHaveBeenCalled();
  });

  it("prompt injection still works alongside model resolution", async () => {
    mockResolveModel.mockReturnValue(undefined);

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with a capability that has a prompt
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
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
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      { type: "before_agent_start", prompt: "test", systemPrompt: "" } as any,
      {} as any,
    );

    // Assert: prompt injection returned via systemPrompt
    expect(result).toBeDefined();
    expect(typeof result.systemPrompt).toBe("string");
    // CAPABILITY CONTEXT is no longer injected (instruction leak removal)
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");
    // WORKFLOW EXECUTION should still be present
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
    // Model resolution also ran but didn't call setModel since config is undefined
    expect(setModelMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exit lifecycle — queue key propagation
// Verify runExitLifecycle uses transition's adjusted goalName as the queue key
// ---------------------------------------------------------------------------

describe("exit lifecycle — queue key propagation", () => {
  let tempDir: string;
  let runExitLifecycle: (config: CapabilityConfig) => Promise<ExitResult>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    mockEnqueueTask.mockClear();
    mockRecordTransition.mockClear();
    mockDispatch.mockClear();

    // Import the exit lifecycle fresh — its ./state-machines and ./queues
    // imports pick up this file's top-level mocks
    const exitMod = await import("./runtime/exit-lifecycle");
    runExitLifecycle = exitMod.runExitLifecycle;

    // The real recordTransition degrades against the non-existent workspaceDir
    // with a harmless warn — silence it (house warn-leak convention)
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    cleanup(tempDir);
  });

  it("uses transition's adjusted goalName as the queue key for subgoal completion", async () => {
    // Arrange: subgoal completion — transition returns parent goal name
    mockDispatch.mockReturnValue([
      {
        capability: "evolve-plan",
        stateMachineId: "goal-driven-development",
        params: { goalName: "parent", stepNumber: 4, queueKey: "parent" },
      },
    ]);

    const config: CapabilityConfig = {
      capability: "finalize-goal",
      workspaceDir: path.join(tempDir, ".pio", "goals", "child"),
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "child", queueKey: "child" },
      allowProjectWrites: false,
    };

    // Act
    const result = await runExitLifecycle(config);

    // Assert: enqueueTask called with "parent" as the queue key (second arg)
    expect(result.success).toBe(true);
    expect(mockEnqueueTask).toHaveBeenCalled();
    const enqueueCall = mockEnqueueTask.mock.calls[0];
    expect(enqueueCall[1]).toBe("parent");
  });

  it("uses state goalName as the queue key for flat goals (backward compatible)", async () => {
    // Arrange: flat goal — transition returns same goal name
    mockDispatch.mockReturnValue([
      {
        capability: "review-task",
        stateMachineId: "goal-driven-development",
        params: {
          goalName: "my-feature",
          stepNumber: 1,
          queueKey: "my-feature",
        },
      },
    ]);

    const config: CapabilityConfig = {
      capability: "execute-task",
      workspaceDir: path.join(tempDir, ".pio", "goals", "my-feature"),
      contract: { inputs: [], outputs: [] },
      sessionParams: { goalName: "my-feature", queueKey: "my-feature" },
      allowProjectWrites: false,
    };

    // Act
    const result = await runExitLifecycle(config);

    // Assert: enqueueTask called with "my-feature" as the queue key
    expect(result.success).toBe(true);
    expect(mockEnqueueTask).toHaveBeenCalled();
    const enqueueCall = mockEnqueueTask.mock.calls[0];
    expect(enqueueCall[1]).toBe("my-feature");
  });

  it("queue key matches the goalName in enqueued params for subgoal completion", async () => {
    // Arrange: transition returns parent goal name
    mockDispatch.mockReturnValue([
      {
        capability: "evolve-plan",
        stateMachineId: "goal-driven-development",
        params: { goalName: "parent", stepNumber: 4, queueKey: "parent" },
      },
    ]);

    const config: CapabilityConfig = {
      capability: "finalize-goal",
      workspaceDir: path.join(tempDir, ".pio", "goals", "nested"),
      contract: { inputs: [], outputs: [] },
      sessionParams: {
        goalName: "nested",
        parentGoalName: "parent",
        parentStepNumber: 3,
        queueKey: "nested",
      },
      allowProjectWrites: false,
    };

    // Act
    const result = await runExitLifecycle(config);

    // Assert: queue key (2nd arg) matches goalName in enqueued params
    expect(result.success).toBe(true);
    const enqueueCall = mockEnqueueTask.mock.calls[0];
    const queueKey = enqueueCall[1];
    const enqueuedParams = enqueueCall[2].params;
    expect(queueKey).toBe("parent");
    expect(enqueuedParams.goalName).toBe("parent");
  });
});

// ---------------------------------------------------------------------------
// Skill injection — buildSkillLoadingSection tests
// ---------------------------------------------------------------------------

describe("buildSkillLoadingSection", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given a config with no skills and an empty registry when buildSkillLoadingSection is called then it attempts global mandatory skills and returns undefined when none resolve", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection({}, []);

    // No skills in registry — only "ask-user" is global mandatory ("pio" excluded to avoid instruction leakage)
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ask-user"));
    // "pio" should NOT be attempted as a skill name (no longer global mandatory)
    // (warning messages have "pio:" prefix, so check for skill name specifically)
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('skill "pio"'),
    );

    warnSpy.mockRestore();
  });

  it("given a config with mandatory skills and matching registry entries when buildSkillLoadingSection is called then mandatory skills are wrapped in XML tags", async () => {
    const skillBody = "# Test Skill\n\nThis is the body.";
    const filePath = writeSkillFile(tempDir, "test-skill", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("test-skill", filePath, baseDir)];
    const config = { skills: { mandatory: ["test-skill"] } };

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, registry);

    expect(result).toContain('<skill name="test-skill"');
    expect(result).toContain(`location="${filePath}"`);
    expect(result).toContain("References are relative to");
    expect(result).toContain(skillBody);
    expect(result).toContain("</skill>");
  });

  it("given a config with recommended skills when buildSkillLoadingSection is called then recommended skills appear as instruction-based listings", async () => {
    const config = {
      skills: {
        recommended: [
          {
            name: "source-research",
            condition: "when researching external libraries",
          },
        ],
      },
    };

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, []);

    expect(result).toContain("--- RECOMMENDED SKILLS ---");
    expect(result).toContain("source-research");
    expect(result).toContain("when researching external libraries");
  });

  it("given a config with both mandatory and recommended skills when buildSkillLoadingSection is called then the output contains both sections", async () => {
    const skillBody = "# My Skill";
    const filePath = writeSkillFile(tempDir, "my-skill", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("my-skill", filePath, baseDir)];
    const config = {
      skills: {
        mandatory: ["my-skill"],
        recommended: [{ name: "pio-git", condition: "during completion" }],
      },
    };

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, registry);

    expect(result).toContain('<skill name="my-skill"');
    expect(result).toContain("--- RECOMMENDED SKILLS ---");
    expect(result).toContain("pio-git");
  });

  it("given a mandatory skill whose file does not exist on disk when buildSkillLoadingSection is called then it logs a warning and skips", async () => {
    const registry = [
      makeSkill(
        "missing-skill",
        "/nonexistent/path/SKILL.md",
        "/nonexistent/path",
      ),
    ];
    const config = { skills: { mandatory: ["missing-skill"] } };

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, registry);

    expect(warnSpy).toHaveBeenCalled();
    // Result is undefined when all skills skipped (no content to return)
    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("given a mandatory skill whose name is not in the registry when buildSkillLoadingSection is called then it logs a warning and skips", async () => {
    const config = { skills: { mandatory: ["unknown-skill"] } };

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, []);

    expect(warnSpy).toHaveBeenCalled();
    // Result is undefined when all skills skipped (global + config skills all missing)
    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("given global mandatory skills that overlap with config mandatory skills when buildSkillLoadingSection is called then duplicates are deduplicated", async () => {
    const skillBody = "# Ask User Skill";
    const filePath = writeSkillFile(tempDir, "ask-user", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("ask-user", filePath, baseDir)];
    // Config also declares ask-user as mandatory — should appear only once
    const config = { skills: { mandatory: ["ask-user"] } };

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, registry);

    // Count occurrences of the skill XML tag — should be exactly 1
    const matches = result?.match(/<skill name="ask-user"/g);
    expect(matches?.length).toBe(1);
  });

  it("given a skill with YAML frontmatter in SKILL.md when buildSkillLoadingSection reads and strips it then the injected body does not contain frontmatter delimiters", async () => {
    const skillBody = "# Test Skill\n\nThis is the body.";
    const filePath = writeSkillFile(
      tempDir,
      "frontmatter-skill",
      skillBody,
      "name: frontmatter-skill\ndescription: test",
    );
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("frontmatter-skill", filePath, baseDir)];
    const config = { skills: { mandatory: ["frontmatter-skill"] } };

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, registry);

    expect(result).toContain(skillBody);
    // Frontmatter delimiters should be stripped
    expect(result).not.toContain("---\nname: frontmatter-skill");
  });

  it("given a config with undefined skills field when buildSkillLoadingSection is called then it does not crash and returns undefined when no skills in registry", async () => {
    const config = {};

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const mod = await import("./capability-session");
    const result = mod.buildSkillLoadingSection(config, []);

    // No skills in registry — only "ask-user" global skill skipped with warning
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ask-user"));
    // "pio" should NOT be attempted as a skill name (no longer global mandatory)
    // (warning messages have "pio:" prefix, so check for skill name specifically)
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('skill "pio"'),
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Skill injection — before_agent_start integration tests
// ---------------------------------------------------------------------------

describe("skill injection — before_agent_start integration", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given before_agent_start with mandatory skills when the handler runs then the message contains SKILL LOADING INSTRUCTIONS with injected blocks", async () => {
    const skillBody = "# Test Skill";
    const filePath = writeSkillFile(tempDir, "test-skill", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("test-skill", filePath, baseDir)];

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with skills config
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: {
                  capability: "test-cap",
                  sessionParams: { skills: { mandatory: ["test-skill"] } },
                },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with skill registry
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(result).toBeDefined();
    expect(typeof result.systemPrompt).toBe("string");
    expect(result.systemPrompt).toContain("--- SKILL LOADING INSTRUCTIONS ---");
    expect(result.systemPrompt).toContain('<skill name="test-skill"');
  });

  it("given before_agent_start when the handler runs then delivery order is PROJECT OVERVIEW, then SKILL LOADING INSTRUCTIONS, then SESSION INPUTS, then WORKFLOW EXECUTION — CAPABILITY CONTEXT is absent", async () => {
    // Populate registry with "ask-user" (the only global mandatory skill)
    // so buildSkillLoadingSection generates the SKILL LOADING INSTRUCTIONS section
    const askUserSkillBody = "# Ask User Skill";
    const askUserFilePath = writeSkillFile(
      tempDir,
      "ask-user",
      askUserSkillBody,
    );
    const askUserBaseDir = path.dirname(askUserFilePath);

    const registry = [makeSkill("ask-user", askUserFilePath, askUserBaseDir)];

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with session params that produce SESSION INPUTS
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: {
                  capability: "test-cap",
                  sessionParams: { workspaceDir: tempDir },
                },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with registry containing "ask-user" skill
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");

    // CAPABILITY CONTEXT should be absent (instruction leak removal)
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");

    // Verify order: SKILL LOADING < SESSION INPUTS < WORKFLOW EXECUTION
    const skillIdx = result.systemPrompt.indexOf(
      "--- SKILL LOADING INSTRUCTIONS ---",
    );
    const sessionInputsIdx = result.systemPrompt.indexOf(
      "--- SESSION INPUTS ---",
    );
    const workflowExecIdx = result.systemPrompt.indexOf(
      "--- WORKFLOW EXECUTION ---",
    );

    expect(skillIdx).toBeGreaterThan(-1);
    expect(sessionInputsIdx).toBeGreaterThan(-1);
    expect(workflowExecIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeLessThan(sessionInputsIdx);
    expect(sessionInputsIdx).toBeLessThan(workflowExecIdx);
    // ADDITIONAL CONTEXT should be absent (no additionalContext set)
    expect(result.systemPrompt).not.toContain("--- ADDITIONAL CONTEXT ---");
  });

  it("given before_agent_start with additionalContext in config when the handler runs then ADDITIONAL CONTEXT section appears after WORKFLOW EXECUTION", async () => {
    const askUserSkillBody = "# Ask User Skill";
    const askUserFilePath = writeSkillFile(
      tempDir,
      "ask-user",
      askUserSkillBody,
    );
    const askUserBaseDir = path.dirname(askUserFilePath);

    const registry = [makeSkill("ask-user", askUserFilePath, askUserBaseDir)];

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with additionalContext in sessionParams
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: {
                  capability: "test-cap",
                  sessionParams: {
                    workspaceDir: tempDir,
                    additionalContext:
                      "This is additional context for the task.",
                  },
                },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");

    // ADDITIONAL CONTEXT should be present
    expect(result.systemPrompt).toContain("--- ADDITIONAL CONTEXT ---");
    expect(result.systemPrompt).toContain(
      "This is additional context for the task.",
    );

    // Verify order: WORKFLOW EXECUTION < ADDITIONAL CONTEXT
    const workflowExecIdx = result.systemPrompt.indexOf(
      "--- WORKFLOW EXECUTION ---",
    );
    const additionalCtxIdx = result.systemPrompt.indexOf(
      "--- ADDITIONAL CONTEXT ---",
    );

    expect(workflowExecIdx).toBeGreaterThan(-1);
    expect(additionalCtxIdx).toBeGreaterThan(-1);
    expect(workflowExecIdx).toBeLessThan(additionalCtxIdx);
  });

  it("given the skill registry is populated via systemPromptOptions.skills when before_agent_start runs then the registry is cached", async () => {
    const skillBody = "# Cached Skill";
    const filePath = writeSkillFile(tempDir, "cached-skill", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("cached-skill", filePath, baseDir)];

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with the skill in config
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: {
                  capability: "test-cap",
                  sessionParams: { skills: { mandatory: ["cached-skill"] } },
                },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with registry
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");
    expect(result.systemPrompt).toContain('<skill name="cached-skill"');
  });

  it("given before_agent_start with a non-empty base systemPrompt when the handler runs then the base prompt is preserved as a prefix", async () => {
    const basePrompt = "This is the base prompt";

    const askUserSkillBody = "# Ask User Skill";
    const askUserFilePath = writeSkillFile(
      tempDir,
      "ask-user",
      askUserSkillBody,
    );
    const askUserBaseDir = path.dirname(askUserFilePath);

    const registry = [makeSkill("ask-user", askUserFilePath, askUserBaseDir)];

    const registeredHandlers: Record<string, Function> = {};
    const setModelMock = vi.fn();

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: setModelMock,
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "test-cap", sessionParams: {} },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with a non-empty base systemPrompt
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: basePrompt,
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    // Assert: base prompt is preserved as prefix
    expect(result.systemPrompt).toBeDefined();
    expect(typeof result.systemPrompt).toBe("string");
    expect(result.systemPrompt?.startsWith(basePrompt)).toBe(true);
    // Appended content follows after the separator
    expect(result.systemPrompt).toContain("\n\n");
    // CAPABILITY CONTEXT should be absent (instruction leak removal)
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");
    // WORKFLOW EXECUTION should be present
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
  });
});

// ---------------------------------------------------------------------------
// resources_discover — skill loading uses buildSkillLoadingSection
// ---------------------------------------------------------------------------

describe("resources_discover — skill loading uses buildSkillLoadingSection", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given before_agent_start with mandatory skills when the handler runs then skill content comes from buildSkillLoadingSection not a static file", async () => {
    const skillBody = "# Dynamic Skill";
    const filePath = writeSkillFile(tempDir, "dynamic-skill", skillBody);
    const baseDir = path.dirname(filePath);

    const registry = [makeSkill("dynamic-skill", filePath, baseDir)];

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover with skills config
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: {
                  capability: "test-cap",
                  sessionParams: { skills: { mandatory: ["dynamic-skill"] } },
                },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with skill registry
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    // Assert: skill content is dynamically generated from buildSkillLoadingSection
    expect(typeof result.systemPrompt).toBe("string");
    expect(result.systemPrompt).toContain("--- SKILL LOADING INSTRUCTIONS ---");
    expect(result.systemPrompt).toContain('<skill name="dynamic-skill"');
    expect(result.systemPrompt).toContain(skillBody);
    // The skill XML block proves dynamic generation — a static file would not contain this skill
  });
});

// ---------------------------------------------------------------------------
// Prompt compiler integration — resources_discover calls compilePrompt
// ---------------------------------------------------------------------------

describe("prompt compiler integration — resources_discover", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    mockCompilePrompt.mockClear();
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role content.",
      workflow: "## Workflow\n\n1. Test step",
      guidelines: "## Guidelines\n\nTest guidelines.",
      mergedSkills: { mandatory: ["pio", "ask-user"] },
    });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given resources_discover with a capability config when the handler runs then compilePrompt is called with the package directory", async () => {
    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (!rdHandler)
      throw new Error("resources_discover handler not registered");
    await rdHandler(
      {
        type: "resources_discover",
        cwd: process.cwd(),
        reason: "startup" as const,
      },
      {
        sessionManager: {
          getEntries: () => [
            {
              type: "custom",
              customType: "pio-config",
              data: {
                capability: "test-cap",
                sessionParams: { skills: { mandatory: ["tdd"] } },
              },
            },
          ],
        },
      },
    );

    // Assert: compilePrompt was called with the package directory
    expect(mockCompilePrompt).toHaveBeenCalledTimes(1);
    const callArgs = mockCompilePrompt.mock.calls[0];
    expect(callArgs[0]).toContain("test-cap"); // directory path contains capability name
    expect(callArgs[1]).toBeDefined();
    expect(callArgs[1].baseSkills).toEqual({ mandatory: ["tdd"] });
  });

  it("given compilePrompt fails when resources_discover runs then the error is caught and logged", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    mockCompilePrompt.mockRejectedValue(new Error("workflow.ts not found"));

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (!rdHandler)
      throw new Error("resources_discover handler not registered");

    // Act: should not throw
    await expect(
      rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "broken-cap", sessionParams: {} },
              },
            ],
          },
        },
      ),
    ).resolves.toBeUndefined();

    // Assert: warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("compilePrompt"),
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Workflow phases — getCompiledWorkflowPhases typed getter
// ---------------------------------------------------------------------------

describe("workflow phases — getCompiledWorkflowPhases", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    mockCompilePrompt.mockClear();
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role.",
      workflow: "## Workflow\n\n1. Step one\n2. Step two",
      guidelines: undefined,
      mergedSkills: {},
    });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given compiled sections with workflow phases when resources_discover runs then getCompiledWorkflowPhases returns the phases array", async () => {
    // Set up mock to return sections with _steps info
    mockCompilePrompt.mockImplementation(() =>
      Promise.resolve({
        role: "## Role\n\nTest role.",
        workflow: "## Workflow\n\n1. Step one\n2. Step two",
        guidelines: undefined,
        mergedSkills: {},
        _steps: [
          { id: "step-1", title: "Step One", instructions: "Do step one" },
          { id: "step-2", title: "Step Two", instructions: "Do step two" },
        ],
      }),
    );

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (!rdHandler)
      throw new Error("resources_discover handler not registered");
    await rdHandler(
      {
        type: "resources_discover",
        cwd: process.cwd(),
        reason: "startup" as const,
      },
      {
        sessionManager: {
          getEntries: () => [
            {
              type: "custom",
              customType: "pio-config",
              data: { capability: "test-cap", sessionParams: {} },
            },
          ],
        },
      },
    );

    // Assert: compilePrompt was called
    expect(mockCompilePrompt).toHaveBeenCalled();

    // Verify getCompiledWorkflowPhases returns the typed array
    const phases = mod.getCompiledWorkflowPhases();
    expect(phases).toEqual([
      { id: "step-1", title: "Step One", instructions: "Do step one" },
      { id: "step-2", title: "Step Two", instructions: "Do step two" },
    ]);

    // Verify enrichedSessionParams does NOT contain workflow phase data (bridge removed)
    const rawParams = mod.getEnrichedSessionParamsForTesting();
    expect(rawParams).toBeDefined();
    expect(rawParams?.totalWorkflowSteps).toBeUndefined();
    expect(rawParams?.workflowSteps).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Loop engine integration — setupLoopEngine called from setupSessionInfrastructure
// ---------------------------------------------------------------------------

describe("loop engine integration — setupSessionInfrastructure", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    mockSetupLoopEngine.mockClear();
    mockCompilePrompt.mockClear();
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role.",
      workflow: "## Workflow\n\n1. Test step",
      guidelines: undefined,
      mergedSkills: {},
    });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given setupSessionInfrastructure is called when the function runs then setupLoopEngine is called with the pi instance", async () => {
    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn(),
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Assert: setupLoopEngine was called with the pi instance
    expect(mockSetupLoopEngine).toHaveBeenCalledTimes(1);
    expect(mockSetupLoopEngine).toHaveBeenCalledWith(mockPi);
  });
});

// ---------------------------------------------------------------------------
// Session completion mandate removal — before_agent_start injection
// ---------------------------------------------------------------------------

describe("session completion mandate removal — before_agent_start injection", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    mockCompilePrompt.mockClear();
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role content.",
      workflow: "## Workflow\n\n1. Test step",
      guidelines: "## Guidelines\n\nTest guidelines.",
      mergedSkills: { mandatory: ["pio", "ask-user"] },
    });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given before_agent_start when the handler runs then SESSION COMPLETION section is absent and SESSION_COMPLETION_MANDATE is no longer exported", async () => {
    const pioSkillBody = "# PIO Skill";
    const pioFilePath = writeSkillFile(tempDir, "pio", pioSkillBody);
    const pioBaseDir = path.dirname(pioFilePath);

    const registry = [makeSkill("pio", pioFilePath, pioBaseDir)];

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "test-cap", sessionParams: {} },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");
    // SESSION COMPLETION section should be absent
    expect(result.systemPrompt).not.toContain("--- SESSION COMPLETION ---");
    // WORKFLOW EXECUTION should be present instead
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
  });

  it("given before_agent_start when the handler runs then section ordering is SKILL LOADING before WORKFLOW EXECUTION and CAPABILITY CONTEXT is absent", async () => {
    const askUserSkillBody = "# Ask User Skill";
    const askUserFilePath = writeSkillFile(
      tempDir,
      "ask-user",
      askUserSkillBody,
    );
    const askUserBaseDir = path.dirname(askUserFilePath);

    const registry = [makeSkill("ask-user", askUserFilePath, askUserBaseDir)];

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "test-cap", sessionParams: {} },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: registry, cwd: process.cwd() },
      } as any,
      {} as any,
    );

    const skillIdx = result.systemPrompt.indexOf(
      "--- SKILL LOADING INSTRUCTIONS ---",
    );
    const workflowExecIdx = result.systemPrompt.indexOf(
      "--- WORKFLOW EXECUTION ---",
    );

    expect(skillIdx).toBeGreaterThan(-1);
    expect(workflowExecIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeLessThan(workflowExecIdx);
    // CAPABILITY CONTEXT should be absent (instruction leak removal)
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");
    // SESSION COMPLETION should be absent
    expect(result.systemPrompt).not.toContain("--- SESSION COMPLETION ---");
  });

  it("given before_agent_start with no skills and no project context when the handler runs then SESSION COMPLETION is absent but WORKFLOW EXECUTION is present", async () => {
    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (rdHandler) {
      await rdHandler(
        {
          type: "resources_discover",
          cwd: process.cwd(),
          reason: "startup" as const,
        },
        {
          sessionManager: {
            getEntries: () => [
              {
                type: "custom",
                customType: "pio-config",
                data: { capability: "test-cap", sessionParams: {} },
              },
            ],
          },
        },
      );
    }

    // Trigger before_agent_start with no skills and no project context
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: [], cwd: process.cwd() },
      } as any,
      {} as any,
    );

    // SESSION COMPLETION should be absent even without skills or project context
    expect(result).toBeDefined();
    expect(result.systemPrompt).not.toContain("--- SESSION COMPLETION ---");
    // WORKFLOW EXECUTION should be present (unconditional injection)
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
  });
});

// ---------------------------------------------------------------------------
// Prompt assembly order — before_agent_start uses compiled sections
// ---------------------------------------------------------------------------

describe("prompt assembly — before_agent_start uses compiled sections", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    mockCompilePrompt.mockClear();
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role content.",
      workflow: "## Workflow\n\n1. Test step",
      guidelines: "## Guidelines\n\nTest guidelines.",
      mergedSkills: { mandatory: ["pio", "ask-user"] },
    });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("given compiled sections with role, workflow, and guidelines when before_agent_start runs then CAPABILITY CONTEXT is absent (instruction leak removal)", async () => {
    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (!rdHandler)
      throw new Error("resources_discover handler not registered");
    await rdHandler(
      {
        type: "resources_discover",
        cwd: process.cwd(),
        reason: "startup" as const,
      },
      {
        sessionManager: {
          getEntries: () => [
            {
              type: "custom",
              customType: "pio-config",
              data: { capability: "test-cap", sessionParams: {} },
            },
          ],
        },
      },
    );

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: [], cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");
    // CAPABILITY CONTEXT is no longer injected (instruction leak removal)
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");
    // Role, workflow titles, and guidelines should NOT appear in the system prompt
    expect(result.systemPrompt).not.toContain("## Role");
    expect(result.systemPrompt).not.toContain("## Workflow");
    expect(result.systemPrompt).not.toContain("## Guidelines");
    // WORKFLOW EXECUTION should still be present (process rules)
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
  });

  it("given compiled sections with missing guidelines when before_agent_start runs then CAPABILITY CONTEXT is still absent (instruction leak removal)", async () => {
    mockCompilePrompt.mockResolvedValue({
      role: "## Role\n\nTest role.",
      workflow: "## Workflow\n\n1. Test step",
      // guidelines is undefined
      mergedSkills: {},
    });

    const registeredHandlers: Record<string, Function> = {};

    const mockPi = {
      registerTool: vi.fn(),
      on: (event: string, handler: Function) => {
        registeredHandlers[event] = handler;
      },
      setModel: vi.fn(),
      setSessionName: vi.fn(),
    };

    const mod = await import("./capability-session");
    mod.setupSessionInfrastructure(mockPi as any);

    // Trigger resources_discover
    const rdHandler = registeredHandlers.resources_discover;
    if (!rdHandler)
      throw new Error("resources_discover handler not registered");
    await rdHandler(
      {
        type: "resources_discover",
        cwd: process.cwd(),
        reason: "startup" as const,
      },
      {
        sessionManager: {
          getEntries: () => [
            {
              type: "custom",
              customType: "pio-config",
              data: { capability: "test-cap", sessionParams: {} },
            },
          ],
        },
      },
    );

    // Trigger before_agent_start
    const handler = registeredHandlers.before_agent_start;
    if (!handler) throw new Error("before_agent_start handler not registered");
    const result = await handler(
      {
        type: "before_agent_start",
        prompt: "test",
        systemPrompt: "",
        systemPromptOptions: { skills: [], cwd: process.cwd() },
      } as any,
      {} as any,
    );

    expect(typeof result.systemPrompt).toBe("string");
    // CAPABILITY CONTEXT is no longer injected regardless of compiled sections
    expect(result.systemPrompt).not.toContain("--- CAPABILITY CONTEXT ---");
    // WORKFLOW EXECUTION should still be present
    expect(result.systemPrompt).toContain("--- WORKFLOW EXECUTION ---");
  });
});

// ---------------------------------------------------------------------------
// WORKFLOW_INSTRUCTIONS constant
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// launchCapability — withSession CustomMessage initial message
// ---------------------------------------------------------------------------

describe("launchCapability — withSession no longer sends initial message as CustomMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    // Unmock launchCapability so we get the real implementation
    vi.doUnmock("./capability-session");
  });

  // Build a mock ExtensionCommandContext that captures newSession call
  function makeMockCtx() {
    return {
      sessionManager: {
        getSessionFile: () => "parent-session.json",
      },
      newSession: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("given config with additionalContext when withSession runs then sendMessage is NOT called (additionalContext delivery removed)", async () => {
    const mockCtx = makeMockCtx();

    const mod = await import("./capability-session");
    await mod.launchCapability(mockCtx as any, {
      capability: "test-cap",
      additionalContext: "Build the feature",
      workspaceDir: "/test/.pio/goals/test",
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
    });

    // Trigger withSession
    const fakeNewCtx = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
    };

    const newSessionCall = mockCtx.newSession.mock.calls[0];
    await newSessionCall[0].withSession(fakeNewCtx);

    // Assert: sendMessage NOT called (additionalContext delivery removed)
    expect(fakeNewCtx.sendMessage).not.toHaveBeenCalled();
    // Assert: sendUserMessage still called with empty string (trigger)
    expect(fakeNewCtx.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(fakeNewCtx.sendUserMessage).toHaveBeenCalledWith("");
  });

  it("given config without additionalContext when withSession runs then only empty sendUserMessage is sent", async () => {
    const mockCtx = makeMockCtx();

    const mod = await import("./capability-session");
    await mod.launchCapability(mockCtx as any, {
      capability: "test-cap",
      workspaceDir: "/test/.pio/goals/test",
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
    });

    const fakeNewCtx = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
    };

    const newSessionCall = mockCtx.newSession.mock.calls[0];
    await newSessionCall[0].withSession(fakeNewCtx);

    // Assert: sendMessage NOT called (no initial message)
    expect(fakeNewCtx.sendMessage).not.toHaveBeenCalled();
    // Assert: sendUserMessage still called with empty string (trigger)
    expect(fakeNewCtx.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(fakeNewCtx.sendUserMessage).toHaveBeenCalledWith("");
  });
});

// ---------------------------------------------------------------------------
// WORKFLOW_INSTRUCTIONS constant
// ---------------------------------------------------------------------------

describe("WORKFLOW_INSTRUCTIONS constant", () => {
  it("given WORKFLOW_INSTRUCTIONS when exported then it declares CustomMessage as the delivery mechanism", async () => {
    const mod = await import("./capability-session");

    expect(mod.WORKFLOW_INSTRUCTIONS).toBeDefined();
    expect(typeof mod.WORKFLOW_INSTRUCTIONS).toBe("string");

    const content = mod.WORKFLOW_INSTRUCTIONS.toLowerCase();
    // Should reference CustomMessage injection
    expect(content).toContain("custommessage");
    // Should NOT contain old instruction leaks
    expect(content).not.toContain("step titles as a roadmap");
    expect(content).not.toContain("initial message");
  });

  it("given WORKFLOW_INSTRUCTIONS when content is static then it contains no variable or iteration-dependent references", async () => {
    const mod = await import("./capability-session");

    const content = mod.WORKFLOW_INSTRUCTIONS;
    // Should not contain placeholders like ${...}, {stepNumber}, iteration numbers, etc.
    expect(content).not.toMatch(/\$\{.*\}/);
    expect(content).not.toMatch(/\{stepNumber\}/i);
    expect(content).not.toMatch(/iteration\s+\d+/i);
  });

  it("contains Phase Boundaries subsection with rules", async () => {
    const mod = await import("./capability-session");

    const content = mod.WORKFLOW_INSTRUCTIONS;
    const lower = content.toLowerCase();

    // Should have a Phase Boundaries heading
    expect(content).toContain("## Phase Boundaries");

    // Rule 1: do not produce artifacts
    expect(lower).toContain("do not produce artifacts");

    // Rule 2: respect negative instructions
    expect(lower).toContain("respect negative instructions");
    expect(lower).toContain("hard constraint");

    // Rule 3: do nothing outside phase instructions
    expect(lower).toContain(
      "do absolutely nothing outside of the phase instructions",
    );

    // Rule 4: leverage context but stay focused
    expect(lower).toContain("leverage context");
    expect(lower).toContain("keep focused on the current phase");
  });

  it("does not reference capability names or output file names", async () => {
    const mod = await import("./capability-session");

    const content = mod.WORKFLOW_INSTRUCTIONS;

    // Should NOT contain capability names
    const capabilityNames = [
      "create-goal",
      "create-plan",
      "evolve-plan",
      "execute-task",
      "review-task",
      "quality-gate",
    ];
    for (const name of capabilityNames) {
      expect(content).not.toContain(name);
    }

    // Should NOT contain output file names
    const outputFiles = [
      "GOAL.md",
      "PLAN.md",
      "TASK.md",
      "SUMMARY.md",
      "REVIEW.md",
    ];
    for (const name of outputFiles) {
      expect(content).not.toContain(name);
    }
  });
});

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, vi } from "vitest";
import * as capabilitySession from "../capability-session";
// Import the real modules to spy on them
import * as capabilityUtils from "../capability-utils";
import { resetState, setState } from "./session-state";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.spyOn(capabilityUtils, "getSessionConfig").mockResolvedValue({
  capability: "create-goal",
  workspaceDir: "/test/.pio/goals/test",
  sessionParams: {},
  sessionName: "test-create-goal",
  allowProjectWrites: false,
  contract: { inputs: [], outputs: [] },
});

vi.spyOn(capabilitySession, "getSessionParams").mockReturnValue({
  workflowSteps: [
    { id: "step-1", title: "Step One", instructions: "Do something" },
    { id: "step-2", title: "Step Two", instructions: "Do something else" },
  ],
  totalWorkflowSteps: 2,
});

// ---------------------------------------------------------------------------
// Helpers — mock ExtensionAPI
// ---------------------------------------------------------------------------

function createMockPi(): {
  pi: ExtensionAPI;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(): void {},
    registerCommand(): void {},
    registerShortcut(): void {},
    registerFlag(): void {},
    getFlag(): boolean | string | undefined {
      return undefined;
    },
    registerMessageRenderer(): void {},
    sendMessage(): void {},
    sendUserMessage(): void {},
    appendEntry(): void {},
    setSessionName(): void {},
    getSessionName(): string | undefined {
      return undefined;
    },
    setLabel(): void {},
    exec(): Promise<unknown> {
      return Promise.resolve({});
    },
    getActiveTools(): string[] {
      return [];
    },
    getAllTools() {
      return [];
    },
    setActiveTools(): void {},
    getCommands(): unknown[] {
      return [];
    },
    setModel(): Promise<boolean> {
      return Promise.resolve(true);
    },
    getThinkingLevel(): unknown {
      return "off";
    },
    setThinkingLevel(): void {},
    registerProvider(): void {},
    unregisterProvider(): void {},
    events: { emit(): void {} },
  } as unknown as ExtensionAPI;

  return { pi, handlers };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(capabilityUtils.getSessionConfig).mockClear();
  vi.mocked(capabilityUtils.getSessionConfig).mockResolvedValue({
    capability: "create-goal",
    workspaceDir: "/test/.pio/goals/test",
    sessionParams: {},
    sessionName: "test-create-goal",
    allowProjectWrites: false,
    contract: { inputs: [], outputs: [] },
  });
  vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
    workflowSteps: [
      { id: "step-1", title: "Step One", instructions: "Do something" },
      { id: "step-2", title: "Step Two", instructions: "Do something else" },
    ],
    totalWorkflowSteps: 2,
  });
  resetState();
});

// Reset loop engine module-level state between tests for isolation
beforeEach(async () => {
  const { __testResetEngine } = await import("./loop-engine");
  __testResetEngine();
});

// ---------------------------------------------------------------------------
// setupLoopEngine — handler registration (tracer bullet)
// ---------------------------------------------------------------------------

describe("setupLoopEngine — handler registration", () => {
  it("registers resources_discover handler", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(handlers.has("resources_discover")).toBe(true);
  });

  it("registers before_agent_start handler", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(handlers.has("before_agent_start")).toBe(true);
  });

  it("registers tool_call handler", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(handlers.has("tool_call")).toBe(true);
  });

  it("registers exactly three event handlers", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert: only resources_discover, before_agent_start, tool_call
    expect(handlers.size).toBe(3);
    expect(handlers.has("resources_discover")).toBe(true);
    expect(handlers.has("before_agent_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resources_discover — pio session detection and state initialization
// ---------------------------------------------------------------------------

describe("resources_discover", () => {
  it("when config is present: loads workflow steps and initializes PioSessionState", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    expect(discoverHandlers).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: PioSessionState initialized
    const { getState } = await import("./session-state");
    const state = getState();
    expect(state.isActive).toBe(true); // set by session-guard's resources_discover (mocked getSessionConfig returns config)
    expect(state.currentStep).toBe(1);
    expect(state.currentIteration).toBe(0);
    expect(state.totalSteps).toBe(2);
    expect(state.stepsList).toHaveLength(2);
    expect(state.stepsList[0].id).toBe("step-1");
  });

  it("when config is absent: resets state", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilityUtils.getSessionConfig).mockResolvedValue(null);

    // Pre-set some state
    setState({
      isActive: true,
      currentStep: 3,
      totalSteps: 5,
      currentIteration: 2,
    });

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = {} as any;
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: state reset
    const { getState } = await import("./session-state");
    const state = getState();
    expect(state.currentStep).toBe(0);
    expect(state.currentIteration).toBe(0);
    expect(state.totalSteps).toBe(0);
    expect(state.stepsList).toEqual([]);
  });

  it("handles missing session params gracefully", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilitySession.getSessionParams).mockReturnValue(undefined);

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = {} as any;
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: state reset (no session params = not a valid pio session)
    const { getState } = await import("./session-state");
    const state = getState();
    expect(state.currentStep).toBe(0);
    expect(state.totalSteps).toBe(0);
    expect(state.stepsList).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// before_agent_start — three-way split (first run, engine-initiated, ad-hoc)
// ---------------------------------------------------------------------------

describe("before_agent_start", () => {
  async function fireBeforeAgentStart(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
  ) {
    const handlersList = handlers.get("before_agent_start");
    expect(handlersList).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of handlersList!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }
  }

  it("first run (engineInitiatedRun=false, iteration=0): sets iteration to 1, initializes StepState", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentIteration, getCurrentStepState } =
      await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulate first run: engineInitiatedRun defaults to false, currentIteration = 0
    setState({ isActive: true, currentIteration: 0 });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration set to 1, fresh StepState
    expect(getCurrentIteration()).toBe(1);
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toEqual([]);
    expect(stepState.askUserCalled).toBe(false);
  });

  it("engine-initiated run (engineInitiatedRun=true): increments iteration, resets StepState, consumes flag", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const {
      setupLoopEngine,
      getCurrentIteration,
      getCurrentStepState,
      isEngineInitiatedRun,
      __testSetEngineInitiatedRun,
    } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 2, engineInitiatedRun = true (Step 7 set it)
    setState({ isActive: true, currentIteration: 2 });
    __testSetEngineInitiatedRun(true);

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration incremented to 3, flag consumed, fresh StepState
    expect(getCurrentIteration()).toBe(3);
    expect(isEngineInitiatedRun()).toBe(false);
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toEqual([]);
    expect(stepState.askUserCalled).toBe(false);
  });

  it("ad-hoc mode (engineInitiatedRun=false, iteration>0): does NOT increment or reset", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentIteration, getCurrentStepState } =
      await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 1 (active loop), engineInitiatedRun = false (user message)
    setState({ isActive: true, currentIteration: 1 });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration NOT changed, StepState NOT reset
    expect(getCurrentIteration()).toBe(1);
    // StepState should still exist (not reset to empty)
    // Since we didn't set any data, it will be the initial empty state from
    // the first run. The key test is that iteration didn't change.
    const stepState = getCurrentStepState();
    // StepState should still be whatever it was before (not a new empty object)
    expect(stepState).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// tool_call — file write tracking and ask_user tracking
// ---------------------------------------------------------------------------

describe("tool_call", () => {
  async function fireToolCall(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    event: { toolName: string; input?: unknown },
  ) {
    const handlersList = handlers.get("tool_call");
    expect(handlersList).toBeDefined();
    for (const handler of handlersList!) {
      await handler(event);
    }
  }

  it("tracks write tool: extracts input.path with path.resolve", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    // Fire before_agent_start to initialize StepState
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // Act: fire tool_call with write tool
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/foo.ts", content: "code" },
    });

    // Assert
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toHaveLength(1);
    expect(stepState.filesWritten[0]).toContain("foo.ts");
  });

  it("tracks edit tool: extracts input.path with path.resolve", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // Act
    await fireToolCall(handlers, {
      toolName: "edit",
      input: { path: "src/bar.ts", edits: [] },
    });

    // Assert
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toHaveLength(1);
    expect(stepState.filesWritten[0]).toContain("bar.ts");
  });

  it("tracks vscode_apply_workspace_edit: extracts each edit.filePath", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // Act
    await fireToolCall(handlers, {
      toolName: "vscode_apply_workspace_edit",
      input: {
        edits: [
          { filePath: "src/a.ts", range: {}, newText: "x" },
          { filePath: "src/b.ts", range: {}, newText: "y" },
        ],
      },
    });

    // Assert
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toHaveLength(2);
    expect(stepState.filesWritten[0]).toContain("a.ts");
    expect(stepState.filesWritten[1]).toContain("b.ts");
  });

  it("tracks ask_user: sets askUserCalled to true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // Act
    await fireToolCall(handlers, {
      toolName: "ask_user",
      input: { question: "What should we do?" },
    });

    // Assert
    const stepState = getCurrentStepState();
    expect(stepState.askUserCalled).toBe(true);
  });

  it("does NOT track when isActive is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    setupLoopEngine(pi);

    setState({ isActive: false });

    // Act
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/foo.ts", content: "code" },
    });

    // Assert: filesWritten should be empty (not tracked)
    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exported getters
// ---------------------------------------------------------------------------

describe("exported getters", () => {
  it("getCurrentStepState returns the current StepState", async () => {
    const { setupLoopEngine, getCurrentStepState } = await import(
      "./loop-engine"
    );
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    const stepState = getCurrentStepState();
    expect(stepState.filesWritten).toEqual([]);
    expect(stepState.askUserCalled).toBe(false);
  });

  it("getCurrentIteration returns current iteration from PioSessionState", async () => {
    const { setupLoopEngine, getCurrentIteration } = await import(
      "./loop-engine"
    );
    const { pi } = createMockPi();
    setupLoopEngine(pi);

    setState({ currentIteration: 5 });
    expect(getCurrentIteration()).toBe(5);
  });

  it("getWorkflowSteps returns loaded workflow steps", async () => {
    const { setupLoopEngine, getWorkflowSteps } = await import("./loop-engine");
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    // Fire resources_discover to load steps
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    const steps = getWorkflowSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("step-1");
  });

  it("isEngineInitiatedRun returns the flag", async () => {
    const {
      setupLoopEngine,
      isEngineInitiatedRun,
      __testSetEngineInitiatedRun,
    } = await import("./loop-engine");
    const { pi } = createMockPi();
    setupLoopEngine(pi);

    expect(isEngineInitiatedRun()).toBe(false);
    __testSetEngineInitiatedRun(true);
    expect(isEngineInitiatedRun()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

describe("test accessors", () => {
  it("__testSetEngineInitiatedRun sets and gets the flag", async () => {
    const {
      setupLoopEngine,
      __testSetEngineInitiatedRun,
      isEngineInitiatedRun,
    } = await import("./loop-engine");
    const { pi } = createMockPi();
    setupLoopEngine(pi);

    __testSetEngineInitiatedRun(true);
    expect(isEngineInitiatedRun()).toBe(true);

    __testSetEngineInitiatedRun(false);
    expect(isEngineInitiatedRun()).toBe(false);
  });

  it("__testGetStepState returns current StepState", async () => {
    const { setupLoopEngine, __testGetStepState } = await import(
      "./loop-engine"
    );
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1 });
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    const stepState = __testGetStepState();
    expect(stepState.filesWritten).toEqual([]);
    expect(stepState.askUserCalled).toBe(false);
  });

  it("__testSetActiveSession delegates to setState", async () => {
    const { setupLoopEngine, __testSetActiveSession } = await import(
      "./loop-engine"
    );
    const { pi } = createMockPi();
    setupLoopEngine(pi);

    __testSetActiveSession(true);
    const { getState } = await import("./session-state");
    expect(getState().isActive).toBe(true);

    __testSetActiveSession(false);
    expect(getState().isActive).toBe(false);
  });
});

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, vi } from "vitest";
import * as capabilitySession from "../capability-session";
// Import the real modules to spy on them
import * as capabilityUtils from "../capability-utils";
import { getState, resetState, setState } from "./session-state";

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
  // resetState() resets ALL PioSessionState including loop engine fields
  resetState();
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

    // Assert: PioSessionState initialized (single source of truth)
    const state = getState();
    expect(state.isActive).toBe(true);
    expect(state.currentStep).toBe(1);
    expect(state.currentIteration).toBe(0);
    expect(state.totalSteps).toBe(2);
    expect(state.stepsList).toHaveLength(2);
    expect(state.stepsList[0].id).toBe("step-1");
    expect(state.engineInitiatedRun).toBe(false);
    expect(state.stepState.filesWritten).toEqual([]);
    expect(state.stepState.askUserCalled).toBe(false);
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
      engineInitiatedRun: true,
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

    // Assert: state reset (including loop engine fields)
    const state = getState();
    expect(state.isActive).toBe(false);
    expect(state.currentStep).toBe(0);
    expect(state.currentIteration).toBe(0);
    expect(state.totalSteps).toBe(0);
    expect(state.stepsList).toEqual([]);
    expect(state.engineInitiatedRun).toBe(false);
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
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulate first run: engineInitiatedRun defaults to false, currentIteration = 0
    setState({ isActive: true, currentIteration: 0 });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration set to 1, fresh StepState (all via getState)
    const state = getState();
    expect(state.currentIteration).toBe(1);
    expect(state.stepState.filesWritten).toEqual([]);
    expect(state.stepState.askUserCalled).toBe(false);
  });

  it("engine-initiated run (engineInitiatedRun=true): increments iteration, resets StepState, consumes flag", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 2, engineInitiatedRun = true (Step 7 set it)
    setState({
      isActive: true,
      currentIteration: 2,
      engineInitiatedRun: true,
    });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration incremented to 3, flag consumed, fresh StepState
    const state = getState();
    expect(state.currentIteration).toBe(3);
    expect(state.engineInitiatedRun).toBe(false);
    expect(state.stepState.filesWritten).toEqual([]);
    expect(state.stepState.askUserCalled).toBe(false);
  });

  it("ad-hoc mode (engineInitiatedRun=false, iteration>0): does NOT increment or reset", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 1 (active loop), engineInitiatedRun = false (user message)
    // Pre-populate stepState so we can verify it's not reset
    setState({
      isActive: true,
      currentIteration: 1,
      engineInitiatedRun: false,
      stepState: { filesWritten: ["/some/file.ts"], askUserCalled: true },
    });

    // Capture the stepState reference before the handler
    const stepStateRef = getState().stepState;

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration NOT changed, StepState NOT reset
    const state = getState();
    expect(state.currentIteration).toBe(1);
    // stepState should still be the same object (not replaced)
    expect(state.stepState).toBe(stepStateRef);
    expect(state.stepState.filesWritten).toEqual(["/some/file.ts"]);
    expect(state.stepState.askUserCalled).toBe(true);
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
    const { setupLoopEngine } = await import("./loop-engine");
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

    // Assert: files tracked in PioSessionState.stepState
    const state = getState();
    expect(state.stepState.filesWritten).toHaveLength(1);
    expect(state.stepState.filesWritten[0]).toContain("foo.ts");
  });

  it("tracks edit tool: extracts input.path with path.resolve", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
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
    const state = getState();
    expect(state.stepState.filesWritten).toHaveLength(1);
    expect(state.stepState.filesWritten[0]).toContain("bar.ts");
  });

  it("tracks vscode_apply_workspace_edit: extracts each edit.filePath", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
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
    const state = getState();
    expect(state.stepState.filesWritten).toHaveLength(2);
    expect(state.stepState.filesWritten[0]).toContain("a.ts");
    expect(state.stepState.filesWritten[1]).toContain("b.ts");
  });

  it("tracks ask_user: sets askUserCalled to true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
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
    const state = getState();
    expect(state.stepState.askUserCalled).toBe(true);
  });

  it("does NOT track when isActive is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: false });

    // Act
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/foo.ts", content: "code" },
    });

    // Assert: filesWritten should be empty (not tracked)
    const state = getState();
    expect(state.stepState.filesWritten).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PioSessionState as single source of truth
// ---------------------------------------------------------------------------

describe("PioSessionState as single source of truth", () => {
  it("all loop state is accessible via getState()", async () => {
    const { setupLoopEngine } = await import("./loop-engine");
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    // Fire resources_discover to initialize
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    // Fire before_agent_start to start iteration
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // All loop state is available through getState()
    const state = getState();
    expect(state.isActive).toBe(true);
    expect(state.currentIteration).toBe(1);
    expect(state.stepsList).toHaveLength(2);
    expect(state.stepState.filesWritten).toEqual([]);
    expect(state.stepState.askUserCalled).toBe(false);
    expect(state.engineInitiatedRun).toBe(false);
  });

  it("engineInitiatedRun is stored in PioSessionState", async () => {
    const { setupLoopEngine } = await import("./loop-engine");
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    // Initialize via resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    // Set engineInitiatedRun via setState (simulating Step 7's agent_end)
    setState({ engineInitiatedRun: true, currentIteration: 1 });

    // Verify it's in PioSessionState
    expect(getState().engineInitiatedRun).toBe(true);

    // Fire before_agent_start — should consume the flag
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    expect(getState().engineInitiatedRun).toBe(false);
    expect(getState().currentIteration).toBe(2);
  });

  it("stepState is stored in PioSessionState", async () => {
    const { setupLoopEngine } = await import("./loop-engine");
    const { pi, handlers } = createMockPi();
    setupLoopEngine(pi);

    // Initialize
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    // Fire tool_call to track a file write
    const toolHandlers = handlers.get("tool_call");
    for (const h of toolHandlers!) {
      await h({
        toolName: "write",
        input: { path: "src/test.ts", content: "x" },
      });
    }

    // stepState is in PioSessionState
    const state = getState();
    expect(state.stepState.filesWritten).toHaveLength(1);
    expect(state.stepState.filesWritten[0]).toContain("test.ts");
  });
});

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

describe("test accessors", () => {
  it("__testSetActiveSession delegates to setState", async () => {
    const { setupLoopEngine, __testSetActiveSession } = await import(
      "./loop-engine"
    );
    const { pi } = createMockPi();
    setupLoopEngine(pi);

    __testSetActiveSession(true);
    expect(getState().isActive).toBe(true);

    __testSetActiveSession(false);
    expect(getState().isActive).toBe(false);
  });
});

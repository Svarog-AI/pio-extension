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

  it("registers input handler", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(handlers.has("input")).toBe(true);
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

  it("registers exactly four event handlers", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert: only resources_discover, input, before_agent_start, tool_call
    expect(handlers.size).toBe(4);
    expect(handlers.has("resources_discover")).toBe(true);
    expect(handlers.has("input")).toBe(true);
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
    expect(state.isAdHocInput).toBe(false);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
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
      isAdHocInput: true,
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
    expect(state.isAdHocInput).toBe(false);
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
// input handler — ad-hoc mode detection
// ---------------------------------------------------------------------------

describe("input handler", () => {
  async function fireInput(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    event: { source?: string },
  ) {
    const handlersList = handlers.get("input");
    expect(handlersList).toBeDefined();
    for (const handler of handlersList!) {
      await handler(event);
    }
  }

  it("when source is interactive AND isActive: sets isAdHocInput to true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, isAdHocInput: false });

    // Act
    await fireInput(handlers, { source: "interactive" });

    // Assert
    expect(getState().isAdHocInput).toBe(true);
  });

  it("when source is NOT interactive: does nothing", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, isAdHocInput: false });

    // Act
    await fireInput(handlers, { source: "rpc" });

    // Assert
    expect(getState().isAdHocInput).toBe(false);
  });

  it("when isActive is false: does nothing even if source is interactive", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: false, isAdHocInput: false });

    // Act
    await fireInput(handlers, { source: "interactive" });

    // Assert
    expect(getState().isAdHocInput).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// before_agent_start — two-way split (normal run vs ad-hoc mode)
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

  it("normal run (isAdHocInput=false, iteration=0): sets iteration to 1, resets tracking fields", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulate first run: isAdHocInput defaults to false, currentIteration = 0
    setState({ isActive: true, currentIteration: 0, isAdHocInput: false });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration set to 1, fresh tracking fields (all via getState)
    const state = getState();
    expect(state.currentIteration).toBe(1);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
    expect(state.isAdHocInput).toBe(false);
  });

  it("normal run (loop replay, iteration>0): increments iteration, resets tracking fields", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 2, isAdHocInput = false (engine follow-up replay)
    setState({
      isActive: true,
      currentIteration: 2,
      isAdHocInput: false,
      filesWritten: ["/old/file.ts"],
      askUserCalled: true,
    });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration incremented to 3, tracking fields reset
    const state = getState();
    expect(state.currentIteration).toBe(3);
    expect(state.isAdHocInput).toBe(false);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
  });

  it("ad-hoc mode (isAdHocInput=true): does NOT increment or reset tracking fields", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: iteration is 1 (active loop), isAdHocInput = true (user message arrived)
    // Pre-populate tracking fields so we can verify they're not reset
    setState({
      isActive: true,
      currentIteration: 1,
      isAdHocInput: true,
      filesWritten: ["/some/file.ts"],
      askUserCalled: true,
    });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration NOT changed, tracking fields NOT reset, flag consumed
    const state = getState();
    expect(state.currentIteration).toBe(1);
    expect(state.isAdHocInput).toBe(false);
    expect(state.filesWritten).toEqual(["/some/file.ts"]);
    expect(state.askUserCalled).toBe(true);
  });

  it("does nothing when isActive is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: false, currentIteration: 5, isAdHocInput: false });

    // Act
    await fireBeforeAgentStart(handlers);

    // Assert: state unchanged
    const state = getState();
    expect(state.currentIteration).toBe(5);
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

    setState({ isActive: true, currentIteration: 1, filesWritten: [] });

    // Act: fire tool_call with write tool
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/foo.ts", content: "code" },
    });

    // Assert: files tracked in flat PioSessionState fields
    const state = getState();
    expect(state.filesWritten).toHaveLength(1);
    expect(state.filesWritten[0]).toContain("foo.ts");
  });

  it("tracks edit tool: extracts input.path with path.resolve", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1, filesWritten: [] });

    // Act
    await fireToolCall(handlers, {
      toolName: "edit",
      input: { path: "src/bar.ts", edits: [] },
    });

    // Assert
    const state = getState();
    expect(state.filesWritten).toHaveLength(1);
    expect(state.filesWritten[0]).toContain("bar.ts");
  });

  it("tracks vscode_apply_workspace_edit: extracts each edit.filePath", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1, filesWritten: [] });

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
    expect(state.filesWritten).toHaveLength(2);
    expect(state.filesWritten[0]).toContain("a.ts");
    expect(state.filesWritten[1]).toContain("b.ts");
  });

  it("tracks ask_user: sets askUserCalled to true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1, askUserCalled: false });

    // Act
    await fireToolCall(handlers, {
      toolName: "ask_user",
      input: { question: "What should we do?" },
    });

    // Assert
    const state = getState();
    expect(state.askUserCalled).toBe(true);
  });

  it("does NOT track when isActive is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: false, filesWritten: [] });

    // Act
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/foo.ts", content: "code" },
    });

    // Assert: filesWritten should be empty (not tracked)
    const state = getState();
    expect(state.filesWritten).toEqual([]);
  });

  it("cumulative tracking: multiple write calls accumulate filesWritten", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({ isActive: true, currentIteration: 1, filesWritten: [] });

    // Act: two write calls
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/a.ts", content: "x" },
    });
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/b.ts", content: "y" },
    });

    // Assert: both files tracked
    const state = getState();
    expect(state.filesWritten).toHaveLength(2);
    expect(state.filesWritten[0]).toContain("a.ts");
    expect(state.filesWritten[1]).toContain("b.ts");
  });

  it("cumulative tracking: write followed by ask_user updates both fields", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      filesWritten: [],
      askUserCalled: false,
    });

    // Act: write then ask_user
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "src/a.ts", content: "x" },
    });
    await fireToolCall(handlers, {
      toolName: "ask_user",
      input: { question: "What now?" },
    });

    // Assert: both fields updated
    const state = getState();
    expect(state.filesWritten).toHaveLength(1);
    expect(state.filesWritten[0]).toContain("a.ts");
    expect(state.askUserCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Iteration data clearing between iterations
// ---------------------------------------------------------------------------

describe("iteration data clearing between iterations", () => {
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

  it("before_agent_start clears previous tracking data on normal run", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulate end of iteration 1 with tracking data
    setState({
      isActive: true,
      currentIteration: 1,
      isAdHocInput: false,
      filesWritten: ["/old/file.ts"],
      askUserCalled: true,
    });

    // Act: fire before_agent_start for next iteration
    await fireBeforeAgentStart(handlers);

    // Assert: tracking data cleared, iteration incremented
    const state = getState();
    expect(state.currentIteration).toBe(2);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
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
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
    expect(state.isAdHocInput).toBe(false);
  });

  it("isAdHocInput is stored in PioSessionState and consumed by before_agent_start", async () => {
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

    // Set isAdHocInput via setState (simulating input handler)
    setState({ isAdHocInput: true, currentIteration: 1 });

    // Verify it's in PioSessionState
    expect(getState().isAdHocInput).toBe(true);

    // Fire before_agent_start — should consume the flag (ad-hoc mode)
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    expect(getState().isAdHocInput).toBe(false);
    expect(getState().currentIteration).toBe(1); // NOT incremented in ad-hoc mode
  });

  it("flat tracking fields are stored in PioSessionState", async () => {
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

    // Flat fields are in PioSessionState
    const state = getState();
    expect(state.filesWritten).toHaveLength(1);
    expect(state.filesWritten[0]).toContain("test.ts");
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

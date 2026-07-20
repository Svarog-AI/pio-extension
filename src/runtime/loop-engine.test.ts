import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, vi } from "vitest";
import * as capabilitySession from "../capability-session";
// Import the real modules to spy on them
import * as capabilityUtils from "../capability-utils";
import * as modelConfig from "../model-config";
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
  contract: {
    inputs: [],
    outputs: [
      { name: "goal", file: "GOAL.md" },
      { name: "plan", file: "PLAN.md" },
    ],
  },
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
  sendUserMessageCalls: Array<{
    content: string | unknown[];
    options?: { deliverAs?: string };
  }>;
  sendMessageCalls: Array<{
    message: { customType?: string; content?: string; display?: boolean };
    options?: { deliverAs?: string };
  }>;
  registeredCommands: Map<
    string,
    { description?: string; handler: (...args: unknown[]) => unknown }
  >;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const sendUserMessageCalls: Array<{
    content: string | unknown[];
    options?: { deliverAs?: string };
  }> = [];
  const sendMessageCalls: Array<{
    message: { customType?: string; content?: string; display?: boolean };
    options?: { deliverAs?: string };
  }> = [];
  const registeredCommands = new Map<
    string,
    { description?: string; handler: (...args: unknown[]) => unknown }
  >();

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(): void {},
    registerCommand(
      name: string,
      options: {
        description?: string;
        handler: (...args: unknown[]) => unknown;
      },
    ): void {
      registeredCommands.set(name, options);
    },
    registerShortcut(): void {},
    registerFlag(): void {},
    getFlag(): boolean | string | undefined {
      return undefined;
    },
    registerMessageRenderer(): void {},
    sendMessage: vi
      .fn()
      .mockImplementation(
        (
          message: { customType?: string; content?: string; display?: boolean },
          options?: { deliverAs?: string },
        ) => {
          sendMessageCalls.push({ message, options });
          return Promise.resolve();
        },
      ),
    sendUserMessage(
      content: string | unknown[],
      options?: { deliverAs?: string },
    ): void {
      sendUserMessageCalls.push({ content, options });
    },
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

  return {
    pi,
    handlers,
    sendUserMessageCalls,
    sendMessageCalls,
    registeredCommands,
  };
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
    contract: {
      inputs: [],
      outputs: [
        { name: "goal", file: "GOAL.md" },
        { name: "plan", file: "PLAN.md" },
      ],
    },
  });
  vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
    workflowSteps: [
      { id: "step-1", title: "Step One", instructions: "Do something" },
      { id: "step-2", title: "Step Two", instructions: "Do something else" },
    ],
    totalWorkflowSteps: 2,
  });
  // Default: debugDisplay is false (tests that need true mock it explicitly)
  vi.spyOn(modelConfig, "readDebugDisplay").mockReturnValue(false);
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

  it("registers exactly five event handlers", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert: resources_discover, input, before_agent_start, tool_call, agent_end
    expect(handlers.size).toBe(5);
    expect(handlers.has("resources_discover")).toBe(true);
    expect(handlers.has("input")).toBe(true);
    expect(handlers.has("before_agent_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
    expect(handlers.has("agent_end")).toBe(true);
  });

  it("registers /return command via pi.registerCommand", async () => {
    // Arrange
    const { pi, registeredCommands } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(registeredCommands.has("return")).toBe(true);
    const cmd = registeredCommands.get("return");
    expect(cmd).toBeDefined();
    expect(cmd!.description?.toLowerCase()).toContain("resume");
  });
});

// ---------------------------------------------------------------------------
// /return command — ad-hoc resumption
// ---------------------------------------------------------------------------

describe("/return command", () => {
  async function fireReturnCommand(
    registeredCommands: Map<
      string,
      { description?: string; handler: (...args: unknown[]) => unknown }
    >,
  ) {
    const cmd = registeredCommands.get("return");
    expect(cmd).toBeDefined();
    await cmd!.handler("", {} as any);
  }

  // ---- Guards ----

  describe("guards", () => {
    it("does nothing when isActive is false", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: false, currentStep: 1 });

      await fireReturnCommand(registeredCommands);

      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentIteration).toBe(0); // unchanged
    });

    it("executes when currentStep is 1 (no dead guard)", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 1,
        stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireReturnCommand(registeredCommands);

      // Should execute (not blocked by dead guard), send empty follow-up
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
    });
  });

  // ---- Resumption behavior ----

  describe("resumption", () => {
    it("resets iteration counter to 0 and clears tracking fields", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 3,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: ["/old/file.ts"],
        askUserCalled: true,
        isAdHocInput: true,
      });

      await fireReturnCommand(registeredCommands);

      const state = getState();
      expect(state.currentIteration).toBe(0);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      expect(state.isAdHocInput).toBe(false);
    });

    it("sends empty follow-up trigger (default returnTo)", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 2,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireReturnCommand(registeredCommands);

      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
      expect(sendUserMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });
    });

    it("uses returnTo when defined on current WorkflowPhase", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Step 2 has returnTo: 1, so /return should jump back to step 1
      setState({
        isActive: true,
        currentStep: 2,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B", returnTo: 1 },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireReturnCommand(registeredCommands);

      // Should have jumped to step 1
      expect(getState().currentStep).toBe(1);
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
    });

    it("defaults to current step when returnTo is omitted", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 2,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" }, // no returnTo
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireReturnCommand(registeredCommands);

      // Should stay on step 2
      expect(getState().currentStep).toBe(2);
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("does not crash when stepsList is empty", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 0,
        stepsList: [],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Should not throw
      await fireReturnCommand(registeredCommands);

      // No follow-up sent (no step found)
      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("does not crash when target step is out of bounds", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Step 1 has returnTo: 5, but there are only 2 steps
      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A", returnTo: 5 },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Should not throw
      await fireReturnCommand(registeredCommands);

      // No follow-up sent (target step out of bounds)
      expect(sendUserMessageCalls).toHaveLength(0);
    });
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
    event: { type?: string; systemPrompt?: string } = {
      type: "before_agent_start",
    },
  ) {
    const handlersList = handlers.get("before_agent_start");
    expect(handlersList).toBeDefined();
    const mockCtx = {} as any;
    const results: unknown[] = [];
    for (const handler of handlersList!) {
      const result = await handler(event, mockCtx);
      if (result) results.push(result);
    }
    return results;
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

  it("ad-hoc mode (isAdHocInput=true): does NOT increment or reset tracking fields, flag persists", async () => {
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

    // Assert: iteration NOT changed, tracking fields NOT reset, flag PERSISTS
    const state = getState();
    expect(state.currentIteration).toBe(1);
    expect(state.isAdHocInput).toBe(true);
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

  // ---- CustomMessage injection (normal mode) ----

  describe("CustomMessage injection (normal mode)", () => {
    it("returns message with customType workflow-step-instructions on first run of Step 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 0, // first run
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base prompt",
      });

      expect(results).toHaveLength(1);
      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-step-instructions");
      expect(result.message.display).toBe(false);
      // Content should NOT contain the base system prompt
      expect(result.message.content).not.toContain("base prompt");
      expect(result.message.content).toContain("No previous phases completed.");
      expect(result.message.content).toContain(
        "You are on Phase 1 of 2, iteration 1.",
      );
      expect(result.message.content).toContain("Do A");
    });

    it("includes completed steps info on Step 2", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 2,
        currentIteration: 0,
        totalSteps: 3,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
          { id: "s3", title: "S3", instructions: "Do C" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-step-instructions");
      expect(result.message.content).toContain("Phases 1 completed.");
      expect(result.message.content).toContain(
        "You are on Phase 2 of 3, iteration 1.",
      );
    });

    it("includes completed steps range on Step 4", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 4,
        currentIteration: 0,
        totalSteps: 5,
        stepsList: [
          { id: "s1", title: "S1", instructions: "A" },
          { id: "s2", title: "S2", instructions: "B" },
          { id: "s3", title: "S3", instructions: "C" },
          { id: "s4", title: "S4", instructions: "D" },
          { id: "s5", title: "S5", instructions: "E" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.content).toContain("Phases 1–3 completed.");
    });

    it("includes loopMessage as Retry focus on iteration > 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1, // will become 2
        totalSteps: 1,
        stepsList: [
          {
            id: "s1",
            title: "S1",
            instructions: "Do A",
            loopMessage: "Focus on edge cases",
          },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.content).toContain(
        "**Retry focus:** Focus on edge cases",
      );
    });

    it("does NOT include loopMessage on first iteration", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 0, // first run → iteration 1
        totalSteps: 1,
        stepsList: [
          {
            id: "s1",
            title: "S1",
            instructions: "Do A",
            loopMessage: "Focus on edge cases",
          },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.content).not.toContain("Retry focus");
    });

    it("skips injection when stepsList is empty", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 0,
        totalSteps: 0,
        stepsList: [],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      // No CustomMessage returned (early return)
      expect(results).toHaveLength(0);
    });

    it("skips injection when currentStep is out of bounds", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 99,
        currentIteration: 0,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "A" },
          { id: "s2", title: "S2", instructions: "B" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      expect(results).toHaveLength(0);
    });
  });

  // ---- CustomMessage injection (ad-hoc mode) ----

  describe("CustomMessage injection (ad-hoc mode)", () => {
    it("returns message with customType workflow-paused and step context", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 2,
        currentIteration: 3,
        totalSteps: 4,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
          { id: "s3", title: "S3", instructions: "Do C" },
          { id: "s4", title: "S4", instructions: "Do D" },
        ],
        isAdHocInput: true,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base prompt",
      });

      expect(results).toHaveLength(1);
      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-paused");
      expect(result.message.display).toBe(false);
      // Content should NOT contain the base system prompt
      expect(result.message.content).not.toContain("base prompt");
      expect(result.message.content).toContain(
        "## Workflow Paused (Ad-hoc Mode)",
      );
      expect(result.message.content).toContain("Phases 1 completed.");
      expect(result.message.content).toContain(
        'You were on Phase 2 of 4: "S2", iteration 3.',
      );
      expect(result.message.content).toContain(
        "Workflow execution is paused. Any prior instructions are no longer active — you can answer questions or help the user freely.",
      );
      // Should NOT contain step instructions
      expect(result.message.content).not.toContain("Do B");
    });

    it("skips ad-hoc injection when stepsList is empty", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 0,
        stepsList: [],
        isAdHocInput: true,
        filesWritten: [],
        askUserCalled: false,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      expect(results).toHaveLength(0);
    });

    // ---- debugDisplay: true — display field verification ----

    describe("debugDisplay enabled (readDebugDisplay returns true)", () => {
      it("normal mode: CustomMessage has display: true when debugDisplay is enabled", async () => {
        const { pi, handlers } = createMockPi();
        const spy = vi
          .spyOn(modelConfig, "readDebugDisplay")
          .mockReturnValue(true);
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        setState({
          isActive: true,
          currentStep: 1,
          currentIteration: 0,
          totalSteps: 2,
          stepsList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
          ],
          isAdHocInput: false,
          filesWritten: [],
          askUserCalled: false,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
          systemPrompt: "base",
        });

        expect(results).toHaveLength(1);
        const result = results[0] as {
          message: { customType: string; content: string; display: boolean };
        };
        expect(result.message.customType).toBe("workflow-step-instructions");
        expect(result.message.display).toBe(true);

        spy.mockRestore();
      });

      it("ad-hoc mode: CustomMessage has display: true when debugDisplay is enabled", async () => {
        const { pi, handlers } = createMockPi();
        const spy = vi
          .spyOn(modelConfig, "readDebugDisplay")
          .mockReturnValue(true);
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        setState({
          isActive: true,
          currentStep: 2,
          currentIteration: 3,
          totalSteps: 4,
          stepsList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
            { id: "s3", title: "S3", instructions: "Do C" },
            { id: "s4", title: "S4", instructions: "Do D" },
          ],
          isAdHocInput: true,
          filesWritten: [],
          askUserCalled: false,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
          systemPrompt: "base",
        });

        expect(results).toHaveLength(1);
        const result = results[0] as {
          message: { customType: string; content: string; display: boolean };
        };
        expect(result.message.customType).toBe("workflow-paused");
        expect(result.message.display).toBe(true);

        spy.mockRestore();
      });

      it("verifies readDebugDisplay is actually called (not hardcoded false)", async () => {
        const { pi, handlers } = createMockPi();
        const spy = vi
          .spyOn(modelConfig, "readDebugDisplay")
          .mockReturnValue(true);
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        setState({
          isActive: true,
          currentStep: 1,
          currentIteration: 0,
          totalSteps: 1,
          stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
          isAdHocInput: false,
          filesWritten: [],
          askUserCalled: false,
        });

        await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
        });

        expect(spy).toHaveBeenCalled();

        spy.mockRestore();
      });
    });
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

  it("isAdHocInput is stored in PioSessionState and persists through before_agent_start", async () => {
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

    // Fire before_agent_start — should NOT consume the flag (flag persists)
    const beforeHandlers = handlers.get("before_agent_start");
    for (const h of beforeHandlers!) {
      await h({ type: "before_agent_start" }, {} as any);
    }

    expect(getState().isAdHocInput).toBe(true);
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
// agent_end — termination evaluation and follow-up injection
// ---------------------------------------------------------------------------

describe("agent_end", () => {
  async function fireAgentEnd(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    messages: unknown[],
  ) {
    const handlersList = handlers.get("agent_end");
    expect(handlersList).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of handlersList!) {
      await handler({ type: "agent_end", messages }, mockCtx);
    }
  }

  // ---- Skip cases ----

  describe("skip cases", () => {
    it("does nothing when last message has stopReason aborted", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "aborted",
        },
      ]);

      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("does nothing when last message has stopReason error", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "error",
        },
      ]);

      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("does nothing when markCompleteCalled is true", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: [{ id: "s1", title: "S1", instructions: "Do A" }],
        totalWorkflowSteps: 1,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 1,
        stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        markCompleteCalled: true,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("does nothing when isActive is false", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: false });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("does nothing when isAdHocInput is true (ad-hoc pause guard)", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: true, // Ad-hoc pause active
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Ad-hoc guard: no follow-up injected, step not advanced
      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentStep).toBe(1);
    });
  });

  // ---- Max iterations hard stop ----

  describe("max iterations hard stop", () => {
    it("does nothing when currentIteration >= resolved maxIterations", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Use totalSteps: 2 so that without the max check, advancement to step 2
      // would send a follow-up. The assertion (no follow-up) proves max check works.
      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          maxIterations: 3,
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 3, // >= maxIterations (3) → hard stop
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Max iterations hit → no follow-up.
      // Without max check: conditions met (no terminateWhen, iteration >= minIterations 1)
      // → would advance to step 2 and send "Do B" as follow-up.
      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentStep).toBe(1); // Not advanced
    });
  });

  // ---- Single-iteration steps (no loop fields) ----

  describe("single-iteration steps", () => {
    it("advances to next step after one agent run (no loop fields)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Should advance: currentStep updated, sendMessage called with CustomMessage
      expect(getState().currentStep).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].message.content).toContain(
        "## Instructions for Phase 2",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });
  });

  // ---- Termination condition evaluation ----

  describe("termination conditions", () => {
    it("loops when currentIteration < minIterations", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
          loopMessage: "Keep going",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 2, // < minIterations (3)
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Should loop: sendMessage called with CustomMessage, currentStep unchanged
      expect(getState().currentStep).toBe(1);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen callback returns true (OR logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [
            {
              type: "callback" as const,
              callback: (state: any) => state.filesWritten.length > 0,
            },
          ],
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1, // >= minIterations
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Callback returns true → advance via sendMessage
      expect(getState().currentStep).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("loops when all terminateWhen callbacks return false (OR logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [
            {
              type: "callback" as const,
              callback: (state: any) => state.filesWritten.length > 0,
            },
            {
              type: "callback" as const,
              callback: (state: any) => state.askUserCalled,
            },
          ],
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [], // Both callbacks return false
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // All false → loop via sendMessage
      expect(getState().currentStep).toBe(1);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when second callback returns true (short-circuit OR)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => false, // First returns false
            },
            {
              type: "callback" as const,
              callback: (state: any) => state.askUserCalled, // Second returns true
            },
          ],
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: true, // Second callback returns true
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Second callback true → advance via sendMessage
      expect(getState().currentStep).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("treats callback error as NOT met (fail-safe: keep looping)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => {
                throw new Error("boom");
              },
            },
          ],
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Callback threw → fail-safe: loop via sendMessage
      expect(getState().currentStep).toBe(1);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen is undefined after minIterations reached", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 2,
          // No terminateWhen
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 2, // >= minIterations
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // No terminateWhen + minIterations reached → advance via sendMessage
      expect(getState().currentStep).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen is empty array after minIterations reached", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [],
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Empty terminateWhen + minIterations reached → advance via sendMessage
      expect(getState().currentStep).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });
  });

  // ---- Loop replay ----

  describe("loop replay", () => {
    it("sends CustomMessage via sendMessage when loopMessage is undefined", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
          // No loopMessage
        },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 1,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1, // < minIterations
        totalSteps: 1,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-step-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });
    });
  });

  // ---- Last step boundary ----

  describe("last step boundary", () => {
    it("does nothing when at last step and conditions met", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
        },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 1,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 1,
        totalSteps: 1,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Last step, conditions met → no follow-up, let session end naturally
      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentStep).toBe(1); // Not advanced
    });
  });

  // ---- resolveMaxIterations usage ----

  describe("resolveMaxIterations integration", () => {
    it("uses resolveMaxIterations with step maxIterations for resolution", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Use totalSteps: 2 so that without the max check, advancement to step 2
      // would send a follow-up. The assertion (no follow-up) proves max check works.
      const steps = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          maxIterations: 5,
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
        workflowSteps: steps,
        totalWorkflowSteps: 2,
      });

      setState({
        isActive: true,
        currentStep: 1,
        currentIteration: 5, // >= maxIterations (5) → hard stop
        totalSteps: 2,
        stepsList: steps,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Max iterations hit → no follow-up.
      // Without max check: conditions met (no terminateWhen, iteration >= minIterations 1)
      // → would advance to step 2 and send "Do B" as follow-up.
      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentStep).toBe(1); // Not advanced
    });
  });
});

// ---------------------------------------------------------------------------
// buildStepInstructions helper
// ---------------------------------------------------------------------------

describe("buildStepInstructions", () => {
  async function getBuildStepInstructions() {
    const mod = await import("./loop-engine");
    return mod.buildStepInstructions;
  }

  it("produces authority header (## Instructions for Phase N)", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 2,
      currentIteration: 1,
      totalSteps: 3,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A" },
        { id: "s2", title: "S2", instructions: "B" },
        { id: "s3", title: "S3", instructions: "C" },
      ],
    });
    const result = build(getState());
    expect(result).toContain("## Instructions for Phase 2");
  });

  it("contains authority text without leaking future steps", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
    });
    const result = build(getState());
    expect(result).toContain(
      "Follow the instructions below. Do not do anything outside these instructions.",
    );
    expect(result).not.toContain("future steps");
  });

  it("includes completed steps info via buildCompletedStepsInfo", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 3,
      currentIteration: 1,
      totalSteps: 5,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A" },
        { id: "s2", title: "S2", instructions: "B" },
        { id: "s3", title: "S3", instructions: "C" },
        { id: "s4", title: "S4", instructions: "D" },
        { id: "s5", title: "S5", instructions: "E" },
      ],
    });
    const result = build(getState());
    expect(result).toContain("Phases 1–2 completed.");
  });

  it("includes step position line", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
    });
    const result = build(getState());
    expect(result).toContain("You are on Phase 1 of 2, iteration 1.");
  });

  it("includes separator (---) before instructions", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    // Verify separator exists on its own line
    const lines = result.split("\n");
    expect(lines).toContain("---");
  });

  it("includes step instructions content", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    expect(result).toContain("Do A");
  });

  it("includes loopMessage as Retry focus when currentIteration > 1", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 2,
      totalSteps: 1,
      stepsList: [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopMessage: "Focus on edge cases",
        },
      ],
    });
    const result = build(getState());
    expect(result).toContain("**Retry focus:** Focus on edge cases");
  });

  it("does NOT include loopMessage on first iteration", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopMessage: "Focus on edge cases",
        },
      ],
    });
    const result = build(getState());
    expect(result).not.toContain("Retry focus");
  });

  it("does NOT include loopMessage when step has no loopMessage", async () => {
    const build = await getBuildStepInstructions();
    setState({
      currentStep: 1,
      currentIteration: 2,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    expect(result).not.toContain("Retry focus");
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

// ---------------------------------------------------------------------------
// tool_call — step-level write gate
// ---------------------------------------------------------------------------

describe("tool_call — step-level write gate", () => {
  async function fireToolCall(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    event: { toolName: string; input?: unknown },
  ) {
    const handlersList = handlers.get("tool_call");
    expect(handlersList).toBeDefined();
    for (const handler of handlersList!) {
      return await handler(event);
    }
  }

  // (a) Contract output write blocked when target not in allowlist
  it("blocks contract output write when target not in allowlist", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: Step 1 has write: ["goal"], Step 2 has write: ["plan"]
    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
        { id: "s2", title: "S2", instructions: "B", write: ["plan"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/GOAL.md"]),
            allowedNames: ["goal"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
        [
          2,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/PLAN.md"]),
            allowedNames: ["plan"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to write PLAN.md during Step 1 (only goal is allowed)
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/PLAN.md", content: "x" },
    });

    // Assert: blocked
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Writing is restricted"),
    });
    expect(blocked!.reason).toContain("Allowed outputs: [goal]");
    expect(blocked!.reason).toContain("Phase 1 of 2");
    expect(blocked!.reason).toContain(
      "Your target path '/test/.pio/goals/test/PLAN.md' is not in the allowed list",
    );
  });

  // (b) Contract output write allowed when target is in allowlist
  it("allows contract output write when target is in allowlist", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
        { id: "s2", title: "S2", instructions: "B", write: ["plan"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/GOAL.md"]),
            allowedNames: ["goal"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: write GOAL.md during Step 1 (goal is allowed)
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: not blocked
    expect(result).toBeUndefined();
    // File should still be tracked
    expect(getState().filesWritten).toContain("/test/.pio/goals/test/GOAL.md");
  });

  // (c) Restricted-by-default: step without write field blocks contract outputs
  it("blocks contract output write when step has no write field (restricted-by-default)", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulates the new behavior: every step gets an entry, even without write
    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "A" }], // no write
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(), // empty — no write declared
            allowedNames: [],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to write a contract output
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: blocked with "does not produce any contract outputs"
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("does not produce any contract outputs"),
    });
  });

  // (d) Empty map fallback: when stepWriteAllowlist has no entry, warn and pass through
  it("emits console.warn when stepWriteAllowlist has no entry for current step", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "A" }],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map(), // empty — no entry for step 1
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Act: try to write a contract output
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: not blocked (fallback pass-through) but warning emitted
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no write allowlist entry found"),
    );
    warnSpy.mockRestore();
  });

  // (d) Empty write array blocks contract output writes
  it("empty write array blocks contract output writes", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
        { id: "s2", title: "Write", instructions: "B", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(), // empty — write: []
            allowedNames: [],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to write GOAL.md during Step 1 (write: [])
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: blocked with appropriate message
    const blocked2 = result as { block: boolean; reason: string } | undefined;
    expect(blocked2).toEqual({
      block: true,
      reason: expect.stringContaining("does not produce any contract outputs"),
    });
    expect(blocked2!.reason).toContain("Phase 1 of 2");
  });

  // (d cont.) Empty write array passes non-contract paths through
  it("empty write array passes non-contract paths through", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(),
            allowedNames: [],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: write a non-contract file
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/some/project/file.ts", content: "x" },
    });

    // Assert: not blocked (passes to capability-level validation)
    expect(result).toBeUndefined();
  });

  // (e) /tmp/ writes always pass through
  it("/tmp/ writes always pass through", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 1,
      stepsList: [{ id: "s1", title: "S1", instructions: "A", write: [] }],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(),
            allowedNames: [],
            allContractOutputs: new Set(["/test/.pio/goals/test/GOAL.md"]),
          },
        ],
      ]),
    });

    // Act: write to /tmp/
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/tmp/scratch.txt", content: "x" },
    });

    // Assert: not blocked
    expect(result).toBeUndefined();
  });

  // (f) Resolution of undefined output names during resources_discover (skipped silently)
  it("resources_discover skips undefined output names silently", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilityUtils.getSessionConfig).mockResolvedValue({
      capability: "create-goal",
      workspaceDir: "/test/.pio/goals/test",
      sessionParams: {},
      sessionName: "test-create-goal",
      allowProjectWrites: false,
      contract: {
        inputs: [],
        outputs: [{ name: "goal", file: "GOAL.md" }],
      },
    });
    vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
      workflowSteps: [
        {
          id: "s1",
          title: "S1",
          instructions: "A",
          write: ["goal", "nonexistent"], // "nonexistent" doesn't exist in contract
        },
      ],
      totalWorkflowSteps: 1,
    });

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    // Assert: stepWriteAllowlist entry exists for step 1
    const state = getState();
    const entry = state.stepWriteAllowlist.get(1);
    expect(entry).toBeDefined();
    // "goal" resolved, "nonexistent" skipped silently
    expect(entry!.allowedNames).toContain("goal");
    expect(entry!.allowedNames).toContain("nonexistent");
    expect(entry!.allowedPaths.size).toBe(1); // only "goal" resolved
  });

  // Gate blocks vscode_apply_workspace_edit with disallowed contract output
  it("blocks vscode_apply_workspace_edit targeting disallowed contract output", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/GOAL.md"]),
            allowedNames: ["goal"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to edit PLAN.md during Step 1
    const result = await fireToolCall(handlers, {
      toolName: "vscode_apply_workspace_edit",
      input: {
        edits: [
          {
            filePath: "/test/.pio/goals/test/PLAN.md",
            range: {},
            newText: "x",
          },
        ],
      },
    });

    // Assert: blocked
    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("Writing is restricted"),
    });
  });

  // Files are still tracked even when blocked
  it("files are still tracked even when write is blocked", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/GOAL.md"]),
            allowedNames: ["goal"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to write disallowed PLAN.md
    await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/PLAN.md", content: "x" },
    });

    // Assert: file is still tracked (tracking happens before gate)
    expect(getState().filesWritten).toContain("/test/.pio/goals/test/PLAN.md");
  });

  // edit tool + write gate
  it("blocks edit tool targeting disallowed contract output", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentStep: 1,
      currentIteration: 1,
      totalSteps: 2,
      stepsList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      stepWriteAllowlist: new Map([
        [
          1,
          {
            allowedPaths: new Set(["/test/.pio/goals/test/GOAL.md"]),
            allowedNames: ["goal"],
            allContractOutputs: new Set([
              "/test/.pio/goals/test/GOAL.md",
              "/test/.pio/goals/test/PLAN.md",
            ]),
          },
        ],
      ]),
    });

    // Act: try to edit PLAN.md during Step 1 (only goal is allowed)
    const result = await fireToolCall(handlers, {
      toolName: "edit",
      input: { path: "/test/.pio/goals/test/PLAN.md", edits: [] },
    });

    // Assert: blocked
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Writing is restricted"),
    });
    expect(blocked!.reason).toContain("Allowed outputs: [goal]");
    expect(blocked!.reason).toContain(
      "Your target path '/test/.pio/goals/test/PLAN.md' is not in the allowed list",
    );
  });

  // -----------------------------------------------------------------------
  // Integration tests: resources_discover → tool_call (restricted-by-default)
  // -----------------------------------------------------------------------

  it("integration: resources_discover populates stepWriteAllowlist for every step (including steps without write)", async () => {
    // Arrange: steps without write field
    vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
      workflowSteps: [
        { id: "s1", title: "Research", instructions: "Do research" }, // no write
        {
          id: "s2",
          title: "Write",
          instructions: "Write stuff",
          write: ["goal"],
        },
      ],
      totalWorkflowSteps: 2,
    });

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    // Assert: every step has an entry
    const state = getState();
    expect(state.stepWriteAllowlist.has(1)).toBe(true); // step without write
    expect(state.stepWriteAllowlist.has(2)).toBe(true); // step with write
    // Step 1 (no write): empty allowedPaths, populated allContractOutputs
    const entry1 = state.stepWriteAllowlist.get(1)!;
    expect(entry1.allowedPaths.size).toBe(0);
    expect(entry1.allowedNames).toEqual([]);
    expect(entry1.allContractOutputs.size).toBeGreaterThan(0);
    // Step 2 (write: ["goal"]): populated allowedPaths
    const entry2 = state.stepWriteAllowlist.get(2)!;
    expect(entry2.allowedPaths.size).toBe(1);
    expect(entry2.allowedNames).toEqual(["goal"]);
  });

  it("integration: resources_discover + tool_call — step without write blocks contract output", async () => {
    // Arrange: steps without write field
    vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
      workflowSteps: [
        { id: "s1", title: "Research", instructions: "Do research" }, // no write
      ],
      totalWorkflowSteps: 1,
    });

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover to populate stepWriteAllowlist
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    // Set currentStep to 1 (the step without write)
    setState({ currentStep: 1, currentIteration: 1 });

    // Fire tool_call to write a contract output
    const toolHandlers = handlers.get("tool_call");
    let result: unknown;
    for (const h of toolHandlers!) {
      result = await h({
        toolName: "write",
        input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
      });
    }

    // Assert: blocked
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("does not produce any contract outputs"),
    });
  });

  it("integration: resources_discover + tool_call — step without write allows non-contract files", async () => {
    // Arrange: steps without write field
    vi.mocked(capabilitySession.getSessionParams).mockReturnValue({
      workflowSteps: [
        { id: "s1", title: "Research", instructions: "Do research" }, // no write
      ],
      totalWorkflowSteps: 1,
    });

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        {} as any,
      );
    }

    setState({ currentStep: 1, currentIteration: 1 });

    // Fire tool_call to write a non-contract file
    const toolHandlers = handlers.get("tool_call");
    let result: unknown;
    for (const h of toolHandlers!) {
      result = await h({
        toolName: "write",
        input: { path: "/some/project/src/foo.ts", content: "x" },
      });
    }

    // Assert: not blocked (non-contract files pass through)
    expect(result).toBeUndefined();
  });
});

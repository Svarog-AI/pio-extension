import type { ExtensionAPI, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { isThinkingOnlyTurn, setupSessionGuard, __testSetActiveSession, __testSetMarkCompleteCalled, __testSetTurnCount } from "./session-guard";

// ---------------------------------------------------------------------------
// Helpers — mock ExtensionAPI
// ---------------------------------------------------------------------------

interface MockEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

interface SendUserMessageCall {
  content: string;
  options?: { deliverAs?: "steer" | "followUp" };
}

function createMockPi(): {
  pi: ExtensionAPI;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
  sendUserMessageCalls: SendUserMessageCall[];
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const sendUserMessageCalls: SendUserMessageCall[] = [];

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(): void {},
    registerCommand(): void {},
    registerShortcut(): void {},
    registerFlag(): void {},
    getFlag(): boolean | string | undefined { return undefined; },
    registerMessageRenderer(): void {},
    sendMessage(): void {},
    sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void {
      sendUserMessageCalls.push({ content, options });
    },
    appendEntry(): void {},
    setSessionName(): void {},
    getSessionName(): string | undefined { return undefined; },
    setLabel(): void {},
    exec(): Promise<unknown> { return Promise.resolve({}); },
    getActiveTools(): string[] { return []; },
    getAllTools() { return []; },
    setActiveTools(): void {},
    getCommands(): unknown[] { return []; },
    setModel(): Promise<boolean> { return Promise.resolve(true); },
    getThinkingLevel(): unknown { return "off"; },
    setThinkingLevel(): void {},
    registerProvider(): void {},
    unregisterProvider(): void {},
    events: { emit(): void {} },
  } as unknown as ExtensionAPI;

  return { pi, handlers, sendUserMessageCalls };
}

// ---------------------------------------------------------------------------
// isThinkingOnlyTurn — pure detection logic
// ---------------------------------------------------------------------------

describe("isThinkingOnlyTurn", () => {
  // "all thinking blocks + empty toolResults → true"
  it("all thinking blocks + empty toolResults → true", () => {
    // Arrange
    const content = [{ type: "thinking" as const, thinking: "reasoning..." }];
    const toolResults: unknown[] = [];

    // Act
    const result = isThinkingOnlyTurn(content, toolResults);

    // Assert
    expect(result).toBe(true);
  });

  // "multiple thinking blocks + no toolResults → true"
  it("multiple thinking blocks + no toolResults → true", () => {
    // Arrange
    const content = [
      { type: "thinking" as const, thinking: "a" },
      { type: "thinking" as const, thinking: "b" },
    ];

    // Act
    const result = isThinkingOnlyTurn(content, undefined);

    // Assert
    expect(result).toBe(true);
  });

  // "thinking + text block → false (has user-facing output)"
  it("thinking + text block → false (has user-facing output)", () => {
    // Arrange
    const content = [
      { type: "thinking" as const, thinking: "reasoning..." },
      { type: "text" as const, text: "hello" },
    ];
    const toolResults: unknown[] = [];

    // Act
    const result = isThinkingOnlyTurn(content, toolResults);

    // Assert
    expect(result).toBe(false);
  });

  // "thinking + toolCall block → false (has tool calls in content)"
  it("thinking + toolCall block → false (has tool calls in content)", () => {
    // Arrange
    const content = [
      { type: "thinking" as const, thinking: "reasoning..." },
      { type: "toolCall" as const, id: "x", name: "read", arguments: {} },
    ];
    const toolResults: unknown[] = [];

    // Act
    const result = isThinkingOnlyTurn(content, toolResults);

    // Assert
    expect(result).toBe(false);
  });

  // "empty content → false (not thinking-only)"
  it("empty content → false (not thinking-only)", () => {
    // Arrange
    const content: { type: string }[] = [];
    const toolResults: unknown[] = [];

    // Act
    const result = isThinkingOnlyTurn(content, toolResults);

    // Assert
    expect(result).toBe(false);
  });

  // "text only + no toolResults → false"
  it("text only + no toolResults → false", () => {
    // Arrange
    const content = [{ type: "text" as const, text: "response" }];
    const toolResults: unknown[] = [];

    // Act
    const result = isThinkingOnlyTurn(content, toolResults);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setupSessionGuard — handler registration
// ---------------------------------------------------------------------------

describe("setupSessionGuard", () => {
  // "registers resources_discover handler"
  it("registers resources_discover handler", () => {
    // Arrange: mock getEntries to return pio-config
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [{ type: "custom", customType: "pio-config", data: {} }];
      },
    };

    // Act
    setupSessionGuard(pi);

    // Simulate resources_discover firing
    const discoverHandlers = handlers.get("resources_discover");
    expect(discoverHandlers).toBeDefined();
    expect(discoverHandlers!.length).toBeGreaterThan(0);

    // Invoke the handler with mock context
    const mockCtx = { sessionManager: mockSessionManager } as any;
    for (const handler of discoverHandlers!) {
      handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    // Assert: flag should now be true
    expect(__testSetActiveSession()).toBe(true);
  });

  // "resources_discover sets flag false when no pio-config"
  it("resources_discover sets flag false when no pio-config", () => {
    // Arrange: mock getEntries to return empty array
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [];
      },
    };

    // Act
    setupSessionGuard(pi);

    // Simulate resources_discover firing
    const discoverHandlers = handlers.get("resources_discover");
    expect(discoverHandlers).toBeDefined();

    const mockCtx = { sessionManager: mockSessionManager } as any;
    for (const handler of discoverHandlers!) {
      handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    // Assert: flag should be false
    expect(__testSetActiveSession()).toBe(false);
  });

  // "registers turn_end handler"
  it("registers turn_end handler", () => {
    // Arrange
    const { pi, handlers } = createMockPi();

    // Act
    setupSessionGuard(pi);

    // Assert
    const turnEndHandlers = handlers.get("turn_end");
    expect(turnEndHandlers).toBeDefined();
    expect(turnEndHandlers!.length).toBeGreaterThan(0);
  });

  // "turn_end does nothing when not in pio session"
  it("turn_end does nothing when not in pio session", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupSessionGuard(pi);

    // Set session flag to false (non-pio session)
    __testSetActiveSession(false);

    // Create a TurnEndEvent with thinking-only content
    const event: TurnEndEvent = {
      type: "turn_end",
      turnIndex: 0,
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "reasoning..." }],
        api: "anthropic-messages" as any,
        provider: { name: "test" } as any,
        model: "test-model",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      },
      toolResults: [],
    };

    // Act: invoke the turn_end handler
    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    // Assert: sendUserMessage was NOT called
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  // "turn_end does nothing for non-assistant messages"
  it("turn_end does nothing for non-assistant messages", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupSessionGuard(pi);

    // Set session flag to true
    __testSetActiveSession(true);

    // Create a TurnEndEvent with a user message (not assistant)
    const event: TurnEndEvent = {
      type: "turn_end",
      turnIndex: 0,
      message: {
        role: "user",
        content: "hello",
        timestamp: Date.now(),
      },
      toolResults: [],
    };

    // Act: invoke the turn_end handler
    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    // Assert: sendUserMessage was NOT called
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  // "turn_end sends recovery message on thinking-only turn"
  it("turn_end sends recovery message on thinking-only turn", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupSessionGuard(pi);

    // Set session flag to true
    __testSetActiveSession(true);

    // Create a TurnEndEvent with thinking-only content + no tool results
    const event: TurnEndEvent = {
      type: "turn_end",
      turnIndex: 0,
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "reasoning..." }],
        api: "anthropic-messages" as any,
        provider: { name: "test" } as any,
        model: "test-model",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      },
      toolResults: [],
    };

    // Act: invoke the turn_end handler
    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    // Assert: sendUserMessage was called exactly once with a non-empty string
    expect(sendUserMessageCalls).toHaveLength(1);
    expect(sendUserMessageCalls[0].content).toBeDefined();
    expect(sendUserMessageCalls[0].content.length).toBeGreaterThan(0);
    expect(sendUserMessageCalls[0].options).toEqual({ deliverAs: "steer" });
  });

  // "turn_end does NOT send recovery message when text is present"
  it("turn_end does NOT send recovery message when text is present", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupSessionGuard(pi);

    // Set session flag to true
    __testSetActiveSession(true);

    // Create a TurnEndEvent with thinking + text content
    const event: TurnEndEvent = {
      type: "turn_end",
      turnIndex: 0,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "reasoning..." },
          { type: "text", text: "hello" },
        ],
        api: "anthropic-messages" as any,
        provider: { name: "test" } as any,
        model: "test-model",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      },
      toolResults: [],
    };

    // Act: invoke the turn_end handler
    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    // Assert: sendUserMessage was NOT called
    expect(sendUserMessageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// __testSetMarkCompleteCalled — accessor
// ---------------------------------------------------------------------------

describe("__testSetMarkCompleteCalled", () => {
  // "__testSetMarkCompleteCalled() returns false by default"
  it("__testSetMarkCompleteCalled() returns false by default", () => {
    // Arrange
    __testSetMarkCompleteCalled(false);

    // Act
    const result = __testSetMarkCompleteCalled();

    // Assert
    expect(result).toBe(false);
  });

  // "__testSetMarkCompleteCalled(true) sets the flag, getter returns true"
  it("__testSetMarkCompleteCalled(true) sets the flag, getter returns true", () => {
    // Arrange
    __testSetMarkCompleteCalled(false);

    // Act
    __testSetMarkCompleteCalled(true);
    const result = __testSetMarkCompleteCalled();

    // Assert
    expect(result).toBe(true);
  });

  // "__testSetMarkCompleteCalled(false) resets the flag, getter returns false"
  it("__testSetMarkCompleteCalled(false) resets the flag, getter returns false", () => {
    // Arrange
    __testSetMarkCompleteCalled(true);

    // Act
    __testSetMarkCompleteCalled(false);
    const result = __testSetMarkCompleteCalled();

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tool_call handler — pio_mark_complete tracking
// ---------------------------------------------------------------------------

describe("tool_call handler — pio_mark_complete tracking", () => {
  // "tool_call sets markCompleteCalled when toolName is pio_mark_complete"
  it("tool_call sets markCompleteCalled when toolName is pio_mark_complete", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act: invoke the tool_call handler with pio_mark_complete
    const toolCallHandlers = handlers.get("tool_call");
    expect(toolCallHandlers).toBeDefined();
    const event = { toolName: "pio_mark_complete", input: undefined };
    for (const handler of toolCallHandlers!) {
      await handler(event);
    }

    // Assert
    expect(__testSetMarkCompleteCalled()).toBe(true);
  });

  // "tool_call does NOT set markCompleteCalled for toolName read"
  it("tool_call does NOT set markCompleteCalled for toolName read", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act
    const toolCallHandlers = handlers.get("tool_call");
    const event = { toolName: "read", input: { path: "some-file.ts" } };
    for (const handler of toolCallHandlers!) {
      await handler(event);
    }

    // Assert
    expect(__testSetMarkCompleteCalled()).toBe(false);
  });

  // "tool_call does NOT set markCompleteCalled for toolName write"
  it("tool_call does NOT set markCompleteCalled for toolName write", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act
    const toolCallHandlers = handlers.get("tool_call");
    const event = { toolName: "write", input: { path: "some-file.ts", content: "code" } };
    for (const handler of toolCallHandlers!) {
      await handler(event);
    }

    // Assert
    expect(__testSetMarkCompleteCalled()).toBe(false);
  });

  // "tool_call sets markCompleteCalled regardless of isActivePioSession"
  it("tool_call sets markCompleteCalled regardless of isActivePioSession", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(false);
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act
    const toolCallHandlers = handlers.get("tool_call");
    const event = { toolName: "pio_mark_complete", input: undefined };
    for (const handler of toolCallHandlers!) {
      await handler(event);
    }

    // Assert
    expect(__testSetMarkCompleteCalled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// before_agent_start handler — markCompleteCalled reset
// ---------------------------------------------------------------------------

describe("before_agent_start handler — markCompleteCalled reset", () => {
  // "before_agent_start resets markCompleteCalled when isActivePioSession is true"
  it("before_agent_start resets markCompleteCalled when isActivePioSession is true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(true);
    __testSetMarkCompleteCalled(true);

    setupSessionGuard(pi);

    // Act: invoke before_agent_start
    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    // Assert
    expect(__testSetMarkCompleteCalled()).toBe(false);
  });

  // "before_agent_start does NOT reset markCompleteCalled when isActivePioSession is false"
  it("before_agent_start does NOT reset markCompleteCalled when isActivePioSession is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(false);
    __testSetMarkCompleteCalled(true);

    setupSessionGuard(pi);

    // Act: invoke before_agent_start
    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    // Assert: flag should remain true
    expect(__testSetMarkCompleteCalled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setupSessionGuard — handler registration for new events
// ---------------------------------------------------------------------------

describe("setupSessionGuard — handler registration for new events", () => {
  // "setupSessionGuard registers tool_call handler"
  it("setupSessionGuard registers tool_call handler", () => {
    // Arrange
    const { pi, handlers } = createMockPi();

    // Act
    setupSessionGuard(pi);

    // Assert
    const toolCallHandlers = handlers.get("tool_call");
    expect(toolCallHandlers).toBeDefined();
    expect(toolCallHandlers!.length).toBeGreaterThan(0);
  });

  // "setupSessionGuard registers before_agent_start handler"
  it("setupSessionGuard registers before_agent_start handler", () => {
    // Arrange
    const { pi, handlers } = createMockPi();

    // Act
    setupSessionGuard(pi);

    // Assert
    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    expect(beforeAgentStartHandlers!.length).toBeGreaterThan(0);
  });

  // "setupSessionGuard registers agent_end handler"
  it("setupSessionGuard registers agent_end handler", () => {
    // Arrange
    const { pi, handlers } = createMockPi();

    // Act
    setupSessionGuard(pi);

    // Assert
    const agentEndHandlers = handlers.get("agent_end");
    expect(agentEndHandlers).toBeDefined();
    expect(agentEndHandlers!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// agent_end handler — warning when pio_mark_complete was not called
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// turn_count — refinement loop nudge
// ---------------------------------------------------------------------------

describe("turn_count — refinement loop nudge", () => {
  // Reset state before each test to ensure isolation
  beforeEach(() => {
    __testSetActiveSession(false);
    __testSetMarkCompleteCalled(false);
    __testSetTurnCount(0);
  });

  // Helper: simulate N turn_end events with assistant text content
  function simulateTurns(handlers: Map<string, Array<(...args: unknown[]) => unknown>>, count: number) {
    const turnEndHandlers = handlers.get("turn_end");
    if (!turnEndHandlers) throw new Error("No turn_end handlers registered");
    const mockCtx = {} as any;
    for (let i = 0; i < count; i++) {
      const event: TurnEndEvent = {
        type: "turn_end",
        turnIndex: i,
        message: {
          role: "assistant",
          content: [{ type: "text", text: `response ${i}` }],
          api: "anthropic-messages" as any,
          provider: { name: "test" } as any,
          model: "test-model",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: Date.now(),
        },
        toolResults: [],
      };
      for (const handler of turnEndHandlers) {
        handler(event, mockCtx);
      }
    }
  }

  it("turnCount increments by 1 on each turn_end when isActivePioSession is true", () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 3 turns
    simulateTurns(handlers, 3);

    // Assert
    expect(__testSetTurnCount()).toBe(3);
  });

  it("turnCount does NOT increment when isActivePioSession is false", () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(false);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 3 turns
    simulateTurns(handlers, 3);

    // Assert
    expect(__testSetTurnCount()).toBe(0);
  });

  it("sends nudge message when turnCount reaches the threshold", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 15 turns (DEFAULT_TURN_THRESHOLD)
    simulateTurns(handlers, 15);

    // Assert: nudge was sent exactly once
    const nudgeCalls = sendUserMessageCalls.filter((c) => c.content.includes("turn"));
    expect(nudgeCalls).toHaveLength(1);
    expect(nudgeCalls[0].content).toContain("15");
  });

  it("turnCount resets to 0 after the nudge fires", () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 15 turns (threshold)
    simulateTurns(handlers, 15);

    // Assert: counter reset to 0
    expect(__testSetTurnCount()).toBe(0);
  });

  it("nudge message uses { deliverAs: \"steer\" }", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 15 turns
    simulateTurns(handlers, 15);

    // Assert
    const nudgeCalls = sendUserMessageCalls.filter((c) => c.content.includes("turn"));
    expect(nudgeCalls[0].options).toEqual({ deliverAs: "steer" });
  });

  it("nudge fires again after reset (periodic nudges)", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 30 turns (2 x threshold)
    simulateTurns(handlers, 30);

    // Assert: nudge was sent exactly twice
    const nudgeCalls = sendUserMessageCalls.filter((c) => c.content.includes("turn"));
    expect(nudgeCalls).toHaveLength(2);
  });

  it("does NOT send nudge when turnCount is below threshold", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 14 turns (below threshold of 15)
    simulateTurns(handlers, 14);

    // Assert: no nudge sent
    const nudgeCalls = sendUserMessageCalls.filter((c) => c.content.includes("turn"));
    expect(nudgeCalls).toHaveLength(0);
  });

  it("before_agent_start resets turnCount when isActivePioSession is true", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(5);
    setupSessionGuard(pi);

    // Act: invoke before_agent_start
    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    // Assert
    expect(__testSetTurnCount()).toBe(0);
  });

  it("before_agent_start does NOT reset turnCount when isActivePioSession is false", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(false);
    __testSetTurnCount(5);
    setupSessionGuard(pi);

    // Act: invoke before_agent_start
    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    // Assert: turnCount should remain 5
    expect(__testSetTurnCount()).toBe(5);
  });

  it("turnCount increments on text-only (non-thinking) turns", () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate 3 turns with text-only content (no thinking blocks)
    simulateTurns(handlers, 3);

    // Assert: turnCount incremented despite no thinking blocks
    expect(__testSetTurnCount()).toBe(3);
  });

  it("__testSetTurnCount(value) sets and returns the value", () => {
    // Arrange
    __testSetTurnCount(0);

    // Act
    const setResult = __testSetTurnCount(7);

    // Assert
    expect(setResult).toBe(7);
    expect(__testSetTurnCount()).toBe(7);
  });

  it("__testSetTurnCount() returns current value without argument", () => {
    // Arrange
    __testSetTurnCount(42);

    // Act
    const result = __testSetTurnCount();

    // Assert
    expect(result).toBe(42);
  });

  it("nudge fires at the exact threshold boundary (turn 15, not 16)", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetTurnCount(0);
    setupSessionGuard(pi);

    // Act: simulate exactly 15 turns
    simulateTurns(handlers, 15);

    // Assert: nudge fired (turnCount was 15, which is >= threshold 15)
    const nudgeCalls = sendUserMessageCalls.filter((c) => c.content.includes("turn"));
    expect(nudgeCalls).toHaveLength(1);
    // And counter reset, so turn 16 would start fresh
    expect(__testSetTurnCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// agent_end handler — warning when pio_mark_complete was not called
// ---------------------------------------------------------------------------

describe("agent_end handler", () => {
  // Reset state before each test to ensure isolation
  beforeEach(() => {
    __testSetActiveSession(false);
    __testSetMarkCompleteCalled(false);
  });

  // "agent_end sends warning when markCompleteCalled is false and isActivePioSession is true"
  it("sends warning when markCompleteCalled is false and isActivePioSession is true", async () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act: invoke the agent_end handler
    const agentEndHandlers = handlers.get("agent_end");
    expect(agentEndHandlers).toBeDefined();
    const mockCtx = {} as any;
    const event = { type: "agent_end" as const, messages: [] };
    for (const handler of agentEndHandlers!) {
      await handler(event, mockCtx);
    }

    // Assert: sendUserMessage was called exactly once with deliverAs: "followUp"
    expect(sendUserMessageCalls).toHaveLength(1);
    expect(sendUserMessageCalls[0].content.length).toBeGreaterThan(0);
    expect(sendUserMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
  });

  // "agent_end does NOT send warning when markCompleteCalled is true"
  it("does NOT send warning when markCompleteCalled is true", async () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(true);
    __testSetMarkCompleteCalled(true);

    setupSessionGuard(pi);

    // Act: invoke the agent_end handler
    const agentEndHandlers = handlers.get("agent_end");
    const mockCtx = {} as any;
    const event = { type: "agent_end" as const, messages: [] };
    for (const handler of agentEndHandlers!) {
      await handler(event, mockCtx);
    }

    // Assert: sendUserMessage was NOT called
    expect(sendUserMessageCalls).toHaveLength(0);
  });

  // "agent_end does NOT send warning when isActivePioSession is false"
  it("does NOT send warning when isActivePioSession is false", async () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();
    __testSetActiveSession(false);
    __testSetMarkCompleteCalled(false);

    setupSessionGuard(pi);

    // Act: invoke the agent_end handler
    const agentEndHandlers = handlers.get("agent_end");
    const mockCtx = {} as any;
    const event = { type: "agent_end" as const, messages: [] };
    for (const handler of agentEndHandlers!) {
      await handler(event, mockCtx);
    }

    // Assert: sendUserMessage was NOT called
    expect(sendUserMessageCalls).toHaveLength(0);
  });
});


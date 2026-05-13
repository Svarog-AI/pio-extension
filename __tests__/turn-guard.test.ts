import type { ExtensionAPI, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { isThinkingOnlyTurn, setupTurnGuard, __testSetActiveSession } from "../src/capabilities/turn-guard";

// ---------------------------------------------------------------------------
// Helpers — mock ExtensionAPI
// ---------------------------------------------------------------------------

interface MockEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

function createMockPi(): {
  pi: ExtensionAPI;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
  sendUserMessageCalls: string[];
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const sendUserMessageCalls: string[] = [];

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
    sendUserMessage(content: string): void { sendUserMessageCalls.push(content); },
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
// setupTurnGuard — handler registration
// ---------------------------------------------------------------------------

describe("setupTurnGuard", () => {
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
    setupTurnGuard(pi);

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
    setupTurnGuard(pi);

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
    setupTurnGuard(pi);

    // Assert
    const turnEndHandlers = handlers.get("turn_end");
    expect(turnEndHandlers).toBeDefined();
    expect(turnEndHandlers!.length).toBeGreaterThan(0);
  });

  // "turn_end does nothing when not in pio session"
  it("turn_end does nothing when not in pio session", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupTurnGuard(pi);

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

    setupTurnGuard(pi);

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

    setupTurnGuard(pi);

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
    expect(sendUserMessageCalls[0]).toBeDefined();
    expect(sendUserMessageCalls[0].length).toBeGreaterThan(0);
  });

  // "turn_end does NOT send recovery message when text is present"
  it("turn_end does NOT send recovery message when text is present", () => {
    // Arrange
    const { pi, handlers, sendUserMessageCalls } = createMockPi();

    setupTurnGuard(pi);

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

import { vi, beforeEach } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  setupStepNudging,
  generateNudgeMessage,
  workflowStepFinishTool,
  __testSetActiveSession,
  __testSetCurrentWorkflowStep,
  __testSetTotalWorkflowSteps,
  __testSetStepsList,
} from "./step-nudging";

// Mock resolveCapabilityConfig so getSessionConfig() returns a full config with live functions
const mockResolveCapabilityConfig = vi.hoisted(() => vi.fn());

vi.mock("../capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfig,
}));

// Default mock: return a minimal valid config
beforeEach(() => {
  mockResolveCapabilityConfig.mockClear();
  mockResolveCapabilityConfig.mockImplementation((_cwd, params) => {
    const cap = typeof params?.capability === "string" ? params.capability : "unknown";
    // resolveCapabilityConfig stores the full params object as sessionParams
    return {
      capability: cap,
      workingDir: params?.workingDir ?? "/test/.pio/goals/test",
      sessionParams: params ?? {},
      contract: { inputs: [], outputs: [] },
    };
  });
});

// ---------------------------------------------------------------------------
// Helpers — mock ExtensionAPI
// ---------------------------------------------------------------------------

interface MockEntry {
  type: string;
  customType?: string;
  data?: unknown;
}

interface SendMessageCall {
  message: unknown;
  options?: { deliverAs?: "steer" | "followUp" };
}

function createMockPi(): {
  pi: ExtensionAPI;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
  sendMessageCalls: SendMessageCall[];
  registeredTools: Array<{ name: string }>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  const sendMessageCalls: SendMessageCall[] = [];
  const registeredTools: Array<{ name: string }> = [];

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(tool: { name: string }): void {
      registeredTools.push({ name: tool.name });
    },
    registerCommand(): void {},
    registerShortcut(): void {},
    registerFlag(): void {},
    getFlag(): boolean | string | undefined { return undefined; },
    registerMessageRenderer(): void {},
    sendMessage(message: unknown, options?: { deliverAs?: "steer" | "followUp" }): void {
      sendMessageCalls.push({ message, options });
    },
    sendUserMessage(): void {},
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

  return { pi, handlers, sendMessageCalls, registeredTools };
}

// ---------------------------------------------------------------------------
// beforeEach — reset state for test isolation
// ---------------------------------------------------------------------------

beforeEach(() => {
  __testSetActiveSession(false);
  __testSetCurrentWorkflowStep(0);
  __testSetTotalWorkflowSteps(0);
});

// ---------------------------------------------------------------------------
// generateNudgeMessage — pure function
// ---------------------------------------------------------------------------

describe("generateNudgeMessage", () => {
  it("generates nudge with title for non-final step", () => {
    const steps = [
      { id: "step-1", title: "Understand the goal" },
      { id: "step-2", title: "Read PLAN.md" },
    ];
    const result = generateNudgeMessage(1, 2, steps);

    expect(result).toContain("--- WORKFLOW STEP CONTROL ---");
    expect(result).toContain("Understand the goal");
    expect(result).toContain("workflow step 1 of 2");
    expect(result).toContain("workflow-step-finish");
    expect(result).toContain("ask_user");
  });

  it("generates nudge without title when stepsList is empty", () => {
    const result = generateNudgeMessage(1, 3);

    expect(result).toContain("--- WORKFLOW STEP CONTROL ---");
    expect(result).toContain("workflow step 1 of 3");
    expect(result).not.toContain("workflow step '");
    expect(result).toContain("ask_user");
  });

  it("generates final step nudge with title", () => {
    const steps = [
      { id: "step-1", title: "Understand the goal" },
      { id: "step-2", title: "Finalize" },
    ];
    const result = generateNudgeMessage(2, 2, steps);

    expect(result).toContain("--- WORKFLOW STEP CONTROL ---");
    expect(result).toContain("Finalize");
    expect(result).toContain("final step");
    expect(result).toContain("pio_mark_complete");
    expect(result).toContain("ask_user");
  });

  it("generates final step nudge without title", () => {
    const result = generateNudgeMessage(3, 3);

    expect(result).toContain("--- WORKFLOW STEP CONTROL ---");
    expect(result).toContain("final workflow step");
    expect(result).toContain("3 of 3");
    expect(result).toContain("pio_mark_complete");
    expect(result).toContain("ask_user");
  });

  it("falls back to no-title format when index is out of range", () => {
    const steps = [{ id: "step-1", title: "Only Step" }];
    const result = generateNudgeMessage(2, 2, steps);

    // Step 2 doesn't exist in stepsList (only 1 item), so fall back
    expect(result).toContain("--- WORKFLOW STEP CONTROL ---");
    expect(result).toContain("final");
    expect(result).not.toContain("Only Step");
  });
});

// ---------------------------------------------------------------------------
// setupStepNudging — tool registration
// ---------------------------------------------------------------------------

describe("setupStepNudging — tool registration", () => {
  it("registers the workflow-step-finish tool", () => {
    const { pi, registeredTools } = createMockPi();

    setupStepNudging(pi);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0].name).toBe("workflow-step-finish");
  });
});

// ---------------------------------------------------------------------------
// setupStepNudging — handler registration
// ---------------------------------------------------------------------------

describe("setupStepNudging — handler registration", () => {
  it("registers resources_discover handler", () => {
    const { pi, handlers } = createMockPi();

    setupStepNudging(pi);

    const discoverHandlers = handlers.get("resources_discover");
    expect(discoverHandlers).toBeDefined();
    expect(discoverHandlers!.length).toBeGreaterThan(0);
  });

  it("registers turn_end handler", () => {
    const { pi, handlers } = createMockPi();

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    expect(turnEndHandlers).toBeDefined();
    expect(turnEndHandlers!.length).toBeGreaterThan(0);
  });

  it("registers before_agent_start handler", () => {
    const { pi, handlers } = createMockPi();

    setupStepNudging(pi);

    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    expect(beforeAgentStartHandlers).toBeDefined();
    expect(beforeAgentStartHandlers!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resources_discover — session detection and state initialization
// ---------------------------------------------------------------------------

describe("resources_discover — session detection and state initialization", () => {
  it("sets isActive to true when pio-config entry exists", async () => {
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [{ type: "custom", customType: "pio-config", data: { capability: "create-goal", sessionParams: {} } }];
      },
    };

    setupStepNudging(pi);

    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = { sessionManager: mockSessionManager, cwd: "." } as any;
    for (const handler of discoverHandlers!) {
      await handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    expect(__testSetActiveSession()).toBe(true);
  });

  it("sets isActive to false when no pio-config entry", async () => {
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [];
      },
    };

    setupStepNudging(pi);

    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = { sessionManager: mockSessionManager, cwd: "." } as any;
    for (const handler of discoverHandlers!) {
      await handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    expect(__testSetActiveSession()).toBe(false);
  });

  it("initializes totalWorkflowSteps from sessionParams", async () => {
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [
          {
            type: "custom",
            customType: "pio-config",
            data: {
              capability: "execute-task",
              sessionParams: { totalWorkflowSteps: 5 },
            },
          },
        ];
      },
    };

    setupStepNudging(pi);

    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = { sessionManager: mockSessionManager, cwd: "." } as any;
    for (const handler of discoverHandlers!) {
      await handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    expect(__testSetTotalWorkflowSteps()).toBe(5);
    expect(__testSetCurrentWorkflowStep()).toBe(1);
  });

  it("sets currentWorkflowStep to 0 when totalWorkflowSteps is 0", async () => {
    const { pi, handlers } = createMockPi();

    const mockSessionManager = {
      getEntries(): MockEntry[] {
        return [
          {
            type: "custom",
            customType: "pio-config",
            data: { capability: "execute-task", sessionParams: {} },
          },
        ];
      },
    };

    setupStepNudging(pi);

    const discoverHandlers = handlers.get("resources_discover");
    const mockCtx = { sessionManager: mockSessionManager, cwd: "." } as any;
    for (const handler of discoverHandlers!) {
      await handler({ type: "resources_discover", cwd: ".", reason: "startup" }, mockCtx);
    }

    expect(__testSetTotalWorkflowSteps()).toBe(0);
    expect(__testSetCurrentWorkflowStep()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// before_agent_start — state reset
// ---------------------------------------------------------------------------

describe("before_agent_start — state reset", () => {
  it("resets currentWorkflowStep to 1 when isActive is true", async () => {
    const { pi, handlers } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(3);

    setupStepNudging(pi);

    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    expect(__testSetCurrentWorkflowStep()).toBe(1);
  });

  it("does NOT reset currentWorkflowStep when isActive is false", async () => {
    const { pi, handlers } = createMockPi();

    __testSetActiveSession(false);
    __testSetCurrentWorkflowStep(3);

    setupStepNudging(pi);

    const beforeAgentStartHandlers = handlers.get("before_agent_start");
    const mockCtx = {} as any;
    for (const handler of beforeAgentStartHandlers!) {
      await handler({ type: "before_agent_start" }, mockCtx);
    }

    expect(__testSetCurrentWorkflowStep()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// turn_end — nudge message injection
// ---------------------------------------------------------------------------

describe("turn_end — nudge message injection", () => {
  it("injects nudge message when isActive and totalWorkflowSteps > 0", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].options).toEqual({ deliverAs: "steer" });
    expect(sendMessageCalls[0].message).toHaveProperty("customType", "step-nudge");
    expect(sendMessageCalls[0].message).toHaveProperty("display", false);
  });

  it("does NOT inject nudge when isActive is false", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(false);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(0);
  });

  it("does NOT inject nudge when totalWorkflowSteps is 0", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(0);
    __testSetTotalWorkflowSteps(0);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = {} as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(0);
  });

  it("does NOT inject nudge when ctx.signal.aborted is true", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = { signal: { aborted: true } } as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(0);
  });

  it("injects nudge when ctx.signal is undefined (normal operation)", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = { signal: undefined } as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].message).toHaveProperty("customType", "step-nudge");
  });

  it("injects nudge when ctx.signal.aborted is false", () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();

    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);

    setupStepNudging(pi);

    const turnEndHandlers = handlers.get("turn_end");
    const mockCtx = { signal: { aborted: false } } as any;
    const event = { type: "turn_end", turnIndex: 0, message: {}, toolResults: [] };
    for (const handler of turnEndHandlers!) {
      handler(event, mockCtx);
    }

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].message).toHaveProperty("customType", "step-nudge");
  });
});

// ---------------------------------------------------------------------------
// workflow-step-finish tool — behavior (direct execute() calls)
// ---------------------------------------------------------------------------

describe("workflow-step-finish tool — behavior", () => {
  const mockCtx = {} as any;
  const mockSignal = new AbortController().signal;

  function getText(result: Awaited<ReturnType<typeof workflowStepFinishTool.execute>>) {
    const block = result.content[0] as { type: string; text?: string };
    return block.text!;
  }

  it("returns 'not active' message when isActive is false", async () => {
    __testSetActiveSession(false);
    __testSetCurrentWorkflowStep(0);
    __testSetTotalWorkflowSteps(0);

    const result = await workflowStepFinishTool.execute("mock-id", {}, mockSignal, undefined, mockCtx);
    const text = getText(result);

    expect(text).toBe("Step nudging is not active in this session.");
  });

  it("increments step counter and returns next step message (no title)", async () => {
    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(5);
    __testSetStepsList([]);

    const result = await workflowStepFinishTool.execute("mock-id", {}, mockSignal, undefined, mockCtx);
    const text = getText(result);

    expect(__testSetCurrentWorkflowStep()).toBe(2);
    expect(text).toBe("Workflow step finished. Moving to workflow step 2 of 5. Continue with this step.");
  });

  it("increments step counter and returns next step message with title", async () => {
    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(1);
    __testSetTotalWorkflowSteps(3);
    __testSetStepsList([
      { id: "step-1", title: "Understand the goal" },
      { id: "step-2", title: "Research context" },
      { id: "step-3", title: "Implement" },
    ]);

    const result = await workflowStepFinishTool.execute("mock-id", {}, mockSignal, undefined, mockCtx);
    const text = getText(result);

    expect(__testSetCurrentWorkflowStep()).toBe(2);
    expect(text).toBe("Workflow step finished. Moving to 'Research context' (workflow step 2 of 3). Continue with this step.");
  });

  it("clamps step counter and returns last step message", async () => {
    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(4);
    __testSetTotalWorkflowSteps(5);
    __testSetStepsList([]);

    // First call: step 4 → 5 (last)
    const result = await workflowStepFinishTool.execute("mock-id", {}, mockSignal, undefined, mockCtx);
    const text = getText(result);

    expect(__testSetCurrentWorkflowStep()).toBe(5);
    expect(text).toBe("All workflow steps completed. You are on the final workflow step (5 of 5). Consider your work done and call pio_mark_complete if all outputs are ready.");
  });

  it("stays at last step when already at max (clamp on second call)", async () => {
    __testSetActiveSession(true);
    __testSetCurrentWorkflowStep(5);
    __testSetTotalWorkflowSteps(5);
    __testSetStepsList([]);

    const result = await workflowStepFinishTool.execute("mock-id", {}, mockSignal, undefined, mockCtx);
    const text = getText(result);

    // Step should still be 5 (clamped), not 6
    expect(__testSetCurrentWorkflowStep()).toBe(5);
    expect(text).toContain("All workflow steps completed");
    expect(text).toContain("pio_mark_complete");
  });
});

// ---------------------------------------------------------------------------
// Test accessors — getter/setter behavior
// ---------------------------------------------------------------------------

describe("test accessors", () => {
  it("__testSetActiveSession() returns current value without argument", () => {
    __testSetActiveSession(true);
    expect(__testSetActiveSession()).toBe(true);
    __testSetActiveSession(false);
    expect(__testSetActiveSession()).toBe(false);
  });

  it("__testSetCurrentWorkflowStep() returns current value without argument", () => {
    __testSetCurrentWorkflowStep(3);
    expect(__testSetCurrentWorkflowStep()).toBe(3);
  });

  it("__testSetTotalWorkflowSteps() returns current value without argument", () => {
    __testSetTotalWorkflowSteps(7);
    expect(__testSetTotalWorkflowSteps()).toBe(7);
  });
});

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, vi } from "vitest";
import * as capabilitySession from "../capability-session";
// Import the real modules to spy on them
import * as capabilityUtils from "../capability-utils";
import * as modelConfig from "../model-config";
import type { CapabilityConfig } from "../types";
import { initializeStore } from "./loop-engine";
import { PhaseManager } from "./phase-manager";
import { getState, resetState, setState as setStateRaw } from "./session-state";
import type { WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// Helper: setState with automatic phaseManager/currentPhaseId setup
// ---------------------------------------------------------------------------

/**
 * Wrapper around setState that automatically sets phaseManager and currentPhaseId
 * when phasesList is present. Use this instead of setState() in all tests.
 */
function setState(updates: Parameters<typeof setStateRaw>[0]): void {
  if (updates.phasesList && !updates.phaseManager) {
    const pm = new PhaseManager(updates.phasesList);
    const cpId = updates.currentPhaseId ?? updates.phasesList[0]?.id ?? "";
    setStateRaw({
      ...updates,
      phaseManager: pm,
      currentPhaseId: cpId,
    });
  } else {
    setStateRaw(updates);
  }
}

// ---------------------------------------------------------------------------
// Persistence module mock
// ---------------------------------------------------------------------------

vi.mock("./state-persistence", () => ({
  loadLoopEngineState: vi.fn().mockReturnValue(null),
  saveLoopEngineState: vi.fn(),
  // Mirror real behavior: create a new object with only persisted fields
  extractPersistedState: vi.fn(
    (state: {
      currentPhaseId: string;
      currentIteration: number;
      isAdHocInput: boolean;
    }) => ({
      currentPhaseId: state.currentPhaseId,
      currentIteration: state.currentIteration,
      isAdHocInput: state.isAdHocInput,
    }),
  ),
}));

// ---------------------------------------------------------------------------
// exit-lifecycle module mock — controllable runExitLifecycle for __pio-exit tests
// ---------------------------------------------------------------------------

vi.mock("./exit-lifecycle", () => ({
  runExitLifecycle: vi.fn(),
}));

import * as exitLifecycle from "./exit-lifecycle";

import * as statePersistence from "./state-persistence";

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

vi.spyOn(capabilitySession, "getCompiledWorkflowPhases").mockReturnValue([
  { id: "step-1", title: "Step One", instructions: "Do something" },
  { id: "step-2", title: "Step Two", instructions: "Do something else" },
]);

// ---------------------------------------------------------------------------
// Helpers — shared mock context
// ---------------------------------------------------------------------------

const mockCtx = {
  sessionManager: {
    getSessionId: () => "test-session-id",
  },
} as any;

// ---------------------------------------------------------------------------
// Helpers — fake capability config for __pio-exit wrapper tests
// ---------------------------------------------------------------------------

/** Minimal resolved CapabilityConfig — enough for the exit wrapper to proceed. */
function makeFakeCapabilityConfig(): CapabilityConfig {
  return {
    capability: "create-goal",
    workspaceDir: "/test/.pio/goals/test",
    sessionParams: {},
    contract: { inputs: [], outputs: [] },
    allowProjectWrites: false,
  };
}

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
    {
      description?: string;
      getArgumentCompletions?: (
        prefix: string,
      ) => Array<{ value: string; label: string; description?: string }> | null;
      handler: (...args: unknown[]) => unknown;
    }
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
    {
      description?: string;
      getArgumentCompletions?: (
        prefix: string,
      ) => Array<{ value: string; label: string; description?: string }> | null;
      handler: (...args: unknown[]) => unknown;
    }
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
  vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
    { id: "step-1", title: "Step One", instructions: "Do something" },
    { id: "step-2", title: "Step Two", instructions: "Do something else" },
  ]);
  // Default: debugDisplay is false (tests that need true mock it explicitly)
  vi.spyOn(modelConfig, "readDebugDisplay").mockReturnValue(false);
  // Default: no capability config for the __pio-exit wrapper — tests that need
  // one set it explicitly via vi.mocked(...).mockReturnValue(fakeConfig).
  vi.spyOn(capabilitySession, "getCurrentCapabilityConfig").mockReturnValue(
    null,
  );
  vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockClear();
  // Default: exit lifecycle resolves success (S04 standard success shape)
  vi.mocked(exitLifecycle.runExitLifecycle).mockReset();
  vi.mocked(exitLifecycle.runExitLifecycle).mockResolvedValue({
    success: true,
    message: "Validation passed. All expected outputs have been produced.",
  });
  // resetState() resets ALL PioSessionState including loop engine fields
  resetState();
  // Clear persistence mock to isolate tests
  vi.mocked(statePersistence.saveLoopEngineState).mockClear();
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

  it("registers exactly six event handlers", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert: resources_discover, input, before_agent_start, tool_call, agent_end, session_shutdown
    expect(handlers.size).toBe(6);
    expect(handlers.has("resources_discover")).toBe(true);
    expect(handlers.has("input")).toBe(true);
    expect(handlers.has("before_agent_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
    expect(handlers.has("agent_end")).toBe(true);
    expect(handlers.has("session_shutdown")).toBe(true);
  });

  it("registers /continue command via pi.registerCommand", async () => {
    // Arrange
    const { pi, registeredCommands } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");

    // Act
    setupLoopEngine(pi);

    // Assert
    expect(registeredCommands.has("continue")).toBe(true);
    const cmd = registeredCommands.get("continue");
    expect(cmd).toBeDefined();
    expect(cmd!.description?.toLowerCase()).toContain("continue");
  });
});

// ---------------------------------------------------------------------------
// /continue command — ad-hoc resumption
// ---------------------------------------------------------------------------

describe("/continue command", () => {
  async function fireContinueCommand(
    registeredCommands: Map<
      string,
      {
        description?: string;
        getArgumentCompletions?: (prefix: string) => Array<{
          value: string;
          label: string;
          description?: string;
        }> | null;
        handler: (...args: unknown[]) => unknown;
      }
    >,
  ) {
    const cmd = registeredCommands.get("continue");
    expect(cmd).toBeDefined();
    await cmd!.handler("", {} as any);
  }

  // ---- Guards ----

  describe("guards", () => {
    it("does nothing when isActive is false", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: false });

      await fireContinueCommand(registeredCommands);

      expect(sendUserMessageCalls).toHaveLength(0);
      expect(getState().currentIteration).toBe(0); // unchanged
    });

    it("executes on first phase (no dead guard)", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireContinueCommand(registeredCommands);

      // Should execute (not blocked by dead guard), send empty follow-up
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
    });
  });

  // ---- Resumption behavior ----

  describe("resumption", () => {
    it("preserves iteration counter and clears tracking fields", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 3,
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: ["/old/file.ts"],
        askUserCalled: true,
        isAdHocInput: true,
        adHocPhaseNotified: true,
      });

      await fireContinueCommand(registeredCommands);

      const state = getState();
      expect(state.currentIteration).toBe(3); // preserved
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      expect(state.isAdHocInput).toBe(false);
      expect(state.adHocPhaseNotified).toBe(false);
    });

    it("resets adHocPhaseNotified so next ad-hoc entry fires message again", async () => {
      const { pi, registeredCommands, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Set up: ad-hoc mode was active and notification was sent
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: true,
        adHocPhaseNotified: true,
      });

      // Fire /continue — should reset flags
      await fireContinueCommand(registeredCommands);

      expect(getState().isAdHocInput).toBe(false);
      expect(getState().adHocPhaseNotified).toBe(false);

      // Simulate a new ad-hoc input arriving
      setState({ isAdHocInput: true });

      // Fire before_agent_start — should fire the workflow-paused message again
      const beforeHandlers = handlers.get("before_agent_start");
      expect(beforeHandlers).toBeDefined();
      const mockCtx = {} as any;
      const results: unknown[] = [];
      for (const handler of beforeHandlers!) {
        const result = await handler({ type: "before_agent_start" }, mockCtx);
        if (result) results.push(result);
      }

      expect(results).toHaveLength(1);
      const result = results[0] as {
        message: { customType: string };
      };
      expect(result.message.customType).toBe("workflow-paused");
    });

    it("sends empty follow-up trigger", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 2,
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireContinueCommand(registeredCommands);

      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
      expect(sendUserMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });
    });

    it("replays current phase on /continue", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireContinueCommand(registeredCommands);

      // Should stay on phase 2
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("does not crash when phasesList is empty", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 0,
        phasesList: [],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Should not throw
      await fireContinueCommand(registeredCommands);

      // No follow-up sent (no phase found)
      expect(sendUserMessageCalls).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// /goto command — jump to a specific phase by ID
// ---------------------------------------------------------------------------

describe("/goto command", () => {
  async function fireGotoCommand(
    registeredCommands: Map<
      string,
      {
        description?: string;
        getArgumentCompletions?: (prefix: string) => Array<{
          value: string;
          label: string;
          description?: string;
        }> | null;
        handler: (...args: unknown[]) => unknown;
      }
    >,
    args: string,
    ctx: { ui: { notify: (msg: string, type: string) => void } },
  ) {
    const cmd = registeredCommands.get("goto");
    expect(cmd).toBeDefined();
    await cmd!.handler(args, ctx);
  }

  // ---- Registration ----

  describe("registration", () => {
    it('registeredCommands.has("goto") is true after setupLoopEngine', async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      expect(registeredCommands.has("goto")).toBe(true);
      const cmd = registeredCommands.get("goto");
      expect(cmd).toBeDefined();
      expect(cmd!.description?.toLowerCase()).toContain("phase");
    });
  });

  // ---- Blocked during active run ----

  describe("blocked during active run", () => {
    it("shows error notification and does not change state when agent is streaming", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        currentIteration: 3,
        totalPhases: 2,
        phasesList: phases,
        filesWritten: ["/existing/file.ts"],
        askUserCalled: true,
        phaseManager: pm,
      });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(false),
      };
      await fireGotoCommand(registeredCommands, "s2", ctx);

      // Error notification shown
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Cannot switch phases while agent is running. Abort the current run first if you need to switch immediately.",
        "error",
      );

      // No state mutations
      const state = getState();
      expect(state.currentPhaseId).toBe("s1");
      expect(state.currentIteration).toBe(3);
      expect(state.filesWritten).toEqual(["/existing/file.ts"]);
      expect(state.askUserCalled).toBe(true);

      // No follow-up message
      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("proceeds normally when agent is idle", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        sessionId: "goto-session",
        currentPhaseId: "s1",
        currentIteration: 3,
        totalPhases: 2,
        phasesList: phases,
        filesWritten: ["/old/file.ts"],
        askUserCalled: true,
        phaseManager: pm,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "s2", ctx);

      // State updated
      const state = getState();
      expect(state.currentPhaseId).toBe("s2");
      expect(state.currentIteration).toBe(1);
      expect(state.filesWritten).toEqual([]);

      // State persisted
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();

      // Follow-up sent
      expect(sendUserMessageCalls).toHaveLength(1);

      // No error notification
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });
  });

  // ---- Guards ----

  describe("guards", () => {
    it("does nothing when isActive is false", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: false });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "step-2", ctx);

      expect(sendUserMessageCalls).toHaveLength(0);
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });

    it("does nothing when phaseManager is null", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "step-2", ctx);

      expect(sendUserMessageCalls).toHaveLength(0);
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });
  });

  // ---- Valid phase ----

  describe("valid phase", () => {
    it("sets currentPhaseId, resets iteration, clears tracking, persists, and sends follow-up", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
        { id: "s3", title: "S3", instructions: "Do C" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        sessionId: "goto-session",
        currentPhaseId: "s1",
        currentIteration: 5,
        totalPhases: 3,
        phasesList: phases,
        filesWritten: ["/old/file.ts"],
        askUserCalled: true,
        isAdHocInput: false,
        phaseManager: pm,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "s3", ctx);

      const state = getState();
      expect(state.currentPhaseId).toBe("s3");
      expect(state.currentIteration).toBe(1);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);

      // State persisted
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();

      // Follow-up message sent
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].content).toBe("");
      expect(sendUserMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });

      // No error notification
      expect(ctx.ui.notify).not.toHaveBeenCalled();
    });

    it("clears ad-hoc mode flags (isAdHocInput, adHocPhaseNotified) when invoked from ad-hoc mode", async () => {
      const { pi, registeredCommands, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
        { id: "s3", title: "S3", instructions: "Do C" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        sessionId: "goto-session",
        currentPhaseId: "s1",
        currentIteration: 3,
        totalPhases: 3,
        phasesList: phases,
        filesWritten: ["/old/file.ts"],
        askUserCalled: true,
        isAdHocInput: true, // User was in ad-hoc mode
        adHocPhaseNotified: true, // Already notified about pause
        phaseManager: pm,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "s2", ctx);

      const state = getState();
      // Phase jumped correctly
      expect(state.currentPhaseId).toBe("s2");
      // Ad-hoc flags cleared — follow-up will trigger normal phase instructions, not "Workflow Paused"
      expect(state.isAdHocInput).toBe(false);
      expect(state.adHocPhaseNotified).toBe(false);
      // Tracking cleared
      expect(state.currentIteration).toBe(1);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      // Follow-up sent
      expect(sendUserMessageCalls).toHaveLength(1);
      expect(sendUserMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });
    });
  });

  // ---- Invalid phase ----

  describe("invalid phase", () => {
    it("shows error notification with available phases listed", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        totalPhases: 2,
        phasesList: phases,
        phaseManager: pm,
      });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "nonexistent", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        'Unknown phase "nonexistent". Available phases: s1, s2',
        "error",
      );
    });
  });

  // ---- No arguments ----

  describe("no arguments", () => {
    it("shows warning notification with usage", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [{ id: "s1", title: "S1", instructions: "Do A" }];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "   ", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Usage: /goto <phase-id>",
        "warning",
      );
    });
  });

  // ---- Autocomplete ----

  describe("getArgumentCompletions", () => {
    it("returns all phase IDs when prefix is empty", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "Setup", instructions: "A" },
        { id: "s2", title: "Implement", instructions: "B" },
        { id: "s3", title: "Review", instructions: "C" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      const cmd = registeredCommands.get("goto");
      expect(cmd).toBeDefined();
      expect(cmd!.getArgumentCompletions).toBeDefined();

      const results = cmd!.getArgumentCompletions!("");
      expect(results).toHaveLength(3);
      expect(results).toContainEqual({
        value: "s1",
        label: "s1",
        description: "Setup",
      });
      expect(results).toContainEqual({
        value: "s2",
        label: "s2",
        description: "Implement",
      });
      expect(results).toContainEqual({
        value: "s3",
        label: "s3",
        description: "Review",
      });
    });

    it("filters by case-insensitive prefix", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "Setup", instructions: "A" },
        { id: "s2", title: "Implement", instructions: "B" },
        { id: "other", title: "Other", instructions: "C" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      const cmd = registeredCommands.get("goto");
      const results = cmd!.getArgumentCompletions!("S");
      expect(results).toHaveLength(2);
      expect(results).toContainEqual({
        value: "s1",
        label: "s1",
        description: "Setup",
      });
      expect(results).toContainEqual({
        value: "s2",
        label: "s2",
        description: "Implement",
      });
    });

    it("returns null when PhaseManager is unavailable", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Do NOT set phaseManager in state
      setState({ isActive: false });

      const cmd = registeredCommands.get("goto");
      const results = cmd!.getArgumentCompletions!("");
      expect(results).toBeNull();
    });

    it("returns empty array for non-matching prefix", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "Setup", instructions: "A" },
        { id: "s2", title: "Implement", instructions: "B" },
      ];
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      const cmd = registeredCommands.get("goto");
      const results = cmd!.getArgumentCompletions!("zzz");
      expect(results).toEqual([]);
    });
  });

  // ---- Synthetic merge node filtering (Step 5) ----

  describe("synthetic merge node filtering", () => {
    /**
     * Compute the expected user-facing id set from the registry — the
     * assertion path for the flag-keyed filter contract: synthetic merge
     * nodes are engine-internal and must not surface in user-facing
     * enumerations (mirrors the PhaseManager.listIds() JSDoc contract).
     */
    function nonSyntheticIds(pm: PhaseManager): string[] {
      return pm.listIds().filter((id) => !pm.getPhase(id)?.synthetic);
    }

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

    /**
     * Workflow fixture with one branch (injects `__branch-end-b1`) and one
     * top-level loop (injects `__loop-end-L`) — the registry holds eight
     * ids: six declared phases plus the two synthetic merge nodes.
     */
    function makeBranchLoopPhases(): WorkflowPhase[] {
      return [
        { id: "s1", title: "S1", instructions: "Do A" },
        {
          id: "b1",
          title: "B1",
          kind: "branch:if" as const,
          condition: () => true,
          // biome-ignore lint/suspicious/noThenProperty: intentional test of WorkflowPhase.then field
          then: [{ id: "t1", title: "T1", instructions: "Do T" }],
        },
        {
          id: "L",
          title: "Loop L",
          kind: "loop" as const,
          maxIterations: 3, // explicit cap — hermetic, no model-config
          body: [{ id: "lp1", title: "LP1", instructions: "Do LP" }],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
    }

    it("completions exclude both synthetic merge-node families", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = makeBranchLoopPhases();
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      // The registry holds eight ids: six declared phases (including the
      // branch container b1 and the loop body phase lp1) plus the two
      // synthetic merge nodes.
      expect(pm.listIds()).toHaveLength(8);

      const cmd = registeredCommands.get("goto");
      const results = cmd!.getArgumentCompletions!("");
      expect(results).not.toBeNull();
      expect(results!.map((r) => r.value)).toEqual(nonSyntheticIds(pm));
      expect(results).toHaveLength(6);
      expect(results!.some((r) => r.value.startsWith("__branch-end-"))).toBe(
        false,
      );
      expect(results!.some((r) => r.value.startsWith("__loop-end-"))).toBe(
        false,
      );
    });

    it("loop container id stays listed with its title as description", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = makeBranchLoopPhases();
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        phasesList: phases,
        phaseManager: pm,
      });

      const cmd = registeredCommands.get("goto");
      const results = cmd!.getArgumentCompletions!("");
      expect(results).not.toBeNull();
      // A loop block is a legitimate goto target — not synthetic.
      expect(results).toContainEqual({
        value: "L",
        label: "L",
        description: "Loop L",
      });
    });

    it("unknown-phase error list excludes synthetic merge-node ids", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = makeBranchLoopPhases();
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        currentPhaseId: "s1",
        totalPhases: 6,
        phasesList: phases,
        phaseManager: pm,
      });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "nonexistent", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        `Unknown phase "nonexistent". Available phases: ${nonSyntheticIds(pm).join(", ")}`,
        "error",
      );
      const [msg] = ctx.ui.notify.mock.calls[0];
      expect(msg).not.toContain("__branch-end-");
      expect(msg).not.toContain("__loop-end-");
    });

    it("/goto <loop-block-id> is accepted and lands at body[0] on the follow-up turn", async () => {
      const { pi, registeredCommands, handlers, sendUserMessageCalls } =
        createMockPi();
      const { setupLoopEngine, initializeStore } = await import(
        "./loop-engine"
      );
      setupLoopEngine(pi);

      const phases = makeBranchLoopPhases();
      const pm = new PhaseManager(phases);
      setState({
        isActive: true,
        sessionId: "goto-loop-session",
        currentPhaseId: "s1",
        currentIteration: 1,
        totalPhases: 6,
        phasesList: phases,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        phaseManager: pm,
      });
      // before_agent_start early-returns without a store
      setState({ store: initializeStore({}) });

      const ctx: any = {
        ui: { notify: vi.fn() },
        isIdle: vi.fn().mockReturnValue(true),
      };
      await fireGotoCommand(registeredCommands, "L", ctx);

      // Accepted: no error, container set as current phase, follow-up queued
      expect(ctx.ui.notify).not.toHaveBeenCalled();
      expect(getState().currentPhaseId).toBe("L");
      expect(sendUserMessageCalls).toHaveLength(1);

      // Follow-up turn: before_agent_start traverses the programmatic
      // container into the loop's body[0]
      const results = await fireBeforeAgentStart(handlers);
      expect(results).toHaveLength(1);
      const message = (
        results[0] as {
          message: { customType: string; content: string };
        }
      ).message;
      expect(message.customType).toBe("workflow-phase-instructions");
      expect(message.content).toContain('## Instructions for "lp1"');
      expect(getState().currentPhaseId).toBe("lp1");
      // Prompt-exclusion: no synthetic merge-node id leaks into the payload
      expect(message.content).not.toContain("__branch-end-");
      expect(message.content).not.toContain("__loop-end-");
    });
  });
});

// ---------------------------------------------------------------------------
// resources_discover — pio session detection and state initialization
// ---------------------------------------------------------------------------

describe("resources_discover", () => {
  it("when config is present: loads workflow phases and initializes PioSessionState", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    expect(discoverHandlers).toBeDefined();
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: PioSessionState initialized (single source of truth)
    const state = getState();
    expect(state.isActive).toBe(true);
    expect(state.currentIteration).toBe(1);
    // 2 declared phases + the synthesized "__pio-exit" terminal code phase
    expect(state.totalPhases).toBe(3);
    expect(state.phasesList).toHaveLength(3);
    expect(state.phasesList[0].id).toBe("step-1");
    expect(state.phasesList[2].id).toBe("__pio-exit"); // synthesized tail
    expect(state.isAdHocInput).toBe(false);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);

    // Assert: PhaseManager is set and currentPhaseId is synced
    expect(state.phaseManager).toBeDefined();
    expect(state.phaseManager).toBeInstanceOf(PhaseManager);
    expect(state.currentPhaseId).toBe("step-1");
  });

  it("when config is absent: resets state", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilityUtils.getSessionConfig).mockResolvedValue(null);

    // Pre-set some state
    setState({
      isActive: true,
      totalPhases: 5,
      currentIteration: 2,
      isAdHocInput: true,
    });

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: state reset (including loop engine fields)
    const state = getState();
    expect(state.isActive).toBe(false);
    expect(state.currentIteration).toBe(0);
    expect(state.totalPhases).toBe(0);
    expect(state.phasesList).toEqual([]);
    expect(state.isAdHocInput).toBe(false);
  });

  it("handles missing workflow phases gracefully (empty phases list)", async () => {
    // Arrange: getCompiledWorkflowPhases returns undefined
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      undefined,
    );

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: session is still active with empty phases list (single-pass execution)
    const state = getState();
    expect(state.isActive).toBe(true);
    expect(state.totalPhases).toBe(0);
    expect(state.phasesList).toEqual([]);
  });

  it("totalPhases counts declared top-level phases + __pio-exit only, not synthetic merge nodes", async () => {
    // Arrange: declared workflow with one branch and one loop block —
    // four declared top-level phases
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      { id: "s1", title: "S1", instructions: "Do A" },
      {
        id: "b1",
        title: "B1",
        kind: "branch:if" as const,
        condition: () => true,
        // biome-ignore lint/suspicious/noThenProperty: intentional test of WorkflowPhase.then field
        then: [{ id: "t1", title: "T1", instructions: "Do T" }],
      },
      {
        id: "L",
        title: "Loop L",
        kind: "loop" as const,
        maxIterations: 3, // explicit cap — hermetic, no model-config
        body: [{ id: "lp1", title: "LP1", instructions: "Do LP" }],
      },
      { id: "s2", title: "S2", instructions: "Do B" },
    ]);

    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const handler of discoverHandlers!) {
      await handler(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: totalPhases counts declared top-level phases + __pio-exit only
    const state = getState();
    expect(state.totalPhases).toBe(5);
    expect(state.phasesList).toHaveLength(5);
    expect(state.phasesList[4].id).toBe("__pio-exit");

    // Contrast: the PhaseManager registry DOES hold the synthetic merge
    // nodes — they exist only inside the registry, never in phasesList
    const ids = state.phaseManager!.listIds();
    expect(ids).toContain("__branch-end-b1");
    expect(ids).toContain("__loop-end-L");
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

  it("normal run: preserves currentIteration but resets tracking fields (setupTurn preserve mode)", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Pre-populate state with values that should be reset
    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 1,
      isAdHocInput: false,
      filesWritten: ["/x.ts"],
      askUserCalled: true,
      phasesList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
      totalPhases: 2,
      store,
    });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: iteration preserved, tracking fields reset by setupTurn("preserve")
    const state = getState();
    expect(state.currentIteration).toBe(1);
    expect(state.filesWritten).toEqual([]);
    expect(state.askUserCalled).toBe(false);
    expect(state.isAdHocInput).toBe(false);
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
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
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
    it("returns message with customType workflow-phase-instructions on first run of Phase 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1, // initialized at 1 in resources_discover
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base prompt",
      });

      expect(results).toHaveLength(1);
      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-phase-instructions");
      expect(result.message.display).toBe(false);
      // Content should NOT contain the base system prompt
      expect(result.message.content).not.toContain("base prompt");
      expect(result.message.content).toContain(`You are on "s1", iteration 1.`);
      expect(result.message.content).toContain("Do A");
    });

    it("returns message with correct phase id on Phase 2", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const store = initializeStore({});
      setState({
        isActive: true,
        currentPhaseId: "s2",
        currentIteration: 1, // initialized at 1 in resources_discover
        totalPhases: 3,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
          { id: "s3", title: "S3", instructions: "Do C" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-phase-instructions");
      expect(result.message.content).toContain(`You are on "s2", iteration 1.`);
    });

    it("includes loopMessage as Retry focus on iteration > 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 2, // already > 1 (no increment in before_agent_start)
        totalPhases: 1,
        phasesList: [
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
        store,
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

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1, // first iteration (no increment in before_agent_start)
        totalPhases: 1,
        phasesList: [
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
        store,
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

    it("skips injection when phasesList is empty", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 0,
        phasesList: [],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      // No CustomMessage returned (early return)
      expect(results).toHaveLength(0);
    });

    it("skips injection when currentPhaseId is unknown", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const store = initializeStore({});
      setState({
        isActive: true,
        currentPhaseId: "nonexistent",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "A" },
          { id: "s2", title: "S2", instructions: "B" },
        ],
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      expect(results).toHaveLength(0);
    });

    it("skips purely programmatic variable-def phase and returns instructions for next phase", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Phase 1: variable-def with only static vars (no LLM vars) — purely programmatic
      // Phase 2: standard phase — should get instructions for this one
      const phases = [
        {
          id: "var-setup",
          title: "Var Setup",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "env",
              kind: "static" as const,
              type: "string" as const,
              value: "test",
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      const results = await fireBeforeAgentStart(handlers, {
        type: "before_agent_start",
        systemPrompt: "base",
      });

      // Should skip the programmatic phase and return instructions for phase 2
      expect(results).toHaveLength(1);
      const result = results[0] as {
        message: { customType: string; content: string; display: boolean };
      };
      expect(result.message.customType).toBe("workflow-phase-instructions");
      // Content should reference phase 2, not phase 1
      expect(result.message.content).toContain(`You are on "s2"`);
      expect(result.message.content).not.toContain(`You are on "var-setup"`);
      // State should have advanced past the programmatic phase
    });
  });

  // ---- CustomMessage injection (ad-hoc mode) ----

  describe("CustomMessage injection (ad-hoc mode)", () => {
    it("returns message with customType workflow-paused and phase context", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentPhaseId: "s2",
        currentIteration: 3,
        totalPhases: 4,
        phasesList: [
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
      expect(result.message.content).toContain(
        `You were on "s2", iteration 3.`,
      );
      expect(result.message.content).toContain(
        "Workflow execution is paused. Any prior instructions are no longer active — you can answer questions or help the user freely.",
      );
      // Should NOT contain phase instructions
      expect(result.message.content).not.toContain("Do B");
    });

    it("skips ad-hoc injection when phasesList is empty", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 0,
        phasesList: [],
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

    // ---- Single-fire: adHocPhaseNotified guard ----

    describe("single-fire guard (adHocPhaseNotified)", () => {
      it("fires message on first ad-hoc entry and sets adHocPhaseNotified", async () => {
        const { pi, handlers } = createMockPi();
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        setState({
          isActive: true,
          currentIteration: 1,
          totalPhases: 2,
          phasesList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
          ],
          isAdHocInput: true,
          // adHocPhaseNotified defaults to false
          filesWritten: [],
          askUserCalled: false,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
        });

        // Should return the workflow-paused message
        expect(results).toHaveLength(1);
        const result = results[0] as {
          message: { customType: string; content: string; display: boolean };
        };
        expect(result.message.customType).toBe("workflow-paused");

        // Flag should now be set
        expect(getState().adHocPhaseNotified).toBe(true);
      });

      it("does NOT fire message on second ad-hoc turn (adHocPhaseNotified=true)", async () => {
        const { pi, handlers } = createMockPi();
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        const store = initializeStore({});
        setState({
          isActive: true,
          currentIteration: 1,
          totalPhases: 2,
          phasesList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
          ],
          isAdHocInput: true,
          adHocPhaseNotified: true, // already notified
          filesWritten: [],
          askUserCalled: false,
          store,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
        });

        // Should return nothing — no message, no fallthrough to normal mode
        expect(results).toHaveLength(0);
      });

      it("does NOT fall through to normal-mode logic on subsequent ad-hoc turns", async () => {
        const { pi, handlers } = createMockPi();
        const { setupLoopEngine } = await import("./loop-engine");
        setupLoopEngine(pi);

        const store = initializeStore({});
        setState({
          isActive: true,
          currentIteration: 1,
          totalPhases: 2,
          phasesList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
          ],
          isAdHocInput: true,
          adHocPhaseNotified: true,
          filesWritten: [],
          askUserCalled: false,
          store,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
        });

        // Critical: should NOT return a workflow-phase-instructions message
        // (which would indicate fallthrough to normal-mode logic)
        expect(results).toHaveLength(0);
      });
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

        const store = initializeStore({});
        setState({
          isActive: true,
          currentIteration: 1,
          totalPhases: 2,
          phasesList: [
            { id: "s1", title: "S1", instructions: "Do A" },
            { id: "s2", title: "S2", instructions: "Do B" },
          ],
          isAdHocInput: false,
          filesWritten: [],
          askUserCalled: false,
          store,
        });

        const results = await fireBeforeAgentStart(handlers, {
          type: "before_agent_start",
          systemPrompt: "base",
        });

        expect(results).toHaveLength(1);
        const result = results[0] as {
          message: { customType: string; content: string; display: boolean };
        };
        expect(result.message.customType).toBe("workflow-phase-instructions");
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
          currentIteration: 3,
          totalPhases: 4,
          phasesList: [
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

        const store = initializeStore({});
        setState({
          isActive: true,
          currentIteration: 1,
          totalPhases: 1,
          phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
          isAdHocInput: false,
          filesWritten: [],
          askUserCalled: false,
          store,
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

  it("before_agent_start resets tracking fields via setupTurn(preserve) — new turn starts fresh", async () => {
    // Arrange
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Simulate end of iteration 1 with tracking data
    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 1,
      isAdHocInput: false,
      filesWritten: ["/old/file.ts"],
      askUserCalled: true,
      phasesList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
      totalPhases: 2,
      store,
    });

    // Act: fire before_agent_start
    await fireBeforeAgentStart(handlers);

    // Assert: tracking data IS cleared (new turn starts fresh), iteration preserved
    const state = getState();
    expect(state.currentIteration).toBe(1);
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
        mockCtx,
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
    // 2 declared phases + synthesized "__pio-exit" terminal node
    expect(state.phasesList).toHaveLength(3);
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
        mockCtx,
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
        mockCtx,
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ]);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ]);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
        { id: "s1", title: "S1", instructions: "Do A" },
      ]);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
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

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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

      // Ad-hoc guard: no follow-up injected, phase not advanced
      expect(sendUserMessageCalls).toHaveLength(0);
    });
  });

  // ---- Max iterations hard stop ----

  describe("max iterations hard stop", () => {
    it("does nothing when currentIteration >= resolved maxIterations", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Use totalPhases: 2 so that without the max check, advancement to phase 2
      // would send a follow-up. The assertion (no follow-up) proves max check works.
      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          maxIterations: 3,
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 3, // >= maxIterations (3) → hard stop
        totalPhases: 2,
        phasesList: phases,
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
      // → would advance to phase 2 and send "Do B" as follow-up.
      expect(sendUserMessageCalls).toHaveLength(0);
    });
  });

  // ---- Single-iteration phases (no loop fields) ----

  describe("single-iteration phases", () => {
    it("advances to next phase after one agent run (no loop fields)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Should advance to next phase via sendMessage
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].message.content).toContain(
        `## Instructions for "s2"`,
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

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
          loopMessage: "Keep going",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 2, // < minIterations (3)
        totalPhases: 2,
        phasesList: phases,
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

      // Should loop on same phase via sendMessage
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen callback returns true", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1, // >= minIterations
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Callback returns true → advance via sendMessage
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("loops when all terminateWhen callbacks return false (AND logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("loops when first callback returns false (AND logic — all must pass)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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

      // AND logic: first callback false → loop (all must pass)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when all terminateWhen callbacks return true (AND logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"], // First callback returns true
        askUserCalled: true, // Second callback returns true
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // AND logic: all callbacks true → advance
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("treats callback error as NOT met (fail-safe: keep looping)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen is undefined after minIterations reached", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 2, // >= minIterations
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // No terminateWhen + minIterations reached → advance via sendMessage
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });

    it("advances when terminateWhen is empty array after minIterations reached", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Empty terminateWhen + minIterations reached → advance via sendMessage
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.customType).toBe(
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({ deliverAs: "followUp" });
    });
  });

  // ---- Loop replay ----

  // ---- State mutation during loop replay ----

  describe("loop replay state mutation", () => {
    it("increments currentIteration by 1 during loop replay", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // < minIterations (3) → loop replay
        totalPhases: 1,
        phasesList: phases,
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

      // Loop replay should increment iteration
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("resets filesWritten to empty array during loop replay", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 2,
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // < minIterations (2) → loop replay
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"], // pre-populated from iteration 1
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // filesWritten should be reset
      expect(getState().filesWritten).toEqual([]);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("resets askUserCalled to false during loop replay", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 2,
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // < minIterations (2) → loop replay
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: true, // was true from iteration 1
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // askUserCalled should be reset
      expect(getState().askUserCalled).toBe(false);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("follow-up message shows iteration N+1 (uses updated state)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // will become 2 after replay
        totalPhases: 1,
        phasesList: phases,
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

      // Message should show "iteration 2", not "iteration 1"
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.content).toContain("iteration 2");
      expect(sendMessageCalls[0].message.content).not.toContain("iteration 1");
    });
  });

  // ---- Existing loop replay tests ----

  describe("loop replay", () => {
    it("sends CustomMessage via sendMessage when loopMessage is undefined", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
          // No loopMessage
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // < minIterations
        totalPhases: 1,
        phasesList: phases,
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
        "workflow-phase-instructions",
      );
      expect(sendMessageCalls[0].options).toEqual({
        deliverAs: "followUp",
      });
    });
  });

  // ---- Last phase boundary ----

  describe("last phase boundary", () => {
    it("exercises exhaustion path through advancePhase when at last phase", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
        },
      ]);

      // Fire resources_discover so the PhaseManager carries the synthesized
      // "__pio-exit" terminal node, exactly as in production wiring.
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Config present → the terminal exit node runs the (mocked) lifecycle
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );

      // Set iteration/tracking WITHOUT phasesList — keeps the discover-built
      // phaseManager (with synthesized tail) intact.
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 3,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // resolveNext("s1") → "__pio-exit" → advancePhase runs the exit lifecycle,
      // then resolveNext("__pio-exit") → undefined → { triggered: false }
      // Section 6 resets tracking and persists, then returns
      expect(sendMessageCalls).toHaveLength(0);
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        1,
      );
      expect(getState().exitOutcome).toBe("success");
      expect(getState().markCompleteCalled).toBe(true); // set by __pio-exit
      expect(getState().currentIteration).toBe(1); // Reset on exhaustion
      expect(getState().filesWritten).toEqual([]); // Reset on exhaustion
      expect(getState().askUserCalled).toBe(false); // Reset on exhaustion
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
    });
  });

  describe("programmatic-only remaining phases", () => {
    it("returns naturally when all remaining phases are programmatic", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
        { id: "p1", title: "P1", instructions: "Do A" },
        {
          id: "p2",
          title: "P2",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "staging",
            },
          ],
        },
      ]);

      // Fire resources_discover so the PhaseManager carries the synthesized
      // "__pio-exit" terminal node (production wiring).
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );

      // No phasesList here — keeps the discover-built phaseManager intact.
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        markCompleteCalled: false,
        filesWritten: ["/some/file.ts"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // resolveNext("p1") → "p2" (programmatic variable phase), then
      // resolveNext("p2") → "__pio-exit" (runs the exit lifecycle), then
      // resolveNext("__pio-exit") → undefined → { triggered: false }
      // Section 6 resets tracking and persists, then returns
      expect(sendMessageCalls).toHaveLength(0);
      expect(getState().store!.get("env")).toBe("staging"); // executePhase still ran
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        1,
      );
      expect(getState().exitOutcome).toBe("success");
      expect(getState().currentIteration).toBe(1); // Reset on exhaustion
      expect(getState().filesWritten).toEqual([]);
      expect(getState().askUserCalled).toBe(false);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
    });
  });

  // ---- resolveMaxIterations usage ----

  describe("resolveMaxIterations integration", () => {
    it("uses resolveMaxIterations with phase maxIterations for resolution", async () => {
      const { pi, handlers, sendUserMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Use totalPhases: 2 so that without the max check, advancement to phase 2
      // would send a follow-up. The assertion (no follow-up) proves max check works.
      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          maxIterations: 5,
          loopMessage: "Retry",
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 5, // >= maxIterations (5) → hard stop
        totalPhases: 2,
        phasesList: phases,
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
      // → would advance to phase 2 and send "Do B" as follow-up.
      expect(sendUserMessageCalls).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase advancement state reset
// ---------------------------------------------------------------------------

describe("phase advancement state reset", () => {
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

  it("resets currentIteration to 1 on phase transition", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const phases = [
      { id: "s1", title: "S1", instructions: "Do A" },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      phases,
    );

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 3, // Phase 1 ran for 3 iterations
      totalPhases: 2,
      phasesList: phases,
      markCompleteCalled: false,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    // Phase advanced to 2, iteration reset to 1
    expect(getState().currentIteration).toBe(1);
    expect(sendMessageCalls).toHaveLength(1);
  });

  it("resets filesWritten on phase transition", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const phases = [
      { id: "s1", title: "S1", instructions: "Do A" },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      phases,
    );

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      markCompleteCalled: false,
      filesWritten: ["/a.ts", "/b.ts"],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    expect(getState().filesWritten).toEqual([]);
    expect(sendMessageCalls).toHaveLength(1);
  });

  it("resets askUserCalled on phase transition", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const phases = [
      { id: "s1", title: "S1", instructions: "Do A" },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      phases,
    );

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      markCompleteCalled: false,
      filesWritten: [],
      askUserCalled: true,
      isAdHocInput: false,
      store,
    });

    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    expect(getState().askUserCalled).toBe(false);
    expect(sendMessageCalls).toHaveLength(1);
  });

  it("phase 2 does not immediately skip (iteration reset prevents premature advance)", async () => {
    // Critical "phase skip" scenario: Phase 1 ran for 3 iterations.
    // Without iteration reset, Phase 2 would see currentIteration=3,
    // 3 >= minIterations(1) → true, and advance immediately without running.
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const phases = [
      { id: "s1", title: "S1", instructions: "Do A" },
      { id: "s2", title: "S2", instructions: "Do B" },
      { id: "s3", title: "S3", instructions: "Do C" },
    ];
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      phases,
    );

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 3, // Phase 1 had multiple iterations
      totalPhases: 3,
      phasesList: phases,
      markCompleteCalled: false,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    // After advancement: Phase 2, iteration reset to 1 (not 3)
    expect(getState().currentIteration).toBe(1);
    // If iteration were not reset (still 3), Phase 2 would have
    // 3 >= minIterations(1) → advance to Phase 3 immediately.
    // The fact that currentIteration is 1 proves the reset works.
    expect(sendMessageCalls).toHaveLength(1);
  });

  it("next-phase message shows iteration 1", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const phases = [
      { id: "s1", title: "S1", instructions: "Do A" },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
      phases,
    );

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 3, // Phase 1 had multiple iterations
      totalPhases: 2,
      phasesList: phases,
      markCompleteCalled: false,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    // Message should show "iteration 1" for Phase 2, not "iteration 3"
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].message.content).toContain("iteration 1");
    expect(sendMessageCalls[0].message.content).not.toContain("iteration 3");
  });

  it("before_agent_start preserves currentIteration via setupTurn(preserve)", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const store = initializeStore({});
    setState({
      isActive: true,
      currentIteration: 5,
      totalPhases: 2,
      phasesList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
      isAdHocInput: false,
      filesWritten: [],
      askUserCalled: false,
      store,
    });

    // Fire before_agent_start
    const handlersList = handlers.get("before_agent_start");
    expect(handlersList).toBeDefined();
    const mockCtx = {} as any;
    const results: unknown[] = [];
    for (const handler of handlersList!) {
      const result = await handler({ type: "before_agent_start" }, mockCtx);
      if (result) results.push(result);
    }

    // currentIteration should still be 5 (preserve mode does not increment)
    expect(getState().currentIteration).toBe(5);
    // CustomMessage injection should still work
    expect(results).toHaveLength(1);
    const result = results[0] as {
      message: { customType: string; content: string; display: boolean };
    };
    expect(result.message.customType).toBe("workflow-phase-instructions");
  });
});

// ---------------------------------------------------------------------------
// buildPhaseInstructions helper
// ---------------------------------------------------------------------------

describe("buildPhaseInstructions", () => {
  async function getBuildPhaseInstructions() {
    const mod = await import("./loop-engine");
    return mod.buildPhaseInstructions;
  }

  it("produces authority header (## Instructions for Phase N)", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentPhaseId: "s2",
      currentIteration: 1,
      totalPhases: 3,
      phasesList: [
        { id: "s1", title: "S1", instructions: "A" },
        { id: "s2", title: "S2", instructions: "B" },
        { id: "s3", title: "S3", instructions: "C" },
      ],
    });
    const result = build(getState());
    expect(result).toContain(`## Instructions for "s2"`);
  });

  it("contains authority text without leaking future phases", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 1,
      totalPhases: 2,
      phasesList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
    });
    const result = build(getState());
    expect(result).toContain(
      "Follow the instructions below. Do not do anything outside these instructions.",
    );
    expect(result).not.toContain("future phases");
  });

  it("includes phase position line", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 1,
      totalPhases: 2,
      phasesList: [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ],
    });
    const result = build(getState());
    expect(result).toContain(`You are on "s1", iteration 1.`);
  });

  it("includes separator (---) before instructions", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    // Verify separator exists on its own line
    const lines = result.split("\n");
    expect(lines).toContain("---");
  });

  it("includes phase instructions content", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    expect(result).toContain("Do A");
  });

  it("includes loopMessage as Retry focus when currentIteration > 1", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 2,
      totalPhases: 1,
      phasesList: [
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
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [
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

  it("does NOT include loopMessage when phase has no loopMessage", async () => {
    const build = await getBuildPhaseInstructions();
    setState({
      currentIteration: 2,
      totalPhases: 1,
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });
    const result = build(getState());
    expect(result).not.toContain("Retry focus");
  });

  it("does NOT append Retry focus for variable-defining phases (undefined-var listing is the retry message)", async () => {
    const build = await getBuildPhaseInstructions();
    const { SessionVariableStore } = await import("./session-store");

    const store = new SessionVariableStore({});
    setState({
      currentIteration: 2,
      totalPhases: 1,
      phasesList: [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          loopMessage: "This should not appear",
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What feature?",
            },
          ],
        },
      ],
      store,
    });
    const result = build(getState());
    // Variable-defining phases use undefined-var listing instead of loopMessage
    expect(result).not.toContain("**Retry focus:**");
    expect(result).not.toContain("This should not appear");
    // Undefined var listing should be present (iteration > 1, feature not set)
    expect(result).toContain("Undefined Variables");
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
// tool_call — phase-level write gate
// ---------------------------------------------------------------------------

describe("tool_call — phase-level write gate", () => {
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

  // Helper: create a mock CapState for write-gate tests
  function makeMockCapState(
    resolutions: Record<string, { entry: unknown; path: string }>,
  ) {
    return {
      tryResolveOutput: (name: string) => resolutions[name] ?? undefined,
    } as any;
  }

  // (a) Contract output write blocked when target not in allowlist
  it("blocks contract output write when target not in allowlist", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Set up: Phase 1 has write: ["goal"], Phase 2 has write: ["plan"]
    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
        { id: "s2", title: "S2", instructions: "B", write: ["plan"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
        plan: { entry: {}, path: "/test/.pio/goals/test/PLAN.md" },
      }),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
    });

    // Act: try to write PLAN.md during Phase 1 (only goal is allowed)
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
    expect(blocked!.reason).toContain('"s1" (S1)');
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
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
        { id: "s2", title: "S2", instructions: "B", write: ["plan"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
        plan: { entry: {}, path: "/test/.pio/goals/test/PLAN.md" },
      }),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
    });

    // Act: write GOAL.md during Phase 1 (goal is allowed)
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: not blocked
    expect(result).toBeUndefined();
    // File should still be tracked
    expect(getState().filesWritten).toContain("/test/.pio/goals/test/GOAL.md");
  });

  // (c) Restricted-by-default: phase without write field blocks contract outputs
  it("blocks contract output write when phase has no write field (restricted-by-default)", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Phase without write field → empty allowlist → blocks all contract outputs
    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [{ id: "s1", title: "S1", instructions: "A" }], // no write
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
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

  // (d) No phase found: warn and pass through
  it("emits console.warn when no phase found for write gating", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "nonexistent",
      phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });

    // Act: try to write a contract output
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: warning emitted, write not blocked
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no phase found for write gating"),
    );
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });

  // (d) Empty write array blocks contract output writes
  it("empty write array blocks contract output writes", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
        { id: "s2", title: "Write", instructions: "B", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
    });

    // Act: try to write GOAL.md during Phase 1 (write: [])
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
    expect(blocked2!.reason).toContain('"s1" (Research)');
  });

  // (d cont.) Empty write array passes non-contract paths through
  it("empty write array passes non-contract paths through", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
      projectRoot: "/test/.pio/goals/test", // /some/project/file.ts is outside this root
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
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [{ id: "s1", title: "S1", instructions: "A", write: [] }],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set(["/test/.pio/goals/test/GOAL.md"]),
    });

    // Act: write to /tmp/
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/tmp/scratch.txt", content: "x" },
    });

    // Assert: not blocked
    expect(result).toBeUndefined();
  });

  // (f) resources_discover sets up capState regardless of write field contents
  it("resources_discover sets capState and allContractOutputs", async () => {
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
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      {
        id: "s1",
        title: "S1",
        instructions: "A",
        write: ["goal", "nonexistent"], // "nonexistent" doesn't exist in contract
      },
    ]);

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: capState and allContractOutputs are set
    const state = getState();
    expect(state.capState).toBeDefined();
    expect(state.allContractOutputs).toBeDefined();
    expect(state.allContractOutputs!.size).toBe(1); // only "goal" output
  });

  // Gate blocks vscode_apply_workspace_edit with disallowed contract output
  it("blocks vscode_apply_workspace_edit targeting disallowed contract output", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
        plan: { entry: {}, path: "/test/.pio/goals/test/PLAN.md" },
      }),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
    });

    // Act: try to edit PLAN.md during Phase 1
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
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
        plan: { entry: {}, path: "/test/.pio/goals/test/PLAN.md" },
      }),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
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
      currentIteration: 1,
      totalPhases: 2,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "S1", instructions: "A", write: ["goal"] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
        plan: { entry: {}, path: "/test/.pio/goals/test/PLAN.md" },
      }),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
    });

    // Act: try to edit PLAN.md during Phase 1 (only goal is allowed)
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
  // Integration tests: resources_discover → tool_call (lazy resolution)
  // -----------------------------------------------------------------------

  it("integration: resources_discover sets capState and allContractOutputs for lazy write gating", async () => {
    // Arrange: phases with and without write field
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      { id: "s1", title: "Research", instructions: "Do research" }, // no write
      {
        id: "s2",
        title: "Write",
        instructions: "Write stuff",
        write: ["goal"],
      },
    ]);

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Assert: capState and allContractOutputs are populated
    const state = getState();
    expect(state.capState).toBeDefined();
    expect(state.allContractOutputs).toBeDefined();
    expect(state.allContractOutputs!.size).toBe(2); // goal + plan from default mock
  });

  it("integration: resources_discover + tool_call — phase without write blocks contract output", async () => {
    // Arrange: phases without write field
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      { id: "s1", title: "Research", instructions: "Do research" }, // no write
    ]);

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover to set up capState and allContractOutputs
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Set currentPhaseId to the phase without write

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

  it("integration: resources_discover + tool_call — phase without write allows non-contract files", async () => {
    // Arrange: phases without write field
    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      { id: "s1", title: "Research", instructions: "Do research" }, // no write
    ]);

    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

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

  // -----------------------------------------------------------------------
  // Project file write gate (allowProjectWrites)
  // -----------------------------------------------------------------------

  it("resources_discover sets projectRoot from ctx.cwd", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const ctxWithCwd = {
      ...mockCtx,
      cwd: "/my/project",
    } as any;

    // Act: fire resources_discover
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: "/my/project", reason: "startup" },
        ctxWithCwd,
      );
    }

    // Assert: projectRoot is set to resolved cwd
    const state = getState();
    expect(state.projectRoot).toBe(path.resolve("/my/project"));
  });

  it("resources_discover sets projectRoot from process.cwd when ctx.cwd is missing", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    const ctxNoCwd = {
      ...mockCtx,
      cwd: undefined,
    } as any;

    // Act: fire resources_discover without cwd
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: undefined, reason: "startup" },
        ctxNoCwd,
      );
    }

    // Assert: projectRoot is set to resolved process.cwd()
    const state = getState();
    expect(state.projectRoot).toBe(path.resolve(process.cwd()));
  });

  it("blocks non-contract project file writes when allowProjectWrites is false", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
      projectRoot: "/test/project",
    });

    // Act: try to write a non-contract file under project root
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/project/src/foo.ts", content: "x" },
    });

    // Assert: blocked
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Writing project files is not allowed"),
    });
    expect(blocked!.reason).toContain('"s1" (Research)');
    expect(blocked!.reason).toContain("allowProjectWrites");
  });

  it("allows non-contract project file writes when allowProjectWrites is true", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        {
          id: "s1",
          title: "Implement",
          instructions: "A",
          write: ["goal"],
          allowProjectWrites: true,
        },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/.pio/goals/test/GOAL.md" },
      }),
      allContractOutputs: new Set(["/test/.pio/goals/test/GOAL.md"]),
      projectRoot: "/test/project",
    });

    // Act: write a non-contract file under project root
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/project/src/foo.ts", content: "x" },
    });

    // Assert: not blocked
    expect(result).toBeUndefined();
  });

  it("allows non-contract files outside project root regardless of allowProjectWrites", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([
        "/test/.pio/goals/test/GOAL.md",
        "/test/.pio/goals/test/PLAN.md",
      ]),
      projectRoot: "/test/project",
    });

    // Act: write a file outside project root
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/other/path/src/foo.ts", content: "x" },
    });

    // Assert: not blocked (outside project root)
    expect(result).toBeUndefined();
  });

  it("blocks non-contract writes when projectRoot is undefined", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set(["/test/.pio/goals/test/GOAL.md"]),
      // projectRoot is intentionally omitted
    });

    // Act: write a non-contract file
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/any/path/foo.ts", content: "x" },
    });

    // Assert: blocked (can't verify safety without projectRoot)
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Cannot determine project root"),
    });
  });

  it("blocks non-contract .pio/ writes when allowProjectWrites is false", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set(["/test/project/.pio/goals/test/GOAL.md"]),
      projectRoot: "/test/project",
    });

    // Act: try to write a non-contract .pio/ file under project root
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/project/.pio/goals/other/notes.md", content: "x" },
    });

    // Assert: blocked (non-contract .pio/ files are also project files)
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Writing project files is not allowed"),
    });
  });

  it("contract outputs in allowlist still pass even when allowProjectWrites is false", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        {
          id: "s1",
          title: "Write Goal",
          instructions: "A",
          write: ["goal"],
          // allowProjectWrites is false (default)
        },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({
        goal: { entry: {}, path: "/test/project/.pio/goals/test/GOAL.md" },
      }),
      allContractOutputs: new Set([
        "/test/project/.pio/goals/test/GOAL.md",
        "/test/project/.pio/goals/test/PLAN.md",
      ]),
      projectRoot: "/test/project",
    });

    // Act: write the allowed contract output (which happens to be under project root)
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/project/.pio/goals/test/GOAL.md", content: "x" },
    });

    // Assert: not blocked (contract output in allowlist takes precedence)
    expect(result).toBeUndefined();
  });

  it("handles path boundary correctly — similar prefix is not blocked", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: new Set([]),
      projectRoot: "/home/user/project",
    });

    // Act: write to a path with similar prefix but not under project root
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/home/user/projects/other/file.ts", content: "x" },
    });

    // Assert: not blocked ("/home/user/projects" is not under "/home/user/project/")
    expect(result).toBeUndefined();
  });

  it("allOutputs defaults to empty set when allContractOutputs is null", async () => {
    const { pi, handlers } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    setState({
      isActive: true,
      currentIteration: 1,
      totalPhases: 1,
      currentPhaseId: "s1",
      phasesList: [
        { id: "s1", title: "Research", instructions: "A", write: [] },
      ],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      capState: makeMockCapState({}),
      allContractOutputs: null, // explicitly null
      projectRoot: "/test/project",
    });

    // Act: write a non-contract file — should not crash
    const result = await fireToolCall(handlers, {
      toolName: "write",
      input: { path: "/test/project/src/foo.ts", content: "x" },
    });

    // Assert: no crash, result is blocked by project gate (not by null allOutputs)
    const blocked = result as { block: boolean; reason: string } | undefined;
    expect(blocked).toEqual({
      block: true,
      reason: expect.stringContaining("Writing project files is not allowed"),
    });
  });
});

// ---------------------------------------------------------------------------
// Persistence integration tests
// ---------------------------------------------------------------------------

describe("persistence integration", () => {
  // -----------------------------------------------------------------------
  // resources_discover — session ID capture
  // -----------------------------------------------------------------------

  describe("resources_discover — session ID capture", () => {
    it("captures session ID from ctx.sessionManager.getSessionId()", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act: fire resources_discover
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Assert: session ID stored
      expect(getState().sessionId).toBe("test-session-id");
    });

    it("getSessionId is called during resources_discover", async () => {
      const getSessionIdSpy = vi
        .spyOn(mockCtx.sessionManager, "getSessionId")
        .mockReturnValue("spy-session-id");
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Assert
      expect(getSessionIdSpy).toHaveBeenCalledTimes(1);
      expect(getState().sessionId).toBe("spy-session-id");
      getSessionIdSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // resources_discover — state restoration
  // -----------------------------------------------------------------------

  describe("resources_discover — state restoration", () => {
    it("restores saved state when loadLoopEngineState returns data", async () => {
      const savedState = {
        currentIteration: 2,
        isAdHocInput: true,
        currentPhaseId: "",
      };
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue(
        savedState,
      );

      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Assert: restored values used
      const state = getState();
      expect(state.currentIteration).toBe(2);
      expect(state.isAdHocInput).toBe(true);

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });

    it("prefers saved currentPhaseId over reconstruction from numeric index", async () => {
      const savedState = {
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "step-2",
      };
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue(
        savedState,
      );

      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Assert: saved currentPhaseId is preferred over reconstruction
      const state = getState();
      expect(state.currentPhaseId).toBe("step-2");

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });

    it("uses defaults when loadLoopEngineState returns null", async () => {
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue(null);

      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act
      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      // Assert: defaults used
      const state = getState();
      expect(state.currentIteration).toBe(1);
      expect(state.isAdHocInput).toBe(false);

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });

    it("corrupt file (null from load) starts fresh at Phase 1 without throwing", async () => {
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue(null);

      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Act: should not throw
      await expect(
        (async () => {
          const discoverHandlers = handlers.get("resources_discover");
          for (const h of discoverHandlers!) {
            await h(
              { type: "resources_discover", cwd: ".", reason: "startup" },
              mockCtx,
            );
          }
        })(),
      ).resolves.not.toThrow();

      // Assert: fresh state
      expect(getState().sessionId).toBe("test-session-id");

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });
  });

  // -----------------------------------------------------------------------
  // Persist on mutation — agent_end loop replay
  // -----------------------------------------------------------------------

  describe("persist on mutation — agent_end loop replay", () => {
    it("calls saveLoopEngineState after loop replay", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 3,
        },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      // Act
      const handlersList = handlers.get("agent_end");
      for (const handler of handlersList!) {
        await handler(
          {
            type: "agent_end",
            messages: [{ role: "assistant", stopReason: "stop" }],
          },
          {} as any,
        );
      }

      // Assert: save called with incremented iteration
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({ currentIteration: 2 }),
      );

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });
  });

  // -----------------------------------------------------------------------
  // Persist on mutation — agent_end phase advancement
  // -----------------------------------------------------------------------

  describe("persist on mutation — agent_end phase advancement", () => {
    it("calls saveLoopEngineState after phase advancement", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        { id: "s1", title: "S1", instructions: "Do A" },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Act
      const handlersList = handlers.get("agent_end");
      for (const handler of handlersList!) {
        await handler(
          {
            type: "agent_end",
            messages: [{ role: "assistant", stopReason: "stop" }],
          },
          {} as any,
        );
      }

      // Assert: save called (executePhase persists + setupTurn persists = 2 calls)
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(2);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({
          currentPhaseId: "s2",
          currentIteration: 1,
          isAdHocInput: false,
        }),
      );

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });
  });

  // -----------------------------------------------------------------------
  // Persist on mutation — input handler
  // -----------------------------------------------------------------------

  describe("persist on mutation — input handler", () => {
    it("calls saveLoopEngineState after setting isAdHocInput", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        isAdHocInput: false,
        currentIteration: 1,
      });

      // Act
      const handlersList = handlers.get("input");
      for (const handler of handlersList!) {
        await handler({ source: "interactive" });
      }

      // Assert: save called with isAdHocInput: true
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({ isAdHocInput: true }),
      );

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });
  });

  // -----------------------------------------------------------------------
  // Persist on mutation — /continue command
  // -----------------------------------------------------------------------

  describe("persist on mutation — /continue command", () => {
    it("calls saveLoopEngineState after /continue clears ad-hoc mode", async () => {
      const { pi, registeredCommands } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 2,
        totalPhases: 2,
        phasesList: [
          { id: "s1", title: "S1", instructions: "Do A" },
          { id: "s2", title: "S2", instructions: "Do B" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: true,
      });

      // Act
      const cmd = registeredCommands.get("continue");
      expect(cmd).toBeDefined();
      await cmd!.handler("", {} as any);

      // Assert: save called with isAdHocInput: false, preserved phase/iteration
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({
          isAdHocInput: false,
          currentIteration: 2, // preserved
        }),
      );

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });
  });

  // -----------------------------------------------------------------------
  // session_shutdown handler
  // -----------------------------------------------------------------------

  describe("session_shutdown handler", () => {
    it("calls saveLoopEngineState on 'reload' reason", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 3,
        isAdHocInput: false,
      });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      expect(shutdownHandlers).toBeDefined();
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "reload" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({
          currentIteration: 3,
          isAdHocInput: false,
        }),
      );

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });

    it("calls saveLoopEngineState on 'quit' reason", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        isAdHocInput: false,
      });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "quit" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();
    });

    it("does NOT call saveLoopEngineState on 'new' reason", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        isAdHocInput: false,
      });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "new" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });

    it("does NOT call saveLoopEngineState on 'resume' reason", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        isAdHocInput: false,
      });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "resume" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });

    it("does NOT call saveLoopEngineState on 'fork' reason", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        isAdHocInput: false,
      });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "fork" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });

    it("does nothing when isActive is false", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: false, sessionId: "test-session-id" });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "reload" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });

    it("does nothing when sessionId is undefined", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({ isActive: true, sessionId: undefined });

      // Act
      const shutdownHandlers = handlers.get("session_shutdown");
      for (const handler of shutdownHandlers!) {
        await handler({ reason: "reload" }, {} as any);
      }

      // Assert
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Guard: save skipped when sessionId is undefined
  // -----------------------------------------------------------------------

  describe("guard — sessionId undefined", () => {
    it("input handler does not save when sessionId is undefined", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      setState({
        isActive: true,
        sessionId: undefined,
        isAdHocInput: false,
      });

      // Act
      const handlersList = handlers.get("input");
      for (const handler of handlersList!) {
        await handler({ source: "interactive" });
      }

      // Assert: state updated but save not called
      expect(getState().isAdHocInput).toBe(true);
      expect(statePersistence.saveLoopEngineState).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Session variable integration
// ---------------------------------------------------------------------------

describe("session variable integration", () => {
  // Build placeholder strings programmatically to avoid linter warnings
  const placeholderEnv = "$" + "{env}";
  const placeholderTarget = "$" + "{target}";

  // -----------------------------------------------------------------------
  // initializeStore helper
  // -----------------------------------------------------------------------

  describe("initializeStore", () => {
    it("creates store with session params as read-only layer", async () => {
      const { initializeStore } = await import("./loop-engine");
      const store = initializeStore({ foo: "bar", count: 42 });

      expect(store.get("foo")).toBe("bar");
      expect(store.get("count")).toBe(42);
      expect(store.getAll()).toEqual({ foo: "bar", count: 42 });
    });

    it("restores persisted vars on top of frozen params", async () => {
      const { initializeStore } = await import("./loop-engine");
      const store = initializeStore(
        { foo: "bar" },
        { myVar: { value: "hello", type: "string" } },
      );

      expect(store.get("foo")).toBe("bar");
      expect(store.get("myVar")).toBe("hello");
      expect(store.isDefined("myVar")).toBe(true);
    });

    it("calls declare before set for persisted vars (type enforcement preserved)", async () => {
      const { initializeStore } = await import("./loop-engine");
      const store = initializeStore({}, { x: { value: 10, type: "number" } });

      // Verify the var was declared and set
      expect(store.get("x")).toBe(10);
      expect(store.isDefined("x")).toBe(true);

      // Type enforcement should work — setting with wrong type should throw
      expect(() => store.set("x", "string", "wrong")).toThrow("Type mismatch");
    });

    it("handles missing persisted vars gracefully", async () => {
      const { initializeStore } = await import("./loop-engine");
      const store = initializeStore({ a: 1 });

      expect(store.get("a")).toBe(1);
      expect(store.getAll()).toEqual({ a: 1 });
    });
  });

  // -----------------------------------------------------------------------
  // preparePhaseVariables helper
  // -----------------------------------------------------------------------

  describe("preparePhaseVariables", () => {
    it("sets static vars for variable-definition phases", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
        ],
      };

      preparePhaseVariables(phase, store);
      expect(store.get("env")).toBe("prod");
      expect(store.isDefined("env")).toBe(true);
    });

    it("runs computed callbacks after static vars", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const computeSpy = vi.fn((state: any) => state.filesWritten.length);

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: [],
        filesWritten: ["/a.ts", "/b.ts"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
          {
            name: "fileCount",
            type: "number",
            kind: "computed" as const,
            compute: computeSpy,
          },
        ],
      };

      preparePhaseVariables(phase, store);

      // Static var set first
      expect(store.get("env")).toBe("prod");
      // Computed callback ran and used filesWritten from previous phase
      expect(computeSpy).toHaveBeenCalledTimes(1);
      expect(store.get("fileCount")).toBe(2);
    });

    it("catches and logs errors from computed callbacks", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "bad",
            type: "string",
            kind: "computed" as const,
            compute: () => {
              throw new Error("boom");
            },
          },
        ],
      };

      preparePhaseVariables(phase, store);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Computed variable 'bad' callback threw"),
      );
      // Var remains undefined
      expect(store.isDefined("bad")).toBe(false);
      warnSpy.mockRestore();
    });

    it("is a no-op for standard phases", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
      };

      preparePhaseVariables(phase, store);
      expect(store.get("env")).toBeUndefined();
    });

    it("is a no-op when variables array is empty", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [],
      };

      preparePhaseVariables(phase, store);
      expect(store.getAll()).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // buildStandardPhaseInstructions helper
  // -----------------------------------------------------------------------

  describe("buildStandardPhaseInstructions", () => {
    it("returns phase.instructions for standard phases", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
      };

      setState({ currentIteration: 1 });
      const result = buildStandardPhaseInstructions(getState(), phase);
      expect(result).toBe("Do A");
    });

    it("interpolates placeholders when store is available", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const placeholderEnv = "$" + "{env}";
      const store = new SessionVariableStore({ env: "prod" });
      const phase = {
        id: "p1",
        title: "P1",
        instructions: `Deploy to ${placeholderEnv}`,
        kind: "standard" as const,
      };

      setState({ currentIteration: 1 });
      const result = buildStandardPhaseInstructions(getState(), phase, store);
      expect(result).toBe("Deploy to prod");
    });

    it("passes unresolved placeholders through when store is not available", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");

      const placeholderEnv = "$" + "{env}";
      const phase = {
        id: "p1",
        title: "P1",
        instructions: `Deploy to ${placeholderEnv}`,
        kind: "standard" as const,
      };

      setState({ currentIteration: 1 });
      const result = buildStandardPhaseInstructions(getState(), phase);
      expect(result).toContain(placeholderEnv);
    });

    it("appends Retry focus on loop replay (iteration > 1) with loopMessage", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
        loopMessage: "Focus on edge cases",
      };

      setState({ currentIteration: 2 });
      const result = buildStandardPhaseInstructions(getState(), phase);
      expect(result).toContain("Do A");
      expect(result).toContain("**Retry focus:** Focus on edge cases");
    });

    it("does NOT append Retry focus on first iteration", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
        loopMessage: "Focus on edge cases",
      };

      setState({ currentIteration: 1 });
      const result = buildStandardPhaseInstructions(getState(), phase);
      expect(result).toBe("Do A");
      expect(result).not.toContain("Retry focus");
    });

    it("interpolates loopMessage when store is available", async () => {
      const { buildStandardPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const placeholderTarget = "$" + "{target}";
      const store = new SessionVariableStore({ target: "edge cases" });
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
        loopMessage: `Focus on ${placeholderTarget}`,
      };

      setState({ currentIteration: 2 });
      const result = buildStandardPhaseInstructions(getState(), phase, store);
      expect(result).toContain("**Retry focus:** Focus on edge cases");
    });
  });

  // -----------------------------------------------------------------------
  // buildVariablePhaseInstructions helper
  // -----------------------------------------------------------------------

  describe("buildVariablePhaseInstructions", () => {
    it("returns phase.instructions for standard phases", async () => {
      const { buildVariablePhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
      };

      const result = buildVariablePhaseInstructions(getState(), phase, store);
      expect(result).toBe("Do A");
    });

    it("shows only LLM-driven vars (static and computed are engine-managed)", async () => {
      const { buildVariablePhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      store.set("env", "string", "prod");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What feature to build?",
          },
          { name: "count", type: "number", kind: "computed" as const },
        ],
      };

      setState({ currentIteration: 1 });
      const result = buildVariablePhaseInstructions(getState(), phase, store);

      expect(result).toContain("This phase collects session variables");
      expect(result).toContain("### Variables");
      // Only LLM-driven vars are shown
      expect(result).toContain("**feature**");
      expect(result).toContain("What feature to build?");
      // Static and computed sections are omitted (engine-managed, not actionable)
      expect(result).not.toContain("Static");
      expect(result).not.toContain("Computed");
      expect(result).not.toContain("auto-computed");
    });

    it("omits variable section when no LLM-driven vars present", async () => {
      const { buildVariablePhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      store.set("env", "string", "prod");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
        ],
      };

      setState({ currentIteration: 1 });
      const result = buildVariablePhaseInstructions(getState(), phase, store);

      // Only header is shown — no variable sections (static vars are engine-managed)
      expect(result).toContain("This phase collects session variables");
      expect(result).not.toContain("### Variables");
      expect(result).not.toContain("#### Static");
      expect(result).not.toContain("#### LLM-driven");
      expect(result).not.toContain("#### Computed");
    });

    it("lists undefined variables on loop replay (iteration > 1)", async () => {
      const { buildVariablePhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      store.set("env", "string", "prod");
      // feature is NOT set

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What?",
          },
        ],
      };

      setState({ currentIteration: 2 });
      const result = buildVariablePhaseInstructions(getState(), phase, store);

      expect(result).toContain(
        "### Undefined Variables (from previous iteration)",
      );
      expect(result).toContain("| feature | string |");
      expect(result).not.toContain("| env | string |\n"); // env is defined, not listed
    });

    it("does not list undefined variables on first iteration", async () => {
      const { buildVariablePhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What?",
          },
        ],
      };

      setState({ currentIteration: 1 });
      const result = buildVariablePhaseInstructions(getState(), phase, store);

      expect(result).not.toContain("Undefined Variables");
    });
  });

  // -----------------------------------------------------------------------
  // resources_discover — store creation
  // -----------------------------------------------------------------------

  describe("resources_discover — store creation", () => {
    it("creates SessionVariableStore with session params", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      vi.mocked(capabilityUtils.getSessionConfig).mockResolvedValue({
        capability: "create-goal",
        workspaceDir: "/test/.pio/goals/test",
        sessionParams: { foo: "bar" },
        sessionName: "test-create-goal",
        allowProjectWrites: false,
        contract: { inputs: [], outputs: [{ name: "goal", file: "GOAL.md" }] },
      });
      setupLoopEngine(pi);

      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      const state = getState();
      expect(state.store).toBeDefined();
      expect(state.store!.get("foo")).toBe("bar");
    });

    it("restores persisted vars from saved state", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { myVar: { value: "hello", type: "string" } },
      });
      setupLoopEngine(pi);

      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      const state = getState();
      expect(state.store).toBeDefined();
      expect(state.store!.get("myVar")).toBe("hello");
      expect(state.store!.isDefined("myVar")).toBe(true);

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });

    it("persisted vars have type enforcement restored", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { x: { value: 10, type: "number" } },
      });
      setupLoopEngine(pi);

      const discoverHandlers = handlers.get("resources_discover");
      for (const h of discoverHandlers!) {
        await h(
          { type: "resources_discover", cwd: ".", reason: "startup" },
          mockCtx,
        );
      }

      const state = getState();
      expect(state.store!.get("x")).toBe(10);
      // Type enforcement should be active
      expect(() => state.store!.set("x", "string", "wrong")).toThrow(
        "Type mismatch",
      );

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });
  });

  // -----------------------------------------------------------------------
  // buildPhaseInstructions — interpolation
  // -----------------------------------------------------------------------

  describe("buildPhaseInstructions — interpolation", () => {
    it("interpolates placeholders in phase.instructions when store is available", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({ env: "prod" });
      setState({
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: `Deploy to ${placeholderEnv}`,
          },
        ],
        store,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain("Deploy to prod");
      expect(result).not.toContain(placeholderEnv);
    });

    it("passes unresolved placeholders through unchanged", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      setState({
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: `Deploy to ${placeholderEnv}`,
          },
        ],
        store,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain(placeholderEnv);
    });

    it("interpolates loopMessage when store is available", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({ target: "edge cases" });
      setState({
        currentIteration: 2,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "Do A",
            loopMessage: `Focus on ${placeholderTarget}`,
          },
        ],
        store,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain("**Retry focus:** Focus on edge cases");
    });

    it("uses raw instructions when store is not available", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      setState({
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: `Deploy to ${placeholderEnv}`,
          },
        ],
        store: undefined,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain(placeholderEnv);
    });

    it("produces custom variable template for variable-definition phases", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      store.set("env", "string", "prod");
      setState({
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "Do A",
            kind: "variable-definition" as const,
            variables: [
              {
                name: "env",
                type: "string",
                kind: "static" as const,
                value: "prod",
              },
              {
                name: "feature",
                type: "string",
                kind: "llm" as const,
                description: "What feature?",
              },
            ],
          },
        ],
        store,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain("This phase collects session variables");
      // Only LLM-driven vars are shown (static/computed are engine-managed)
      expect(result).toContain("### Variables");
      expect(result).toContain("**feature**");
      expect(result).not.toContain("Static");
      expect(result).not.toContain("Computed");
      expect(result).not.toContain("Do A"); // freeform instructions replaced
    });

    it("falls back to standard instructions when variable-defining phase has no variables array", async () => {
      const { buildPhaseInstructions } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      setState({
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [
          {
            id: "p1",
            title: "P1",
            instructions: "Do A",
            kind: "variable-definition" as const,
            // No variables array
          },
        ],
        store,
      });

      const result = buildPhaseInstructions(getState());
      expect(result).toContain("Do A");
      expect(result).not.toContain("This phase collects session variables");
    });
  });

  // -----------------------------------------------------------------------
  // before_agent_start — variable setup for Phase 1 variable-defining entry
  // -----------------------------------------------------------------------

  describe("before_agent_start — variable setup", () => {
    async function fireBeforeAgentStart(
      handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    ) {
      const handlersList = handlers.get("before_agent_start");
      expect(handlersList).toBeDefined();
      const mockCtx = {} as any;
      const results: unknown[] = [];
      for (const handler of handlersList!) {
        const result = await handler({ type: "before_agent_start" }, mockCtx);
        if (result) results.push(result);
      }
      return results;
    }

    it("sets static vars for variable-defining Phase 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
          ],
        },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      await fireBeforeAgentStart(handlers);

      expect(store.get("env")).toBe("prod");
    });

    it("runs computed callbacks for variable-defining Phase 1 (empty state)", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const computeSpy = vi.fn((state: any) => state.filesWritten.length);
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "count",
              type: "number",
              kind: "computed" as const,
              compute: computeSpy,
            },
          ],
        },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        isAdHocInput: false,
        filesWritten: [], // empty — Phase 1 has no previous data
        askUserCalled: false,
        store,
      });

      await fireBeforeAgentStart(handlers);

      expect(computeSpy).toHaveBeenCalledTimes(1);
      expect(store.get("count")).toBe(0); // empty filesWritten
    });

    it("does not run variable setup for standard Phase 1", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
        },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        isAdHocInput: false,
        filesWritten: [],
        askUserCalled: false,
        store,
      });

      await fireBeforeAgentStart(handlers);

      // No variable setup should have occurred
      expect(store.getAll()).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — variable setup at phase advancement
  // -----------------------------------------------------------------------

  describe("agent_end — variable setup at phase advancement", () => {
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

    it("prepares static vars for next variable-defining phase during advancement", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        { id: "p1", title: "P1", instructions: "Do A" },
        {
          id: "p2",
          title: "P2",
          instructions: "Do B",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "staging",
            },
          ],
        },
        { id: "p3", title: "P3", instructions: "Do C" },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 3,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      // advancePhase skips purely programmatic phase 2, stops at phase 3
      // Static var for phase 2 should still be set (executePhase ran)
      expect(store.get("env")).toBe("staging");
      // Message sent for phase 3 (the turn-triggering phase)
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.content).toContain(`"p3"`);
    });

    it("runs computed callbacks using previous phase's data during advancement", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const computeSpy = vi.fn((state: any) => state.filesWritten.length);
      const phases = [
        { id: "p1", title: "P1", instructions: "Do A" },
        {
          id: "p2",
          title: "P2",
          instructions: "Do B",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "fileCount",
              type: "number",
              kind: "computed" as const,
              compute: computeSpy,
            },
          ],
        },
        { id: "p3", title: "P3", instructions: "Do C" },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 3,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/a.ts", "/b.ts", "/c.ts"], // Phase 1 wrote 3 files
        askUserCalled: true,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      // advancePhase skips programmatic phase 2, stops at phase 3
      // Computed callback should have seen Phase 1's data (before tracking reset)
      expect(computeSpy).toHaveBeenCalledTimes(1);
      expect(store.get("fileCount")).toBe(3);
      // Tracking fields should be reset after computed callbacks (by setupTurn)
      expect(getState().filesWritten).toEqual([]);
      expect(getState().askUserCalled).toBe(false);
      expect(sendMessageCalls).toHaveLength(1);
      expect(sendMessageCalls[0].message.content).toContain(`"p3"`);
    });

    it("does not prepare vars when next phase is standard", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        { id: "p1", title: "P1", instructions: "Do A" },
        { id: "p2", title: "P2", instructions: "Do B" },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/a.ts"],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      // No vars should have been set
      expect(store.getAll()).toEqual({});
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("does not prepare vars on loop replay (only at phase advancement)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 2,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
          ],
        },
      ];
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1, // < minIterations
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      // Should loop (not advance)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // setupSessionVariables registration
  // -----------------------------------------------------------------------

  describe("setupSessionVariables registration", () => {
    it("setupLoopEngine calls setupSessionVariables (tools registered)", async () => {
      const registeredTools: string[] = [];
      const pi = {
        on: vi.fn(),
        registerTool: vi.fn((tool: any) => {
          registeredTools.push(tool.name);
        }),
        registerCommand: vi.fn(),
        registerShortcut: vi.fn(),
        registerFlag: vi.fn(),
        getFlag: vi.fn(),
        registerMessageRenderer: vi.fn(),
        sendMessage: vi.fn(),
        sendUserMessage: vi.fn(),
        appendEntry: vi.fn(),
        setSessionName: vi.fn(),
        getSessionName: vi.fn(),
        setLabel: vi.fn(),
        exec: vi.fn(),
        getActiveTools: vi.fn(),
        getAllTools: vi.fn(),
        setActiveTools: vi.fn(),
        getCommands: vi.fn(),
        setModel: vi.fn(),
        getThinkingLevel: vi.fn(),
        setThinkingLevel: vi.fn(),
        registerProvider: vi.fn(),
        unregisterProvider: vi.fn(),
        events: { emit: vi.fn() },
      } as any;

      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      expect(registeredTools).toContain("setVar");
      expect(registeredTools).toContain("getVar");
      expect(registeredTools).toContain("listVars");
    });
  });

  // -----------------------------------------------------------------------
  // declarePhaseVariables helper
  // -----------------------------------------------------------------------

  describe("declarePhaseVariables", () => {
    it("pre-declares LLM and computed variables", async () => {
      const { declarePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What feature?",
          },
          {
            name: "count",
            type: "number",
            kind: "computed" as const,
          },
        ],
      };

      declarePhaseVariables(phase, store);

      // LLM and computed vars should be declared (type enforcement active)
      // Setting with wrong type should throw
      expect(() => store.set("feature", "number", 42)).toThrow("Type mismatch");
      expect(() => store.set("count", "string", "wrong")).toThrow(
        "Type mismatch",
      );
      // Setting with correct type should work
      store.set("feature", "string", "auth");
      store.set("count", "number", 5);
      expect(store.get("feature")).toBe("auth");
      expect(store.get("count")).toBe(5);
      // Static var is NOT pre-declared
      expect(() => store.set("env", "number", 99)).not.toThrow();
    });

    it("is idempotent — same name+type does not throw on repeat", async () => {
      const { declarePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What?",
          },
        ],
      };

      // Call twice — should not throw
      declarePhaseVariables(phase, store);
      declarePhaseVariables(phase, store);

      // Var should still be settable with correct type
      store.set("feature", "string", "auth");
      expect(store.get("feature")).toBe("auth");
    });

    it("catches type mismatch errors silently", async () => {
      const { declarePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      // Pre-declare with a different type to simulate mismatch
      store.declare("feature", "number");

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "feature",
            type: "string", // Different from pre-existing declaration
            kind: "llm" as const,
            description: "What?",
          },
        ],
      };

      // Should not throw — errors caught silently
      expect(() => declarePhaseVariables(phase, store)).not.toThrow();
      // Original declaration should still be in place
      expect(() => store.set("feature", "string", "x")).toThrow(
        "Type mismatch",
      );
    });

    it("is a no-op for standard phases", async () => {
      const { declarePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "standard" as const,
      };

      declarePhaseVariables(phase, store);
      // Nothing should have been declared
      expect(() => store.set("x", "string", "y")).not.toThrow();
    });

    it("is a no-op when variables array is empty", async () => {
      const { declarePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [],
      };

      declarePhaseVariables(phase, store);
      expect(() => store.set("x", "string", "y")).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // preparePhaseVariables — pre-declaration integration
  // -----------------------------------------------------------------------

  describe("preparePhaseVariables — pre-declaration", () => {
    it("LLM vars are pre-declared before static vars are set", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "env",
            type: "string",
            kind: "static" as const,
            value: "prod",
          },
          {
            name: "feature",
            type: "string",
            kind: "llm" as const,
            description: "What?",
          },
        ],
      };

      preparePhaseVariables(phase, store);

      // Static var should be set
      expect(store.get("env")).toBe("prod");
      // LLM var should be declared (type enforcement active)
      expect(() => store.set("feature", "number", 42)).toThrow("Type mismatch");
    });

    it("computed callback result validates against pre-declared type", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "count",
            type: "number",
            kind: "computed" as const,
            compute: () => 42,
          },
        ],
      };

      preparePhaseVariables(phase, store);

      // Computed var should be set with correct type
      expect(store.get("count")).toBe(42);
      // Type enforcement should be active
      expect(() => store.set("count", "string", "wrong")).toThrow(
        "Type mismatch",
      );
    });

    it("computed callback error is caught by preparePhaseVariables", async () => {
      const { preparePhaseVariables } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const phase = {
        id: "p1",
        title: "P1",
        instructions: "Do A",
        kind: "variable-definition" as const,
        variables: [
          {
            name: "count",
            type: "number",
            kind: "computed" as const,
            compute: () => {
              throw new Error("boom");
            },
          },
        ],
      };

      preparePhaseVariables(phase, store);

      // Error should be caught and logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Computed variable 'count' callback threw"),
      );
      // Var should remain undefined
      expect(store.isDefined("count")).toBe(false);
      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — loopWhile evaluation
  // -----------------------------------------------------------------------

  describe("agent_end — loopWhile evaluation", () => {
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

    it("loops when loopWhile callback returns true (OR logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopWhile: [
            {
              type: "callback" as const,
              callback: (state: any) => state.filesWritten.length === 0,
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true, // Would advance if not for loopWhile
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [], // loopWhile condition is true
        askUserCalled: false,
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // loopWhile true → loop replay (before terminateWhen is even evaluated)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("does not loop when loopWhile callback returns false", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopWhile: [
            {
              type: "callback" as const,
              callback: (state: any) => state.filesWritten.length === 0,
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true,
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: ["/a.ts"], // loopWhile condition is false
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // loopWhile false → proceed to terminateWhen (which is true) → advance
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("loops when any loopWhile callback returns true (OR logic — first true wins)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopWhile: [
            {
              type: "callback" as const,
              callback: () => false, // First returns false
            },
            {
              type: "callback" as const,
              callback: (state: any) => state.askUserCalled, // Second returns true
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: true, // Second loopWhile returns true
        isAdHocInput: false,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // OR logic: second callback true → loop
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("treats loopWhile callback error as not passing (don't loop for that condition)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopWhile: [
            {
              type: "callback" as const,
              callback: () => {
                throw new Error("boom");
              },
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true,
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Error treated as not passing → proceed to terminateWhen → advance
      expect(sendMessageCalls).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — auto var completeness as loopWhile
  // -----------------------------------------------------------------------

  describe("agent_end — auto var completeness as loopWhile", () => {
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

    it("loops back when LLM-driven vars are not yet defined", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What feature?",
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true, // Would advance if not for var completeness
            },
          ],
        },
        { id: "p2", title: "P2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (simulates before_agent_start)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);
      // env (static) is set, feature (llm) is declared but not set

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Var completeness check: feature is not defined → loop back
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("passes through when all variables are defined", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What feature?",
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true,
            },
          ],
        },
        { id: "p2", title: "P2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars then set the LLM var
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);
      store.set("feature", "string", "auth");

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // All vars defined → proceed to terminateWhen → advance
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("minIterations gates var completeness (hard floor before conditions)", async () => {
      // Corrected behavior: minIterations is a hard floor — on iteration 1
      // with minIterations: 5, the engine loops back immediately WITHOUT
      // evaluating var completeness or other conditions.
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 5, // High min — gates all conditions
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1, // Below minIterations
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (feature declared but not set)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // minIterations gates first → loop back (var completeness NOT evaluated)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("var completeness is evaluated after minIterations is reached", async () => {
      // After minIterations floor is satisfied, var completeness is evaluated
      // as part of the unified loopWhile callback pass.
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1, // Met on iteration 1
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1, // >= minIterations (1)
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (feature declared but not set)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // minIterations met → var completeness evaluated → feature missing → loop
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("empty loopWhile array still triggers var completeness for variable-defining phases", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1,
          loopWhile: [], // Empty — no user-defined conditions
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (feature declared but not set)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Var completeness still triggers loop
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — max iteration failure with missing vars warning
  // -----------------------------------------------------------------------

  describe("agent_end — max iteration with missing vars warning", () => {
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

    it("emits console.warn listing missing vars when max iterations reached", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          maxIterations: 2,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 2, // >= maxIterations
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (env set, feature not)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Should warn about missing vars
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Max iterations reached"),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Undefined variables"),
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("feature"));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("string"));
      // No follow-up sent (hard stop)
      expect(sendMessageCalls).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("does not emit var warning when all vars are defined at max iterations", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          maxIterations: 2,
          variables: [
            {
              name: "env",
              type: "string",
              kind: "static" as const,
              value: "prod",
            },
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 2, // >= maxIterations
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars and set all
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);
      store.set("feature", "string", "auth");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // No warning about missing vars (all defined)
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Undefined variables"),
      );
      expect(sendMessageCalls).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("does not emit var warning for standard phases at max iterations", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          maxIterations: 2,
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 2, // >= maxIterations
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // No var warning for standard phase
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Undefined variables"),
      );
      expect(sendMessageCalls).toHaveLength(0);
      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — combined loopWhile + terminateWhen interaction
  // -----------------------------------------------------------------------

  describe("agent_end — loopWhile + terminateWhen interaction", () => {
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

    it("loopWhile takes precedence over terminateWhen (loopWhile true + terminateWhen true → loop)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          loopWhile: [
            {
              type: "callback" as const,
              callback: () => true, // Always loop
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true, // Would advance
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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

      // loopWhile evaluated first → true → loop (terminateWhen not evaluated)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("evaluation order: max iterations → minIterations → loopWhile → terminateWhen → advance", async () => {
      // This test verifies the correct evaluation order:
      // 1. max iterations (hard stop)
      // 2. minIterations (hard floor before conditions)
      // 3. loopWhile (unified callbacks, OR)
      // 4. terminateWhen (AND)
      // 5. advance
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          loopWhile: [
            {
              type: "callback" as const,
              callback: () => false, // Don't loop
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true, // Advance
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // max not hit → minIterations met → loopWhile false → terminateWhen true → advance
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("minIterations floor triggers replay before loopWhile and terminateWhen", async () => {
      // On iteration 1 with minIterations: 5, the engine loops back
      // immediately WITHOUT evaluating loopWhile or terminateWhen.
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const loopWhileCalled = vi.fn(() => false);
      const terminateWhenCalled = vi.fn(() => true);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 5,
          loopWhile: [
            {
              type: "callback" as const,
              callback: loopWhileCalled,
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: terminateWhenCalled,
            },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1, // Below minIterations (5)
        totalPhases: 2,
        phasesList: phases,
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

      // minIterations gates first → loop back
      // Conditions should NOT have been called
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(loopWhileCalled).not.toHaveBeenCalled();
      expect(terminateWhenCalled).not.toHaveBeenCalled();
    });

    it("unified loopWhile: user-defined callback integrates with auto var completeness", async () => {
      // User-defined loopWhile callbacks are evaluated in the same pass as
      // auto var completeness — first true wins (OR semantics).
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const userCallbackCalled = vi.fn(() => false);

      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1,
          loopWhile: [
            {
              type: "callback" as const,
              callback: userCallbackCalled,
            },
          ],
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
        },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars (feature declared but not set)
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Auto var completeness (first in unified list) triggers loop
      // User callback should NOT be called (short-circuited by var completeness)
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(userCallbackCalled).not.toHaveBeenCalled();
    });

    it("unified loopWhile: user callback triggers loop when all vars defined", async () => {
      // When auto var completeness passes (all vars defined),
      // user-defined callbacks are still evaluated.
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      const { SessionVariableStore } = await import("./session-store");

      const store = new SessionVariableStore({});
      const userCallbackCalled = vi.fn(() => true); // Force loop

      const phases = [
        {
          id: "p1",
          title: "P1",
          instructions: "Do A",
          kind: "variable-definition" as const,
          minIterations: 1,
          loopWhile: [
            {
              type: "callback" as const,
              callback: userCallbackCalled,
            },
          ],
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What?",
            },
          ],
          terminateWhen: [
            {
              type: "callback" as const,
              callback: () => true, // Would advance if not for loopWhile
            },
          ],
        },
        { id: "p2", title: "P2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setupLoopEngine(pi);
      setState({
        isActive: true,
        sessionId: "test-session-id",
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      // Prepare vars and set all
      const { preparePhaseVariables } = await import("./loop-engine");
      preparePhaseVariables(phases[0], store);
      store.set("feature", "string", "auth");

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Auto var completeness passes → user callback evaluated → returns true → loop
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
      expect(userCallbackCalled).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // agent_end — terminateWhen AND logic (additional tests)
  // -----------------------------------------------------------------------

  describe("agent_end — terminateWhen AND logic", () => {
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

    it("loops when terminateWhen callback throws (fail-safe: treat as not met)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
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
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
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

      // Callback threw → fail-safe: loop
      expect(getState().currentIteration).toBe(2);
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("advances when terminateWhen is undefined after minIterations reached (AND logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 2,
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 2, // >= minIterations
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // No terminateWhen + minIterations met → advance
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("advances when terminateWhen is empty array after minIterations reached (AND logic)", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      const phases = [
        {
          id: "s1",
          title: "S1",
          instructions: "Do A",
          minIterations: 1,
          terminateWhen: [],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];

      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        phases,
      );

      const store = initializeStore({});
      setState({
        isActive: true,
        currentIteration: 1,
        totalPhases: 2,
        phasesList: phases,
        markCompleteCalled: false,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        store,
      });

      await fireAgentEnd(handlers, [
        {
          role: "assistant",
          stopReason: "stop",
        },
      ]);

      // Empty terminateWhen + minIterations met → advance
      expect(sendMessageCalls).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase advancement helpers
// ---------------------------------------------------------------------------

describe("isProgrammatic", () => {
  async function getIsProgrammatic() {
    const mod = await import("./loop-engine");
    return mod.isProgrammatic;
  }

  it("returns false for a standard phase", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = { id: "s1", title: "S1", instructions: "Do A" };
    expect(isProgrammatic(phase)).toBe(false);
  });

  it("returns true for branch:if phase", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = { id: "b1", title: "Branch", kind: "branch:if" as const };
    expect(isProgrammatic(phase)).toBe(true);
  });

  it("returns true for branch:switch phase", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "b1",
      title: "Switch",
      kind: "branch:switch" as const,
      on: () => "a",
      cases: {
        a: [{ id: "c1", title: "Case A", instructions: "X" }],
      },
    };
    expect(isProgrammatic(phase)).toBe(true);
  });

  it("returns true for kind: 'code' phase (programmatic — no LLM turn)", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "c1",
      title: "Code",
      kind: "code" as const,
      run: vi.fn(),
    };
    expect(isProgrammatic(phase)).toBe(true);
  });

  it("returns true for variable-definition phase with only static/computed variables", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "p1",
      title: "P1",
      kind: "variable-definition" as const,
      variables: [
        { name: "x", type: "string", kind: "static" as const, value: "hi" },
        {
          name: "y",
          type: "number",
          kind: "computed" as const,
          compute: () => 1,
        },
      ],
    };
    expect(isProgrammatic(phase)).toBe(true);
  });

  it("returns false for variable-definition phase with at least one llm variable", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "p1",
      title: "P1",
      kind: "variable-definition" as const,
      variables: [
        { name: "x", type: "string", kind: "static" as const, value: "hi" },
        {
          name: "feature",
          type: "string",
          kind: "llm" as const,
          description: "What feature?",
        },
      ],
    };
    expect(isProgrammatic(phase)).toBe(false);
  });

  it("returns false for variable-definition phase with empty/missing variables", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phaseEmpty = {
      id: "p1",
      title: "P1",
      kind: "variable-definition" as const,
      variables: [],
    };
    const phaseMissing = {
      id: "p1",
      title: "P1",
      kind: "variable-definition" as const,
    };
    expect(isProgrammatic(phaseEmpty)).toBe(false);
    expect(isProgrammatic(phaseMissing)).toBe(false);
  });

  it("returns true for a loop container (body content irrelevant)", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "L",
      title: "L",
      kind: "loop" as const,
      body: [{ id: "p1", title: "P1", instructions: "Do A" }],
    };
    expect(isProgrammatic(phase)).toBe(true);
  });

  it("returns true for a loop container even when the body contains an llm-driven phase", async () => {
    const isProgrammatic = await getIsProgrammatic();
    const phase = {
      id: "L",
      title: "L",
      kind: "loop" as const,
      body: [
        {
          id: "p1",
          title: "P1",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "feature",
              type: "string",
              kind: "llm" as const,
              description: "What feature?",
            },
          ],
        },
      ],
    };
    expect(isProgrammatic(phase)).toBe(true);
  });
});

describe("executePhase", () => {
  async function getExecutePhase() {
    const mod = await import("./loop-engine");
    return mod.executePhase;
  }

  it("for variable-definition phases: calls preparePhaseVariables() and persists state", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const phase = {
      id: "p1",
      title: "P1",
      kind: "variable-definition" as const,
      variables: [
        { name: "x", type: "string", kind: "static" as const, value: "hello" },
      ],
    };

    await executePhase(phase, store);

    // preparePhaseVariables sets static vars
    expect(store.get("x")).toBe("hello");
    // State should be persisted
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
  });

  it("for standard phases: preparePhaseVariables() is skipped; state is still persisted", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const phase = { id: "s1", title: "S1", instructions: "Do A" };

    await executePhase(phase, store);

    // No variables set (standard phase — kind guard returns early)
    expect(store.get("x")).toBeUndefined();
    // But state should still be persisted
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
  });

  it("persists state via saveLoopEngineState() in all cases", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const phase = { id: "s1", title: "S1", instructions: "Do A" };
    await executePhase(phase, store);

    expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
      "test-session",
      expect.any(Object),
    );
  });

  it("for kind: 'code' phases: runs phase.run() once with the live state reference and appends a success log entry", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const run = vi.fn(
      (ctx: { state: import("./session-state").PioSessionState }) => {
        // Mutate through ctx.state.store — visible afterwards with no new plumbing
        ctx.state.store?.declare("flag", "string");
        ctx.state.store?.set("flag", "string", "yes");
      },
    );

    const phase = {
      id: "c1",
      title: "Code",
      kind: "code" as const,
      run,
    };

    await executePhase(phase, store);

    // run called exactly once, with the LIVE state reference (no copies)
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].state).toBe(getState());
    // Mutation through ctx.state.store is visible afterwards
    expect(store.get("flag")).toBe("yes");
    // Exactly one log entry per executed code phase — detail: [] on success
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c1", kind: "code", detail: [] },
    ]);
    // Single trailing persist (log itself is in-memory only)
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
  });

  it("for kind: 'code' phases: a throwing run() is caught, warned with the phase id, and logged with the error message", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const run = vi.fn(() => {
      throw new Error("boom");
    });

    const phase = {
      id: "c-throws",
      title: "Code",
      kind: "code" as const,
      run,
    };

    // Never rejects — warn-and-continue
    await expect(executePhase(phase, store)).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledTimes(1);
    // Warning mentions the phase id
    const warnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((w) => w.includes("c-throws"));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("boom");
    // Log entry carries the error message
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c-throws", kind: "code", detail: ["boom"] },
    ]);
    warnSpy.mockRestore();
  });

  it("for kind: 'code' phases: a non-Error throw is coerced to its string form in the log detail", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const run = vi.fn(() => {
      throw "string-failure";
    });

    const phase = {
      id: "c-str",
      title: "Code",
      kind: "code" as const,
      run,
    };

    await expect(executePhase(phase, store)).resolves.toBeUndefined();

    expect(getState().programmaticLog).toEqual([
      { phaseId: "c-str", kind: "code", detail: ["string-failure"] },
    ]);
    warnSpy.mockRestore();
  });

  it("for synthetic code phases: run() executes with the live state reference but appends nothing to programmaticLog", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const run = vi.fn();
    const phase = {
      id: "__loop-end-x",
      title: "__loop-end-x",
      kind: "code" as const,
      run,
      synthetic: true,
    };

    await executePhase(phase, store);

    // run called exactly once, with the LIVE state reference (no copies)
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].state).toBe(getState());
    // Synthetic merge node appends nothing — no prompt noise
    expect(getState().programmaticLog).toEqual([]);
    // Single trailing persist unchanged
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
  });

  it("for synthetic code phases: a throwing run() is caught, warned with the phase id, and still logs nothing", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const run = vi.fn(() => {
      throw new Error("boom");
    });

    const phase = {
      id: "__loop-end-x",
      title: "__loop-end-x",
      kind: "code" as const,
      run,
      synthetic: true,
    };

    // Never rejects — warn-and-continue
    await expect(executePhase(phase, store)).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledTimes(1);
    const warnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((w) => w.includes("__loop-end-x"));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("boom");
    // Still no log entry — synthetic suppression is unconditional
    expect(getState().programmaticLog).toEqual([]);
    warnSpy.mockRestore();
  });

  it("for non-synthetic vs synthetic code phases: only the real phase logs an entry", async () => {
    const executePhase = await getExecutePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const realPhase = {
      id: "c1",
      title: "Code",
      kind: "code" as const,
      run: vi.fn(),
    };
    const synthPhase = {
      id: "__loop-end-x",
      title: "__loop-end-x",
      kind: "code" as const,
      run: vi.fn(),
      synthetic: true,
    };

    await executePhase(realPhase, store);
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c1", kind: "code", detail: [] },
    ]);

    await executePhase(synthPhase, store);
    // Log unchanged in length — the synthetic phase added no entry
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c1", kind: "code", detail: [] },
    ]);
    expect(
      getState().programmaticLog.some((e) => e.phaseId === "__loop-end-x"),
    ).toBe(false);
  });
});

describe("setupTurn", () => {
  async function getSetupTurn() {
    const mod = await import("./loop-engine");
    return mod.setupTurn;
  }

  // ---- Mode "reset" ----

  describe('mode "reset"', () => {
    it("sets currentIteration to 1 regardless of previous value", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 5,
        totalPhases: 3,
        phasesList: [
          { id: "s1", title: "S1", instructions: "A" },
          { id: "s2", title: "S2", instructions: "B" },
          { id: "s3", title: "S3", instructions: "C" },
        ],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      setupTurn("reset");

      expect(getState().currentIteration).toBe(1);
    });

    it("resets filesWritten to [] and askUserCalled to false", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: ["/tmp/x"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      setupTurn("reset");

      expect(getState().filesWritten).toEqual([]);
      expect(getState().askUserCalled).toBe(false);
    });

    it("persists state via saveLoopEngineState", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      setupTurn("reset");

      expect(statePersistence.saveLoopEngineState).toHaveBeenCalledWith(
        "test-session",
        expect.any(Object),
      );
    });

    it("returns payload with correct customType, non-empty content, and display from readDebugDisplay", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const result = setupTurn("reset");

      expect(result.customType).toBe("workflow-phase-instructions");
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content).toContain("Do A");
      // readDebugDisplay mock returns false by default
      expect(result.display).toBe(false);
    });
  });

  // ---- Mode "increment" ----

  describe('mode "increment"', () => {
    it("increments currentIteration by 1", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 3,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      setupTurn("increment");

      expect(getState().currentIteration).toBe(4);
    });

    it("resets filesWritten and askUserCalled", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 2,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: ["/tmp/y"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      setupTurn("increment");

      expect(getState().filesWritten).toEqual([]);
      expect(getState().askUserCalled).toBe(false);
    });

    it("persists state", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 2,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      setupTurn("increment");

      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
    });

    it("returns correct payload structure", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 2,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const result = setupTurn("increment");

      expect(result.customType).toBe("workflow-phase-instructions");
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  // ---- Mode "preserve" ----

  describe('mode "preserve"', () => {
    it("leaves currentIteration unchanged", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 7,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      setupTurn("preserve");

      expect(getState().currentIteration).toBe(7);
    });

    it("resets filesWritten and askUserCalled", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: ["/tmp/z"],
        askUserCalled: true,
        isAdHocInput: false,
      });

      setupTurn("preserve");

      expect(getState().filesWritten).toEqual([]);
      expect(getState().askUserCalled).toBe(false);
    });

    it("persists state", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      setupTurn("preserve");

      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
    });

    it("returns correct payload structure", async () => {
      const setupTurn = await getSetupTurn();

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 1,
        totalPhases: 1,
        phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
      });

      const result = setupTurn("preserve");

      expect(result.customType).toBe("workflow-phase-instructions");
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  // ---- Negative: does NOT call preparePhaseVariables() ----

  it("does NOT call preparePhaseVariables() — static vars from variable-def phase are NOT set", async () => {
    const setupTurn = await getSetupTurn();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    // Set up a variable-def phase with static vars in phasesList
    // but setupTurn should NOT prepare them
    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [
        {
          id: "p1",
          title: "P1",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "z",
              type: "string",
              kind: "static" as const,
              value: "world",
            },
          ],
        },
      ],
      store: store,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
    });

    setupTurn("reset");

    // setupTurn should NOT have set the static var
    expect(store.get("z")).toBeUndefined();
  });
});

describe("advancePhase", () => {
  async function getAdvancePhase() {
    const mod = await import("./loop-engine");
    return mod.advancePhase;
  }

  it("skips multiple consecutive programmatic phases and stops at turn-triggering phase", async () => {
    const advancePhase = await getAdvancePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      {
        id: "p1",
        title: "P1",
        kind: "variable-definition" as const,
        variables: [
          { name: "a", type: "string", kind: "static" as const, value: "1" },
        ],
      },
      {
        id: "p2",
        title: "P2",
        kind: "variable-definition" as const,
        variables: [
          { name: "b", type: "string", kind: "static" as const, value: "2" },
        ],
      },
      { id: "s3", title: "S3", instructions: "Do C" },
    ];

    const pm = new PhaseManager(phases);
    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 3,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      phaseManager: pm,
      currentPhaseId: "p1",
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const result = await advancePhase(store, "p1", "reset");

    expect(result.triggered).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.customType).toBe("workflow-phase-instructions");
    expect(getState().currentPhaseId).toBe("s3");
    // Static vars from both programmatic phases should be set
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBe("2");
    // saveLoopEngineState: executePhase for p1, p2, s3 (3) + setupTurn for s3 (1) = 4
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(4);
  });

  it("stops at first non-programmatic phase and calls setupTurn() (returns triggered: true)", async () => {
    const advancePhase = await getAdvancePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [{ id: "s1", title: "S1", instructions: "Do A" }];
    const pm = new PhaseManager(phases);

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      phaseManager: pm,
      currentPhaseId: "s1",
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const result = await advancePhase(store, "s1", "reset");

    expect(result.triggered).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.customType).toBe("workflow-phase-instructions");
    expect(getState().currentPhaseId).toBe("s1");
    // Should have persisted (executePhase + setupTurn each persist)
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
  });

  it("returns { triggered: false } when all phases exhausted", async () => {
    const advancePhase = await getAdvancePhase();
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      {
        id: "p1",
        title: "P1",
        kind: "variable-definition" as const,
        variables: [
          { name: "a", type: "string", kind: "static" as const, value: "1" },
        ],
      },
    ];
    const pm = new PhaseManager(phases);

    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      phaseManager: pm,
      currentPhaseId: "p1",
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const result = await advancePhase(store, "p1", "reset");

    expect(result.triggered).toBe(false);
    expect(result.payload).toBeUndefined();
    // The programmatic phase should have been executed
    expect(store.get("a")).toBe("1");
  });

  // ---- Mode passthrough tests ----

  describe("mode passthrough", () => {
    it('mode "reset": stops at turn-triggering phase with currentIteration: 1', async () => {
      const advancePhase = await getAdvancePhase();
      const { SessionVariableStore } = await import("./session-store");
      const store = new SessionVariableStore({});

      const phases = [
        {
          id: "p1",
          title: "P1",
          kind: "variable-definition" as const,
          variables: [
            { name: "a", type: "string", kind: "static" as const, value: "1" },
          ],
        },
        { id: "s2", title: "S2", instructions: "Do B" },
      ];
      const pm = new PhaseManager(phases);

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 5,
        totalPhases: 2,
        phasesList: phases,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        phaseManager: pm,
        currentPhaseId: "p1",
      });

      const result = await advancePhase(store, "p1", "reset");

      expect(result.triggered).toBe(true);
      expect(getState().currentPhaseId).toBe("s2");
      expect(getState().currentIteration).toBe(1);
    });

    it('mode "increment": stops at turn-triggering phase with currentIteration incremented by 1', async () => {
      const advancePhase = await getAdvancePhase();
      const { SessionVariableStore } = await import("./session-store");
      const store = new SessionVariableStore({});

      const phases = [{ id: "s1", title: "S1", instructions: "Do A" }];
      const pm = new PhaseManager(phases);

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 2,
        totalPhases: 1,
        phasesList: phases,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        phaseManager: pm,
        currentPhaseId: "s1",
      });

      const result = await advancePhase(store, "s1", "increment");

      expect(result.triggered).toBe(true);
      expect(getState().currentPhaseId).toBe("s1");
      expect(getState().currentIteration).toBe(3);
    });

    it('mode "preserve": stops at turn-triggering phase with currentIteration unchanged', async () => {
      const advancePhase = await getAdvancePhase();
      const { SessionVariableStore } = await import("./session-store");
      const store = new SessionVariableStore({});

      const phases = [{ id: "s1", title: "S1", instructions: "Do A" }];
      const pm = new PhaseManager(phases);

      setState({
        isActive: true,
        sessionId: "test-session",
        currentIteration: 7,
        totalPhases: 1,
        phasesList: phases,
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        phaseManager: pm,
        currentPhaseId: "s1",
      });

      const result = await advancePhase(store, "s1", "preserve");

      expect(result.triggered).toBe(true);
      expect(getState().currentPhaseId).toBe("s1");
      expect(getState().currentIteration).toBe(7);
    });
  });
});

describe("code-step execution", () => {
  // ---- Traversal: code phase run() executes and stops at the LLM phase ----

  it("executes a code phase's run() exactly once during advancePhase traversal with the live state reference, then stops at the next LLM phase", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const contexts: unknown[] = [];
    const run = vi.fn(
      (ctx: { state: import("./session-state").PioSessionState }) => {
        contexts.push(ctx.state);
        ctx.state.store?.declare("code_flag", "string");
        ctx.state.store?.set("code_flag", "string", "from-code");
      },
    );

    const phases = [
      { id: "c1", title: "Code", kind: "code" as const, run },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c1",
    });

    const result = await advancePhase(store, "c1", "reset");

    expect(result.triggered).toBe(true);
    expect(getState().currentPhaseId).toBe("s2");
    // run called exactly once with the live state reference
    expect(run).toHaveBeenCalledTimes(1);
    expect(contexts[0]).toBe(getState());
    // Mutation through ctx.state.store is visible afterwards — no new plumbing
    expect(store.get("code_flag")).toBe("from-code");
  });

  it("a code step's variable writes persist via the existing store (extractPersistedState projection unchanged)", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      {
        id: "c1",
        title: "Code",
        kind: "code" as const,
        run: (ctx: { state: import("./session-state").PioSessionState }) => {
          ctx.state.store?.declare("persisted_var", "number");
          ctx.state.store?.set("persisted_var", "number", 42);
        },
      },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c1",
    });

    await advancePhase(store, "c1", "reset");

    // Value readable from the store after traversal (existing projection)
    expect(store.get("persisted_var")).toBe(42);
    // The persistence mock's extractPersistedState still projects only the
    // persisted fields — programmaticLog is NOT part of it.
    const savedArgs = vi
      .mocked(statePersistence.saveLoopEngineState)
      .mock.calls.map((c) => c[1])
      .filter(Boolean);
    expect(savedArgs.length).toBeGreaterThan(0);
    for (const saved of savedArgs) {
      expect(saved).not.toHaveProperty("programmaticLog");
    }
  });

  // ---- Throw surfacing: warn-and-continue + error line in the next turn's payload ----

  it("a throwing run() is caught: advancePhase resolves, warns with the phase id, stops at the LLM phase, and the payload renders the error line", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const phases = [
      {
        id: "c-throws",
        title: "Code",
        kind: "code" as const,
        run: () => {
          throw new Error("boom");
        },
      },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c-throws",
    });

    // Never rejects — resolves even though run() threw
    const result = await advancePhase(store, "c-throws", "reset");

    expect(result.triggered).toBe(true);
    expect(getState().currentPhaseId).toBe("s2");
    // Warning contains the phase id and the error text
    const warnings = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((w) => w.includes("c-throws"));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("boom");
    // The turn's payload (setupTurn -> buildPhaseInstructions) surfaces the error line
    const content = result.payload?.content ?? "";
    expect(content).toContain("## Programmatic activity since your last turn");
    expect(content).toContain("• c-throws (code): boom");
    // Log cleared as a single unit by the render — immediately afterwards
    expect(getState().programmaticLog).toEqual([]);
    warnSpy.mockRestore();
  });

  // ---- Non-throwing entry: success line without error text, log clears after render ----

  it("a non-throwing code step renders a success line (no error text) and the log clears after that render", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      { id: "c-ok", title: "Code", kind: "code" as const, run: () => {} },
      { id: "s2", title: "S2", instructions: "Do B" },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c-ok",
    });

    const result = await advancePhase(store, "c-ok", "reset");

    expect(result.triggered).toBe(true);
    const content = result.payload?.content ?? "";
    expect(content).toContain("## Programmatic activity since your last turn");
    // Success line: no trailing colon/message
    expect(content).toContain("• c-ok (code)");
    expect(content).not.toContain("• c-ok (code):");
    // Log cleared after the render that showed it
    expect(getState().programmaticLog).toEqual([]);
  });

  // ---- Log lifecycle: one entry per executed code phase, in execution order ----

  it("a chain of two code phases produces two entries in execution order, rendered together and cleared together", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const phases = [
      { id: "c-a", title: "A", kind: "code" as const, run: () => {} },
      {
        id: "c-b",
        title: "B",
        kind: "code" as const,
        run: () => {
          throw new Error("second-failure");
        },
      },
      { id: "s3", title: "S3", instructions: "Do C" },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 3,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c-a",
    });

    const result = await advancePhase(store, "c-a", "reset");

    expect(result.triggered).toBe(true);
    const content = result.payload?.content ?? "";
    // Both entries rendered in one section, in execution order
    expect(content).toContain("• c-a (code)");
    expect(content).toContain("• c-b (code): second-failure");
    const idxA = content.indexOf("• c-a (code)");
    const idxB = content.indexOf("• c-b (code): second-failure");
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
    // Cleared as a single unit — both entries gone at once
    expect(getState().programmaticLog).toEqual([]);
    warnSpy.mockRestore();
  });

  it("buildPhaseInstructions with an empty log returns the standard prompt byte-identical", async () => {
    const { buildPhaseInstructions } = await import("./loop-engine");
    setState({
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });

    const result = buildPhaseInstructions(getState());

    expect(result).toBe(
      '## Instructions for "s1"\n\n' +
        "Follow the instructions below. Do not do anything outside these instructions.\n\n" +
        'You are on "s1", iteration 1.\n\n---\n\n' +
        "Do A",
    );
  });

  it("buildPhaseInstructions with a non-empty log prepends the section above the existing prompt and clears the log", async () => {
    const { buildPhaseInstructions } = await import("./loop-engine");
    setState({
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [{ id: "s1", title: "S1", instructions: "Do A" }],
    });

    // Seed the log via a setState merge (never direct mutation)
    (await import("./session-state")).setState({
      programmaticLog: [
        { phaseId: "c-x", kind: "code", detail: ["first-err", "second-err"] },
      ],
    });

    const result = buildPhaseInstructions(getState());

    expect(result).toBe(
      "## Programmatic activity since your last turn\n\n" +
        "• c-x (code): first-err, second-err\n\n" +
        '## Instructions for "s1"\n\n' +
        "Follow the instructions below. Do not do anything outside these instructions.\n\n" +
        'You are on "s1", iteration 1.\n\n---\n\n' +
        "Do A",
    );
    // Cleared as a single unit via setState merge — fresh array reference
    expect(getState().programmaticLog).toEqual([]);
  });

  it("buildPhaseInstructions early return (no current phase) leaves the log untouched", async () => {
    const { buildPhaseInstructions } = await import("./loop-engine");
    setState({
      currentIteration: 1,
      totalPhases: 0,
      phasesList: [],
      currentPhaseId: "missing-phase",
    });
    (await import("./session-state")).setState({
      programmaticLog: [{ phaseId: "c-x", kind: "code", detail: [] }],
    });

    const result = buildPhaseInstructions(getState());

    expect(result).toBe("");
    // Early return does NOT clear the log (unreachable in live flows; resetState covers it)
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c-x", kind: "code", detail: [] },
    ]);
  });

  // ---- Recommended de-risk: code-set variable feeds a following branch:if condition ----

  it("a code step's async variable write is visible to a following branch:if within the same advancePhase call", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      {
        id: "c-set",
        title: "Set",
        kind: "code" as const,
        run: async (ctx: {
          state: import("./session-state").PioSessionState;
        }) => {
          // Async write — completes before the branch phase is visited
          await Promise.resolve();
          ctx.state.store?.declare("route", "string");
          ctx.state.store?.set("route", "string", "yes");
        },
      },
      {
        id: "b-if",
        title: "Branch",
        kind: "branch:if" as const,
        condition: (state: import("./session-state").PioSessionState) =>
          state.store?.get("route") === "yes",
        // biome-ignore lint/suspicious/noThenProperty: intentional test of WorkflowPhase.then field
        then: [{ id: "arm-then", title: "Then", instructions: "Take then" }],
        else: [{ id: "arm-else", title: "Else", instructions: "Take else" }],
      },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 2,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c-set",
    });

    const result = await advancePhase(store, "c-set", "reset");

    expect(result.triggered).toBe(true);
    // The sequential await made the code-set variable visible to branch evaluation
    expect(getState().currentPhaseId).toBe("arm-then");
  });

  it("a code phase as the final phase executes once and ends traversal without rendering (entry left pending)", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const run = vi.fn(
      (ctx: { state: import("./session-state").PioSessionState }) => {
        ctx.state.store?.declare("last_flag", "string");
        ctx.state.store?.set("last_flag", "string", "ran");
      },
    );

    // Single-phase workflow where the only (thus final) phase is a code phase —
    // the shape Step 5's synthesized __pio-exit terminal node takes.
    const phases = [
      { id: "c-last", title: "Code", kind: "code" as const, run },
    ];

    setState({
      isActive: true,
      sessionId: "code-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "c-last",
    });

    const result = await advancePhase(store, "c-last", "reset");

    // Traversal terminates — no LLM phase to stop at
    expect(result.triggered).toBe(false);
    expect(result.payload).toBeUndefined();
    // run() still executes exactly once with the live state reference
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].state).toBe(getState());
    expect(store.get("last_flag")).toBe("ran");
    // The log entry is appended but NOT rendered/cleared — no setupTurn ran.
    // It stays pending (in-memory only) until the next render or session reset.
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c-last", kind: "code", detail: [] },
    ]);
    // Single trailing persist per executePhase — same cadence as other kinds
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalledTimes(1);
  });
});

describe("advancePhase — integration", () => {
  it("workflow with two consecutive pure variable-definition phases followed by a standard phase", async () => {
    const { advancePhase } = await import("./loop-engine");
    const { SessionVariableStore } = await import("./session-store");
    const store = new SessionVariableStore({});

    const phases = [
      {
        id: "p1",
        title: "P1",
        kind: "variable-definition" as const,
        variables: [
          { name: "x", type: "string", kind: "static" as const, value: "A" },
          {
            name: "y",
            type: "number",
            kind: "computed" as const,
            compute: () => 42,
          },
        ],
      },
      {
        id: "p2",
        title: "P2",
        kind: "variable-definition" as const,
        variables: [
          { name: "z", type: "string", kind: "static" as const, value: "B" },
        ],
      },
      { id: "s3", title: "S3", instructions: "Do the main work" },
    ];
    const pm = new PhaseManager(phases);

    setState({
      isActive: true,
      sessionId: "integration-session",
      currentIteration: 1,
      totalPhases: 3,
      phasesList: phases,
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      phaseManager: pm,
      currentPhaseId: "p1",
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    const result = await advancePhase(store, "p1", "reset");

    expect(result.triggered).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.customType).toBe("workflow-phase-instructions");

    // Variables from both programmatic phases should be set
    expect(store.get("x")).toBe("A");
    expect(store.get("y")).toBe(42);
    expect(store.get("z")).toBe("B");

    // State persisted for each phase (executePhase for p1, p2, s3 + setupTurn for s3)
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// __pio-exit — automatic terminal exit phase
// ---------------------------------------------------------------------------

describe("__pio-exit — automatic terminal exit phase", () => {
  async function fireResourcesDiscover(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
  ) {
    const list = handlers.get("resources_discover");
    expect(list).toBeDefined();
    for (const h of list!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }
  }

  async function fireBeforeAgentStart(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
  ): Promise<unknown> {
    const list = handlers.get("before_agent_start");
    expect(list).toBeDefined();
    let result: unknown;
    for (const h of list!) {
      result = await h({ type: "before_agent_start" }, {} as any);
    }
    return result;
  }

  async function fireAgentEnd(
    handlers: Map<string, Array<(...args: unknown[]) => unknown>>,
    messages: unknown[],
  ) {
    const list = handlers.get("agent_end");
    expect(list).toBeDefined();
    for (const h of list!) {
      await h({ type: "agent_end", messages }, {} as any);
    }
  }

  /**
   * Invoke the synthesized terminal phase directly via its `run()` — same code
   * path as traversal (executePhase's generic code branch), minus the walk.
   */
  async function runTerminalPhaseDirectly() {
    const phase = getState().phaseManager!.getPhase("__pio-exit");
    expect(phase).toBeDefined();
    // Synthesis guarantees a code node with a function run — guard for clarity
    if (!phase || typeof phase.run !== "function") {
      throw new Error("__pio-exit terminal node missing or has no run()");
    }
    await phase.run({ state: getState() });
  }

  describe("terminal node synthesis", () => {
    it("appends exactly one synthesized code phase after the declared phases", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      // Default fixture: 2 declared phases (step-1, step-2)
      await fireResourcesDiscover(handlers);

      const state = getState();
      expect(state.totalPhases).toBe(3);
      expect(state.phasesList).toHaveLength(3);
      expect(state.phasesList[0].id).toBe("step-1");
      expect(state.phasesList[2].id).toBe("__pio-exit");

      const pm = state.phaseManager!;
      // Traversal from the last declared phase lands on the terminal node
      expect(pm.resolveNext("step-2")).toBe("__pio-exit");
      // Append-only tail — first phase is unaffected
      expect(pm.getFirstPhaseId()).toBe("step-1");

      const node = pm.getPhase("__pio-exit")!;
      expect(node.kind).toBe("code");
      expect(typeof node.run).toBe("function");
      expect(node.title).toBe("Exit lifecycle (automatic)");
    });

    it("skips synthesis for zero-phase capabilities (single-pass semantics preserved)", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue(
        [],
      );

      setupLoopEngine(pi);
      await fireResourcesDiscover(handlers);

      const state = getState();
      expect(state.totalPhases).toBe(0);
      expect(state.phasesList).toEqual([]);
      expect(state.phaseManager!.getPhase("__pio-exit")).toBeUndefined();
    });
  });

  describe("setupTurn — lastLlmPhaseId capture", () => {
    it("sets lastLlmPhaseId when an LLM phase's turn begins (before_agent_start)", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers); // currentPhaseId: "step-1"
      expect(getState().lastLlmPhaseId).toBeUndefined();

      // Normal mode → advancePhase(step-1, preserve) → setupTurn on step-1
      const result = (await fireBeforeAgentStart(handlers)) as {
        message: { content: string };
      };

      expect(getState().lastLlmPhaseId).toBe("step-1");
      expect(result.message.content).toContain('Instructions for "step-1"');
    });

    it("tracks the latest LLM phase across an agent_end advancement", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers); // currentPhaseId: "step-1"

      // Agent finishes step-1 → engine advances to step-2 (LLM phase)
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      expect(getState().currentPhaseId).toBe("step-2");
      expect(getState().lastLlmPhaseId).toBe("step-2");
    });
  });

  describe("exitLifecycleRun wrapper branches (direct invocation)", () => {
    async function discoverWithDefaultFixture() {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);
      await fireResourcesDiscover(handlers);
    }

    it("no capability config → warn + exitOutcome skipped, markCompleteCalled untouched", async () => {
      await discoverWithDefaultFixture();
      // Default: getCurrentCapabilityConfig returns null

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runTerminalPhaseDirectly();
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      expect(
        warns.some(
          (m) => m.includes("__pio-exit") && m.includes("no capability config"),
        ),
      ).toBe(true);
      expect(getState().exitOutcome).toBe("skipped");
      expect(getState().markCompleteCalled).toBe(false);
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).not.toHaveBeenCalled();
    });

    it("lifecycle success → exitOutcome success + markCompleteCalled, notification logged", async () => {
      await discoverWithDefaultFixture();
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );
      const notification = "Next task enqueued: create-plan.";
      vi.mocked(exitLifecycle.runExitLifecycle).mockResolvedValue({
        success: true,
        message: "Validation passed.",
        notification,
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runTerminalPhaseDirectly();
      const logs = logSpy.mock.calls.map((c) => String(c[0]));
      logSpy.mockRestore();

      expect(getState().exitOutcome).toBe("success");
      expect(getState().markCompleteCalled).toBe(true);
      expect(getState().exitFailureMessage).toBeUndefined();
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        1,
      );
      expect(logs).toContain(notification);
    });

    it("lifecycle throw → warn + exitOutcome skipped + markCompleteCalled (never blocks session end)", async () => {
      await discoverWithDefaultFixture();
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );
      vi.mocked(exitLifecycle.runExitLifecycle).mockRejectedValue(
        new Error("lifecycle exploded"),
      );

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // The wrapper catches internally — direct invocation resolves cleanly
      await runTerminalPhaseDirectly();
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      expect(
        warns.some(
          (m) => m.includes("__pio-exit") && m.includes("lifecycle exploded"),
        ),
      ).toBe(true);
      expect(getState().exitOutcome).toBe("skipped");
      expect(getState().markCompleteCalled).toBe(true);
    });

    it("lifecycle failure → exitOutcome failed + ad-hoc pause state, no markCompleteCalled", async () => {
      await discoverWithDefaultFixture();
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );
      // Simulate an LLM phase having run before exit (as setupTurn would have)
      setState({ lastLlmPhaseId: "step-2" });
      vi.mocked(exitLifecycle.runExitLifecycle).mockResolvedValue({
        success: false,
        message: "Missing GOAL.md",
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await runTerminalPhaseDirectly();
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      expect(getState().exitOutcome).toBe("failed");
      expect(getState().exitFailureMessage).toBe("Missing GOAL.md");
      expect(getState().currentPhaseId).toBe("step-2"); // pointed at last LLM phase
      expect(getState().isAdHocInput).toBe(true);
      expect(getState().adHocPhaseNotified).toBe(false);
      expect(getState().markCompleteCalled).toBe(false);
      expect(warns).toContain("Missing GOAL.md");
    });
  });

  describe("traversal to workflow end (agent_end)", () => {
    it("success: exit runs at traversal end, exhaustion hygiene runs, zero follow-ups", async () => {
      const { pi, handlers, sendMessageCalls, sendUserMessageCalls } =
        createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers); // default 2-phase fixture
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );

      // Simulate the agent having reached the last declared phase
      setState({ currentPhaseId: "step-2", currentIteration: 1 });

      vi.mocked(statePersistence.saveLoopEngineState).mockClear();

      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      const state = getState();
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        1,
      );
      expect(state.exitOutcome).toBe("success");
      expect(state.markCompleteCalled).toBe(true);
      // Exhaustion hygiene ran
      expect(state.currentIteration).toBe(1);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
      // No follow-up of any kind — the session ends naturally
      expect(sendMessageCalls).toHaveLength(0);
      expect(sendUserMessageCalls).toHaveLength(0);
    });

    it("no config: warns, skips lifecycle, exhaustion still runs, no throw", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers);
      // Default: getCurrentCapabilityConfig returns null

      setState({ currentPhaseId: "step-2", currentIteration: 1 });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      expect(vi.mocked(exitLifecycle.runExitLifecycle)).not.toHaveBeenCalled();
      expect(getState().exitOutcome).toBe("skipped");
      expect(getState().markCompleteCalled).toBe(false);
      expect(warns.some((m) => m.includes("no capability config"))).toBe(true);
      // Exhaustion hygiene ran and the handler resolved without throwing
      expect(getState().currentIteration).toBe(1);
      expect(getState().filesWritten).toEqual([]);
      expect(sendMessageCalls).toHaveLength(0);
    });

    it("throw: lifecycle rejection warns but traversal ends cleanly", async () => {
      const { pi, handlers, sendMessageCalls } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers);
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );
      vi.mocked(exitLifecycle.runExitLifecycle).mockRejectedValue(
        new Error("lifecycle exploded"),
      );

      setState({ currentPhaseId: "step-2", currentIteration: 1 });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Resolves — no unhandled rejection, session not blocked
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      expect(warns.some((m) => m.includes("lifecycle exploded"))).toBe(true);
      expect(getState().exitOutcome).toBe("skipped");
      expect(getState().markCompleteCalled).toBe(true);
      expect(sendMessageCalls).toHaveLength(0);
    });
  });

  describe("exit failure — ad-hoc pause, no automatic retry", () => {
    it("failure pauses in ad-hoc mode; /continue re-runs the last LLM phase and re-validates on exit (two-stage recovery)", async () => {
      const M = "Missing GOAL.md (contract output not found)";
      const {
        pi,
        handlers,
        sendMessageCalls,
        sendUserMessageCalls,
        registeredCommands,
      } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers); // default 2-phase fixture
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );
      // First exit run fails; the post-recovery second run succeeds
      vi.mocked(exitLifecycle.runExitLifecycle)
        .mockResolvedValueOnce({ success: false, message: M })
        .mockResolvedValueOnce({
          success: true,
          message: "Validation passed.",
        });

      // Turn 1: agent finishes step-1 → engine advances to step-2 (LLM phase)
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
      expect(getState().currentPhaseId).toBe("step-2");
      expect(getState().lastLlmPhaseId).toBe("step-2");
      expect(sendMessageCalls).toHaveLength(1); // step-2 instructions follow-up

      // Turn 2: agent finishes step-2 → traversal reaches __pio-exit → failure
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
      const warns = warnSpy.mock.calls.map((c) => String(c[0]));
      warnSpy.mockRestore();

      // Failure state — ad-hoc pause armed, no automatic retry sent
      expect(getState().exitOutcome).toBe("failed");
      expect(getState().exitFailureMessage).toBe(M);
      expect(getState().isAdHocInput).toBe(true);
      expect(getState().adHocPhaseNotified).toBe(false);
      expect(getState().currentPhaseId).toBe("step-2"); // = lastLlmPhaseId
      expect(getState().markCompleteCalled).toBe(false);
      expect(warns).toContain(M);
      expect(sendMessageCalls).toHaveLength(1); // no new follow-up after failure
      expect(sendUserMessageCalls).toHaveLength(0);
      // Exhaustion hygiene ran
      expect(getState().currentIteration).toBe(1);
      expect(getState().filesWritten).toEqual([]);

      // Live session: the ad-hoc pause message carries the failure detail
      const paused = (await fireBeforeAgentStart(handlers)) as {
        message: { customType: string; content: string };
      };
      expect(paused.message.customType).toBe("workflow-paused");
      expect(paused.message.content).toContain(
        "## Workflow Paused (Ad-hoc Mode)",
      );
      expect(paused.message.content).toContain(
        `Session validation failed: ${M}`,
      );

      // User fixes the cause and runs /continue — clears ad-hoc flags only
      const continueCmd = registeredCommands.get("continue");
      expect(continueCmd).toBeDefined();
      await continueCmd!.handler();
      expect(getState().isAdHocInput).toBe(false);
      expect(getState().adHocPhaseNotified).toBe(false);

      // Next turn: the last LLM phase re-runs first (designed cost of recovery)
      const resumed = (await fireBeforeAgentStart(handlers)) as {
        message: { customType: string; content: string };
      };
      expect(resumed.message.customType).toBe("workflow-phase-instructions");
      expect(resumed.message.content).toContain('Instructions for "step-2"');

      // Turn 3: agent finishes step-2 again → __pio-exit re-runs → succeeds
      await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        2,
      );
      expect(getState().exitOutcome).toBe("success");
      expect(getState().markCompleteCalled).toBe(true);
      expect(getState().exitFailureMessage).toBeUndefined(); // stale failure cleared
      // No new follow-ups — session ends via exhaustion
      expect(sendMessageCalls).toHaveLength(1);
    });

    it("restart after failure: persisted projection only → generic pause text, no automatic retry", async () => {
      const M = "Missing GOAL.md (contract output not found)";
      vi.mocked(statePersistence.loadLoopEngineState).mockReturnValue({
        currentIteration: 1,
        isAdHocInput: true,
        currentPhaseId: "step-2",
      });

      const { pi, handlers, sendMessageCalls, sendUserMessageCalls } =
        createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);
      await fireResourcesDiscover(handlers); // rebuilds from persisted projection

      expect(getState().isAdHocInput).toBe(true);
      // In-memory failure fields are lost on restart by design
      expect(getState().exitOutcome).toBeUndefined();
      expect(getState().exitFailureMessage).toBeUndefined();

      const paused = (await fireBeforeAgentStart(handlers)) as {
        message: { content: string };
      };
      expect(paused.message.content).toContain(
        "## Workflow Paused (Ad-hoc Mode)",
      );
      expect(paused.message.content).not.toContain("Session validation failed");
      expect(paused.message.content).not.toContain(M);

      // No automatic retry — the exit lifecycle never ran
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).not.toHaveBeenCalled();
      expect(sendMessageCalls).toHaveLength(0);
      expect(sendUserMessageCalls).toHaveLength(0);

      vi.mocked(statePersistence.loadLoopEngineState).mockReset();
    });
  });

  describe("no idempotency guard", () => {
    it("re-traversal through __pio-exit re-runs the lifecycle and re-sets success state", async () => {
      const { pi, handlers } = createMockPi();
      const { setupLoopEngine } = await import("./loop-engine");
      setupLoopEngine(pi);

      await fireResourcesDiscover(handlers);
      vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
        makeFakeCapabilityConfig(),
      );

      // First traversal through the terminal node — success
      setState({ currentPhaseId: "__pio-exit", isAdHocInput: false });
      const first = await fireBeforeAgentStart(handlers);
      expect(first).toBeUndefined(); // exhausted — no injection
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        1,
      );
      expect(getState().exitOutcome).toBe("success");
      expect(getState().markCompleteCalled).toBe(true);

      // Forced re-traversal (e.g. /goto __pio-exit) — runs again, no short-circuit
      setState({
        currentPhaseId: "__pio-exit",
        isAdHocInput: false,
        adHocPhaseNotified: false,
      });
      const second = await fireBeforeAgentStart(handlers);
      expect(second).toBeUndefined();
      expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(
        2,
      );
      expect(getState().exitOutcome).toBe("success");
      expect(getState().markCompleteCalled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Loop blocks — engine-side traversal (Step 4)
// ---------------------------------------------------------------------------

describe("advancePhase — inline all-programmatic loop traversal", () => {
  it("traverses the loop end-to-end and terminates at the pass cap without an agent turn", async () => {
    const { advancePhase, initializeStore } = await import("./loop-engine");

    const c1Run = vi.fn(
      (ctx: { state: import("./session-state").PioSessionState }) => {
        const store = ctx.state.store!;
        store.declare("passCount", "number");
        const current = (store.get("passCount") as number | undefined) ?? 0;
        store.set("passCount", "number", current + 1);
      },
    );

    // Single top-level loop block — explicit cap (hermetic, no model-config).
    const L = {
      id: "L",
      title: "L",
      kind: "loop" as const,
      maxIterations: 3,
      body: [
        { id: "c1", title: "C1", kind: "code" as const, run: c1Run },
        {
          id: "vd",
          title: "VD",
          kind: "variable-definition" as const,
          variables: [
            {
              name: "marker",
              type: "string",
              kind: "static" as const,
              value: "done",
            },
          ],
        },
      ],
    };

    const store = initializeStore({});
    setState({
      isActive: true,
      sessionId: "test-session",
      currentIteration: 1,
      totalPhases: 1,
      phasesList: [L],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
    });

    const result = await advancePhase(store, "L", "reset");

    // One call terminates at the cap — no agent turn (a hang here would be
    // the Step 3 cap-contract failure mode).
    expect(result.triggered).toBe(false);
    // Exactly resolvedMax - 1 repeats (3 full passes = first pass + 2 repeats)
    expect(getState().loopPasses.L).toBe(2);
    // The cap bounds full passes — c1 ran once per pass
    expect(c1Run).toHaveBeenCalledTimes(3);
    // The store variable written by the last pass is set
    expect(store.get("passCount")).toBe(3);
    // Exactly three log entries, all for c1 — the loop-end (traversed 3x)
    // logged nothing
    expect(getState().programmaticLog).toEqual([
      { phaseId: "c1", kind: "code", detail: [] },
      { phaseId: "c1", kind: "code", detail: [] },
      { phaseId: "c1", kind: "code", detail: [] },
    ]);
    expect(
      getState().programmaticLog.some((e) => e.phaseId === "__loop-end-L"),
    ).toBe(false);
  });
});

describe("loop block — agent_end-driven repeat across agent turns", () => {
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

  it("skips the container, repeats the body while the condition holds, and exits into __pio-exit", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      {
        id: "L",
        title: "L",
        kind: "loop" as const,
        maxIterations: 5,
        repeatWhile: (state) => state.store?.get("keepLooping"),
        body: [
          { id: "p1", title: "P1", instructions: "Do A", maxIterations: 2 },
        ],
      },
    ]);

    // Fire resources_discover — engine wiring: __pio-exit appended, so L's
    // exitTarget is "__pio-exit"; currentPhaseId starts at the container "L".
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Seed AFTER discover — discover initializes the store; seed in place on
    // the live reference it stored (the same object repeatWhile reads).
    const store = getState().store!;
    store.declare("keepLooping", "boolean");
    store.set("keepLooping", "boolean", true);

    // 1. First leg — the container is skipped, instructions name p1
    const results = await fireBeforeAgentStart(handlers);
    expect(results).toHaveLength(1);
    const first = results[0] as {
      message: { customType: string; content: string };
    };
    expect(first.message.customType).toBe("workflow-phase-instructions");
    expect(first.message.content).toContain('You are on "p1", iteration 1');
    expect(getState().currentPhaseId).toBe("p1");

    // 2. Repeat 1 — loop-end routes back to the body
    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].options?.deliverAs).toBe("followUp");
    expect(sendMessageCalls[0].message.customType).toBe(
      "workflow-phase-instructions",
    );
    expect(getState().loopPasses.L).toBe(1);
    expect(getState().currentIteration).toBe(1); // fresh pass — reset mode
    expect(getState().currentPhaseId).toBe("p1");

    // 3. Repeat 2
    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);
    expect(sendMessageCalls).toHaveLength(2);
    expect(getState().loopPasses.L).toBe(2);

    // 4. Exit — flip the condition in place on the live store
    store.set("keepLooping", "boolean", false);
    vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
      makeFakeCapabilityConfig(),
    );
    await fireAgentEnd(handlers, [{ role: "assistant", stopReason: "stop" }]);

    // Traversal exits into __pio-exit — no further agent turn
    expect(sendMessageCalls).toHaveLength(2);
    expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(1);
    expect(getState().exitOutcome).toBe("success");
    expect(getState().markCompleteCalled).toBe(true);
    // A real (non-synthetic) code phase still logs — suppression is
    // flag-keyed, not kind-keyed
    expect(
      getState().programmaticLog.some((e) => e.phaseId === "__pio-exit"),
    ).toBe(true);
  });
});

describe("loop as last declared element — clean exit into __pio-exit", () => {
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

  it("exits the capped loop into the synthesized __pio-exit without further passes", async () => {
    const { pi, handlers, sendMessageCalls } = createMockPi();
    const { setupLoopEngine } = await import("./loop-engine");
    setupLoopEngine(pi);

    vi.mocked(capabilitySession.getCompiledWorkflowPhases).mockReturnValue([
      {
        id: "L",
        title: "L",
        kind: "loop" as const,
        maxIterations: 1, // cap 1 — first loop-end evaluation exits at the cap
        body: [
          { id: "p1", title: "P1", instructions: "Do A", maxIterations: 2 },
        ],
      },
    ]);

    // Fire resources_discover so the PhaseManager carries the synthesized
    // "__pio-exit" terminal node, exactly as in production wiring.
    const discoverHandlers = handlers.get("resources_discover");
    for (const h of discoverHandlers!) {
      await h(
        { type: "resources_discover", cwd: ".", reason: "startup" },
        mockCtx,
      );
    }

    // Config present → the terminal exit node runs the (mocked) lifecycle
    vi.mocked(capabilitySession.getCurrentCapabilityConfig).mockReturnValue(
      makeFakeCapabilityConfig(),
    );

    // Set iteration/tracking WITHOUT phasesList — keeps the discover-built
    // phaseManager (with synthesized tail) intact.
    setState({
      isActive: true,
      sessionId: "test-session-id",
      currentPhaseId: "p1",
      currentIteration: 1,
      markCompleteCalled: false,
      filesWritten: ["/some/file.ts"],
      askUserCalled: true,
      isAdHocInput: false,
    });

    vi.mocked(statePersistence.saveLoopEngineState).mockClear();

    await fireAgentEnd(handlers, [
      {
        role: "assistant",
        stopReason: "stop",
      },
    ]);

    // Cap 1 → the loop-end evaluation exits silently before evaluating any
    // repeat condition; traversal continues into __pio-exit
    expect(sendMessageCalls).toHaveLength(0);
    expect(vi.mocked(exitLifecycle.runExitLifecycle)).toHaveBeenCalledTimes(1);
    expect(getState().exitOutcome).toBe("success");
    expect(getState().currentIteration).toBe(1); // Reset on exhaustion
    expect(getState().filesWritten).toEqual([]); // Reset on exhaustion
    expect(getState().askUserCalled).toBe(false); // Reset on exhaustion
    expect(statePersistence.saveLoopEngineState).toHaveBeenCalled();
  });
});

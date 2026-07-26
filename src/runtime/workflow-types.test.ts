import { describe, expect, it } from "vitest";
import type { PioSessionState } from "./session-state";
import { __testGetState } from "./session-state";
import type { LoopWhileCondition, WorkflowPhase } from "./workflow-types";

function makeState(overrides: Partial<PioSessionState> = {}): PioSessionState {
  // Use the real initial state and apply overrides
  const base = __testGetState();
  return { ...base, ...overrides };
}

describe("LoopWhileCondition", () => {
  it("accepts a callback-based condition object", () => {
    const condition: LoopWhileCondition = {
      type: "callback",
      callback: (_state: PioSessionState) => true,
    };
    expect(condition.type).toBe("callback");
    expect(typeof condition.callback).toBe("function");
  });

  it("callback receives PioSessionState and returns boolean", () => {
    const condition: LoopWhileCondition = {
      type: "callback",
      callback: (state: PioSessionState) => state.currentIteration > 1,
    };
    expect(condition.callback(makeState({ currentIteration: 0 }))).toBe(false);
    expect(condition.callback(makeState({ currentIteration: 2 }))).toBe(true);
  });
});

describe("WorkflowPhase.loopWhile", () => {
  it("accepts an array of LoopWhileCondition", () => {
    const phase: WorkflowPhase = {
      id: "test",
      title: "Test",
      instructions: "Do something",
      loopWhile: [
        {
          type: "callback",
          callback: (_state: PioSessionState) => false,
        },
      ],
    };
    expect(phase.loopWhile).toHaveLength(1);
  });

  it("loopWhile is optional — phase without it is valid", () => {
    const phase: WorkflowPhase = {
      id: "test",
      title: "Test",
      instructions: "Do something",
    };
    expect(phase.loopWhile).toBeUndefined();
  });

  it("loopWhile and terminateWhen can coexist on the same phase", () => {
    const phase: WorkflowPhase = {
      id: "test",
      title: "Test",
      instructions: "Do something",
      terminateWhen: [
        {
          type: "callback",
          callback: (_state: PioSessionState) => true,
        },
      ],
      loopWhile: [
        {
          type: "callback",
          callback: (_state: PioSessionState) => false,
        },
      ],
    };
    expect(phase.terminateWhen).toHaveLength(1);
    expect(phase.loopWhile).toHaveLength(1);
  });
});

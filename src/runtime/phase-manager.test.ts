import { describe, expect, it } from "vitest";
import { PhaseManager } from "./phase-manager";
import type { WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(id: string, title = id): WorkflowPhase {
  return { id, title };
}

function makePhases(ids: string[]): WorkflowPhase[] {
  return ids.map((id) => makePhase(id));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PhaseManager", () => {
  describe("constructor", () => {
    it("builds registry from phases array", () => {
      const phases = makePhases(["a", "b", "c"]);
      const pm = new PhaseManager(phases);

      expect(pm.getPhase("a")).toBe(phases[0]);
      expect(pm.getPhase("b")).toBe(phases[1]);
      expect(pm.getPhase("c")).toBe(phases[2]);
    });

    it("preserves original array order in listIds", () => {
      const phases = makePhases(["phase-1", "phase-2", "phase-3"]);
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual(["phase-1", "phase-2", "phase-3"]);
    });

    it("handles empty phase list without throwing", () => {
      expect(() => new PhaseManager([])).not.toThrow();
    });

    it("handles single phase", () => {
      const phases = [makePhase("only")];
      const pm = new PhaseManager(phases);

      expect(pm.getPhase("only")).toBe(phases[0]);
      expect(pm.listIds()).toEqual(["only"]);
    });

    it("keeps last occurrence when IDs are duplicated", () => {
      const first = makePhase("dup", "First");
      const second = makePhase("dup", "Second");
      const pm = new PhaseManager([first, second]);

      expect(pm.getPhase("dup")).toBe(second);
      // Ordered IDs should also reflect last-wins (deduplicated)
      expect(pm.listIds()).toEqual(["dup"]);
    });
  });

  describe("getPhase", () => {
    it("returns the WorkflowPhase for a valid ID", () => {
      const phase = makePhase("understand-goal", "Understand the goal");
      const pm = new PhaseManager([phase, makePhase("plan", "Plan")]);

      expect(pm.getPhase("understand-goal")).toBe(phase);
    });

    it("returns undefined for an unknown ID", () => {
      const pm = new PhaseManager(makePhases(["a", "b"]));

      expect(pm.getPhase("nonexistent")).toBeUndefined();
    });

    it("returns undefined for any ID when constructed with empty list", () => {
      const pm = new PhaseManager([]);

      expect(pm.getPhase("any")).toBeUndefined();
    });
  });

  describe("resolveNext", () => {
    it("returns the next phase ID for a mid-array phase", () => {
      const pm = new PhaseManager(makePhases(["a", "b", "c"]));

      expect(pm.resolveNext("b")).toBe("c");
    });

    it("returns the next phase ID for the first phase", () => {
      const pm = new PhaseManager(makePhases(["a", "b", "c"]));

      expect(pm.resolveNext("a")).toBe("b");
    });

    it("returns undefined for the last phase", () => {
      const pm = new PhaseManager(makePhases(["a", "b", "c"]));

      expect(pm.resolveNext("c")).toBeUndefined();
    });

    it("returns undefined for an unknown phase ID", () => {
      const pm = new PhaseManager(makePhases(["a", "b"]));

      expect(pm.resolveNext("nonexistent")).toBeUndefined();
    });

    it("returns undefined for the only phase", () => {
      const pm = new PhaseManager([makePhase("only")]);

      expect(pm.resolveNext("only")).toBeUndefined();
    });

    it("returns undefined for any ID when constructed with empty list", () => {
      const pm = new PhaseManager([]);

      expect(pm.resolveNext("any")).toBeUndefined();
    });

    it("accepts an optional state parameter without error", () => {
      const pm = new PhaseManager(makePhases(["a", "b"]));

      // The state param is accepted but unused in this implementation
      const state = {
        isActive: false,
        markCompleteCalled: false,
        turnCount: 0,
        currentPhaseId: "",
        currentIteration: 0,
        totalPhases: 0,
        phasesList: [],
        filesWritten: [],
        askUserCalled: false,
        isAdHocInput: false,
        adHocPhaseNotified: false,
        phaseWriteAllowlist: new Map(),
      };
      expect(() => pm.resolveNext("a", state as never)).not.toThrow();
      expect(pm.resolveNext("a", state as never)).toBe("b");
    });
  });

  describe("listIds", () => {
    it("returns IDs matching original construction order", () => {
      const pm = new PhaseManager(
        makePhases(["phase-1", "phase-2", "phase-3"]),
      );

      expect(pm.listIds()).toEqual(["phase-1", "phase-2", "phase-3"]);
    });

    it("returns a copy — mutating returned array does not affect subsequent calls", () => {
      const pm = new PhaseManager(makePhases(["a", "b"]));

      const ids1 = pm.listIds();
      ids1.push("injected");

      const ids2 = pm.listIds();
      expect(ids2).toEqual(["a", "b"]);
    });

    it("returns empty array when constructed with empty list", () => {
      const pm = new PhaseManager([]);

      expect(pm.listIds()).toEqual([]);
    });
  });
});

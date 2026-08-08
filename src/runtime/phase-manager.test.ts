import { describe, expect, it } from "vitest";
import { PhaseManager } from "./phase-manager";
import type { WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// Branch helpers
// ---------------------------------------------------------------------------

function makeBranchIf(
  id: string,
  then: WorkflowPhase[],
  elsePhases?: WorkflowPhase[],
): WorkflowPhase {
  const phase: WorkflowPhase = {
    id,
    title: id,
    kind: "branch:if" as const,
    then,
  };
  if (elsePhases) phase.else = elsePhases;
  return phase;
}

function makeBranchSwitch(
  id: string,
  cases: Record<string, WorkflowPhase[]>,
  defaultBranch?: WorkflowPhase[],
): WorkflowPhase {
  const phase: WorkflowPhase = {
    id,
    title: id,
    kind: "branch:switch" as const,
    cases,
  };
  if (defaultBranch) phase.defaultBranch = defaultBranch;
  return phase;
}

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

  describe("branch:if flattening", () => {
    it("flattens a basic branch:if with then/else arms", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      // listIds includes nested arm children in DFS order
      expect(pm.listIds()).toEqual(["prev", "branch", "x", "y", "z"]);

      // Routing: prev→branch, arm tails→z
      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("z");
      expect(pm.resolveNext("y")).toBe("z");
      expect(pm.resolveNext("z")).toBeUndefined();

      // Branch phase itself has no linear routing
      expect(pm.resolveNext("branch")).toBeUndefined();

      // getFirstPhaseId
      expect(pm.getFirstPhaseId()).toBe("prev");
    });

    it("wires multi-phase arms sequentially and routes tail to post-branch", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf(
          "branch",
          [makePhase("x1"), makePhase("x2")],
          [makePhase("y1"), makePhase("y2")],
        ),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "prev",
        "branch",
        "x1",
        "x2",
        "y1",
        "y2",
        "z",
      ]);

      // Inner phases wired sequentially
      expect(pm.resolveNext("x1")).toBe("x2");
      expect(pm.resolveNext("y1")).toBe("y2");
      // Tails route to post-branch
      expect(pm.resolveNext("x2")).toBe("z");
      expect(pm.resolveNext("y2")).toBe("z");
    });

    it("handles empty else arm by setting elseFirst to successor", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [makePhase("x")], []),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("z");
    });

    it("handles absent else arm by setting elseFirst to successor", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [makePhase("x")]),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("z");
    });

    it("throws TypeError when then arm is empty", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [], [makePhase("y")]),
        makePhase("z"),
      ];
      expect(() => new PhaseManager(phases)).toThrow(TypeError);
    });

    it("throws TypeError when then arm is absent", () => {
      const phase: WorkflowPhase = {
        id: "branch",
        title: "branch",
        kind: "branch:if" as const,
        else: [makePhase("y")],
      };
      expect(() => new PhaseManager([phase])).toThrow(TypeError);
    });
  });

  describe("branch:switch flattening", () => {
    it("flattens a basic branch:switch with cases and default", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchSwitch(
          "branch",
          { a: [makePhase("ca")], b: [makePhase("cb")] },
          [makePhase("d")],
        ),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual(["prev", "branch", "ca", "cb", "d", "z"]);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("z");
      expect(pm.resolveNext("cb")).toBe("z");
      expect(pm.resolveNext("d")).toBe("z");
      expect(pm.resolveNext("z")).toBeUndefined();
      expect(pm.resolveNext("branch")).toBeUndefined();
    });

    it("handles empty case arms by setting caseFirst to successor", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchSwitch("branch", { a: [makePhase("ca")], b: [] }, [
          makePhase("d"),
        ]),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("z");
      expect(pm.resolveNext("d")).toBe("z");
    });

    it("handles absent defaultBranch", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchSwitch("branch", { a: [makePhase("ca")] }),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("z");
    });
  });

  describe("nested branches", () => {
    it("handles a branch:if inside the then arm of another branch:if", () => {
      const phases: WorkflowPhase[] = [
        makePhase("start"),
        makeBranchIf(
          "outer",
          [
            makeBranchIf(
              "inner",
              [makePhase("inner-x")],
              [makePhase("inner-y")],
            ),
          ],
          [makePhase("outer-y")],
        ),
        makePhase("end"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "start",
        "outer",
        "inner",
        "inner-x",
        "inner-y",
        "outer-y",
        "end",
      ]);

      // start → outer (the branch phase)
      expect(pm.resolveNext("start")).toBe("outer");
      // inner arm tails → end
      expect(pm.resolveNext("inner-x")).toBe("end");
      expect(pm.resolveNext("inner-y")).toBe("end");
      // outer else tail → end
      expect(pm.resolveNext("outer-y")).toBe("end");
      expect(pm.resolveNext("end")).toBeUndefined();
    });
  });

  describe("consecutive branches", () => {
    it("wires first branch arm tail to second branch phase", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf("b1", [makePhase("x")]),
        makeBranchIf("b2", [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("x")).toBe("b2");
      expect(pm.resolveNext("y")).toBeUndefined();
    });
  });

  describe("ID validation", () => {
    it("throws TypeError when a phase lacks an id", () => {
      const phases: WorkflowPhase[] = [
        makePhase("a"),
        { title: "no-id" } as unknown as WorkflowPhase,
        makePhase("c"),
      ];
      expect(() => new PhaseManager(phases)).toThrow(TypeError);
    });

    it("throws TypeError when a nested arm phase lacks an id", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf(
          "branch",
          [makePhase("x"), { title: "no-id" } as unknown as WorkflowPhase],
          [makePhase("y")],
        ),
      ];
      expect(() => new PhaseManager(phases)).toThrow(TypeError);
    });
  });

  describe("getFirstPhaseId", () => {
    it("returns the first phase ID for flat arrays", () => {
      const pm = new PhaseManager(makePhases(["a", "b", "c"]));
      expect(pm.getFirstPhaseId()).toBe("a");
    });

    it("returns undefined for empty phase list", () => {
      const pm = new PhaseManager([]);
      expect(pm.getFirstPhaseId()).toBeUndefined();
    });

    it("returns the first phase ID for branched workflows", () => {
      const phases: WorkflowPhase[] = [
        makePhase("start"),
        makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
        makePhase("end"),
      ];
      const pm = new PhaseManager(phases);
      expect(pm.getFirstPhaseId()).toBe("start");
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

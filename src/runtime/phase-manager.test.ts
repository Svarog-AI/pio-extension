import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhaseManager } from "./phase-manager";
import type { PioSessionState } from "./session-state";
import { getState, resetState, setState } from "./session-state";
import type { SessionVariableStore } from "./session-store";
import type { CodeStepContext, WorkflowPhase } from "./workflow-types";

// ---------------------------------------------------------------------------
// model-config mock — deterministic cap resolution for loop-routing tests.
// readConfig() caches the parsed config for module lifetime (no invalidation
// export), so a real config file can't vary between evaluations hermetically;
// the spy keeps every cap deterministic on every machine. The factory captures
// both the spy and the original delegate in a hoisted holder so tests can
// restore delegation to the real resolveMaxIterations.
// ---------------------------------------------------------------------------

const maxIterationsMock = vi.hoisted(() => ({
  fn: vi.fn(),
  original: undefined as undefined | ((perStepOverride?: number) => number),
}));

vi.mock("../model-config", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    resolveMaxIterations: (perStepOverride?: number) => number;
  } & Record<string, unknown>;
  maxIterationsMock.fn = vi.fn(actual.resolveMaxIterations);
  maxIterationsMock.original = actual.resolveMaxIterations;
  return { ...actual, resolveMaxIterations: maxIterationsMock.fn };
});

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

/** A valid loop block — kind "loop" with a non-empty body. */
function makeLoop(
  id: string,
  body: WorkflowPhase[],
  repeatWhile?: (state: PioSessionState) => boolean | unknown,
  maxIterations?: number,
): WorkflowPhase {
  const phase: WorkflowPhase = {
    id,
    title: id,
    kind: "loop" as const,
    body,
  };
  if (repeatWhile !== undefined) phase.repeatWhile = repeatWhile;
  if (maxIterations !== undefined) phase.maxIterations = maxIterations;
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

/** A valid code phase — kind "code" paired with a function run. */
function makeCodePhase(
  id: string,
  run: (ctx: CodeStepContext) => void | Promise<void> = () => {},
): WorkflowPhase {
  return { id, title: id, kind: "code", run };
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
      };
      expect(() => pm.resolveNext("a", state as never)).not.toThrow();
      expect(pm.resolveNext("a", state as never)).toBe("b");
    });
  });

  describe("branch:if flattening", () => {
    it("flattens a basic branch:if with then/else arms", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: () => true,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      // listIds includes nested arm children in DFS order, with the branch-end merge node before the successor
      expect(pm.listIds()).toEqual([
        "prev",
        "branch",
        "x",
        "y",
        "__branch-end-branch",
        "z",
      ]);

      // Routing: prev→branch, arm tails→branch-end→z
      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("__branch-end-branch");
      expect(pm.resolveNext("y")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
      expect(pm.resolveNext("z")).toBeUndefined();

      // Branch phase evaluates condition and routes to arm
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
        store: null,
      } as any;
      expect(pm.resolveNext("branch", state)).toBe("x");

      // getFirstPhaseId
      expect(pm.getFirstPhaseId()).toBe("prev");
    });

    it("wires multi-phase arms sequentially and routes tails to branch-end", () => {
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
        "__branch-end-branch",
        "z",
      ]);

      // Inner phases wired sequentially
      expect(pm.resolveNext("x1")).toBe("x2");
      expect(pm.resolveNext("y1")).toBe("y2");
      // Tails route to the branch-end merge node, which links to post-branch
      expect(pm.resolveNext("x2")).toBe("__branch-end-branch");
      expect(pm.resolveNext("y2")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
    });

    it("routes empty else arm to the branch-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")], []),
          condition: () => false,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");

      // Falsy condition with an empty else arm lands on the merge node too
      const state = { store: null } as any;
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
    });

    it("routes absent else arm to the branch-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")]),
          condition: () => false,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");

      // Falsy condition with no else arm lands on the merge node too
      const state = { store: null } as any;
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
    });

    it("registers the branch-end merge node as a synthetic no-op code phase", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);

      const endPhase = pm.getPhase("__branch-end-branch");
      expect(endPhase).toBeDefined();
      expect(endPhase?.synthetic).toBe(true);
      expect(endPhase?.kind).toBe("code");
      expect(typeof endPhase?.run).toBe("function");

      // The merge node registers after arm flattening — even when the branch
      // leads the workflow, it never becomes the first phase id.
      expect(pm.getFirstPhaseId()).toBe("branch");
    });

    it("suffixes the branch-end id when the reserved namespace is already occupied", () => {
      const phases: WorkflowPhase[] = [
        makePhase("__branch-end-a"),
        makeBranchIf("a", [makePhase("x")], [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);

      // The user-declared phase keeps the bare reserved id; the merge node
      // takes the -1 suffix and still acts as the branch's single exit
      expect(pm.getPhase("__branch-end-a")).toBe(phases[0]);
      expect(pm.getPhase("__branch-end-a-1")?.synthetic).toBe(true);
      expect(pm.resolveNext("x")).toBe("__branch-end-a-1");
      expect(pm.resolveNext("y")).toBe("__branch-end-a-1");
      // No successor: the suffixed merge node is a clean terminal
      expect(pm.resolveNext("__branch-end-a-1")).toBeUndefined();
    });

    it("routes arm tails to the branch-end merge node when the branch ends the workflow", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("x")).toBe("__branch-end-branch");
      expect(pm.resolveNext("y")).toBe("__branch-end-branch");
      // No successor: the merge node is a clean terminal
      expect(pm.resolveNext("__branch-end-branch")).toBeUndefined();
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
        {
          ...makeBranchSwitch(
            "branch",
            { a: [makePhase("ca")], b: [makePhase("cb")] },
            [makePhase("d")],
          ),
          on: () => "a",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "prev",
        "branch",
        "ca",
        "cb",
        "d",
        "__branch-end-branch",
        "z",
      ]);

      // Every arm tail routes to the branch-end merge node, which links onward
      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("__branch-end-branch");
      expect(pm.resolveNext("cb")).toBe("__branch-end-branch");
      expect(pm.resolveNext("d")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
      expect(pm.resolveNext("z")).toBeUndefined();

      // Branch phase evaluates on and routes to matching case
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
        store: null,
      } as any;
      expect(pm.resolveNext("branch", state)).toBe("ca");
    });

    it("routes empty case arms to the branch-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")], b: [] }, [
            makePhase("d"),
          ]),
          on: () => "b",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("__branch-end-branch");
      expect(pm.resolveNext("d")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");

      // Empty arm: caseFirst["b"] is the merge node itself
      const state = { store: null } as any;
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
    });

    it("handles absent defaultBranch by routing to the branch-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }),
          on: () => "no-match",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("prev")).toBe("branch");
      expect(pm.resolveNext("ca")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");

      // Non-matching discriminant with no defaultBranch lands on the merge node
      // (previously a dead end resolving to undefined)
      const state = { store: null } as any;
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
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
        "__branch-end-inner",
        "outer-y",
        "__branch-end-outer",
        "end",
      ]);

      // start → outer (the branch phase)
      expect(pm.resolveNext("start")).toBe("outer");
      // inner arm tails converge on the nested merge node, which links to the
      // outer merge node — the single-exit chain this step introduces
      expect(pm.resolveNext("inner-x")).toBe("__branch-end-inner");
      expect(pm.resolveNext("inner-y")).toBe("__branch-end-inner");
      expect(pm.resolveNext("__branch-end-inner")).toBe("__branch-end-outer");
      // outer else tail → outer merge node → end
      expect(pm.resolveNext("outer-y")).toBe("__branch-end-outer");
      expect(pm.resolveNext("__branch-end-outer")).toBe("end");
      expect(pm.resolveNext("end")).toBeUndefined();
    });
  });

  describe("consecutive branches", () => {
    it("routes each branch arm tail through its merge node to the next phase", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf("b1", [makePhase("x")]),
        makeBranchIf("b2", [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("x")).toBe("__branch-end-b1");
      expect(pm.resolveNext("__branch-end-b1")).toBe("b2");
      // b2 ends the workflow: its merge node is a clean terminal
      expect(pm.resolveNext("y")).toBe("__branch-end-b2");
      expect(pm.resolveNext("__branch-end-b2")).toBeUndefined();
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

  describe("resolveNext with conditional branching", () => {
    function makeState(): any {
      return {
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
        store: null,
      };
    }

    // --- branch:if ---

    it("routes to then arm when condition is truthy", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: () => true,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      expect(pm.resolveNext("branch", state)).toBe("x");
    });

    it("routes to else arm when condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: () => false,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      expect(pm.resolveNext("branch", state)).toBe("y");
    });

    it("routes to branch-end when else is absent and condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")]),
          condition: () => false,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      // elseFirst was set to the branch-end merge node during flattening
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
    });

    it("passes state to condition callback", () => {
      let receivedState: any = null;
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: (s) => {
            receivedState = s;
            return true;
          },
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      pm.resolveNext("branch", state);
      expect(receivedState).toBe(state);
    });

    // --- branch:switch ---

    it("routes to matching case in branch:switch", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchSwitch(
            "branch",
            { a: [makePhase("ca")], b: [makePhase("cb")] },
            [makePhase("d")],
          ),
          on: () => "a",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      expect(pm.resolveNext("branch", state)).toBe("ca");
    });

    it("falls through to defaultBranch when no case matches", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }, [
            makePhase("d"),
          ]),
          on: () => "c",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      expect(pm.resolveNext("branch", state)).toBe("d");
    });

    it("routes to branch-end when no case matches and no defaultBranch", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }),
          on: () => "z",
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      // Absent defaultBranch now resolves to the merge node instead of a dead end
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
    });

    it("resolves $varName string form for switch on", () => {
      const store: any = {
        get: (name: string) => {
          if (name === "myVar") return "x";
          return undefined;
        },
      };
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch("branch", {
            x: [makePhase("x1")],
            y: [makePhase("y1")],
          }),
          on: "$myVar",
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();
      state.store = store;

      expect(pm.resolveNext("branch", state)).toBe("x1");
    });

    it("falls through to default when $varName resolves to undefined due to missing store", () => {
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch(
            "branch",
            { x: [makePhase("x1")], y: [makePhase("y1")] },
            [makePhase("d")],
          ),
          on: "$myVar",
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();
      state.store = null;

      expect(pm.resolveNext("branch", state)).toBe("d");
    });

    it("warns and falls through when $varName is used but state is missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch(
            "branch",
            { x: [makePhase("x1")], y: [makePhase("y1")] },
            [makePhase("d")],
          ),
          on: "$myVar",
        },
      ];
      const pm = new PhaseManager(phases);

      // No state passed — should warn and fall through to default
      const result = pm.resolveNext("branch");
      expect(result).toBe("d");
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": state is missing',
      );
      warnSpy.mockRestore();
    });

    it("$varName resolves to null from store falls through to default", () => {
      const store: any = {
        get: (_name: string) => null,
      };
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch("branch", { x: [makePhase("x1")] }, [
            makePhase("d"),
          ]),
          on: "$myVar",
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();
      state.store = store;

      // null from store should be treated as "no value" → fall through to default
      expect(pm.resolveNext("branch", state)).toBe("d");
    });

    // --- Defensive guards ---

    it("warns and returns undefined when condition is not a function", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      // No condition property — typeof is "undefined"
      const result = pm.resolveNext("branch", state);
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": condition is not a function',
      );
      warnSpy.mockRestore();
    });

    it("warns and returns undefined when branch:if resolveNext called without state", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: () => true,
        },
      ];
      const pm = new PhaseManager(phases);

      // No state passed — should warn and return undefined
      const result = pm.resolveNext("branch");
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": state is missing',
      );
      warnSpy.mockRestore();
    });

    it("warns and returns undefined when switch on is neither function nor $varName string", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }),
          on: 42 as any,
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      const result = pm.resolveNext("branch", state);
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": on is not a function or $varName string',
      );
      warnSpy.mockRestore();
    });

    it("returns undefined when switch on callback called without state", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }),
          on: () => "a",
        },
      ];
      const pm = new PhaseManager(phases);

      // No state — function branch should warn and return undefined
      const result = pm.resolveNext("branch");
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": state is missing',
      );
      warnSpy.mockRestore();
    });

    it("routes to branch-end when else is empty array and condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        {
          ...makeBranchIf("branch", [makePhase("x")], []),
          condition: () => false,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      // elseFirst was set to the branch-end merge node during flattening when else was []
      expect(pm.resolveNext("branch", state)).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
    });

    it("coerces non-string discriminant to string via String()", () => {
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch(
            "branch",
            {
              "42": [makePhase("case-42")],
              true: [makePhase("case-true")],
            },
            [makePhase("d")],
          ),
          on: () => 42,
        },
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      // on returns number 42 → String(42) → "42" → matches case "42"
      expect(pm.resolveNext("branch", state)).toBe("case-42");
    });

    // --- Error handling ---

    it("logs warning and returns undefined when condition callback throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchIf("branch", [makePhase("x")], [makePhase("y")]),
          condition: () => {
            throw new Error("boom");
          },
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      const result = pm.resolveNext("branch", state);
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": boom',
      );
      warnSpy.mockRestore();
    });

    it("logs warning and returns undefined when switch on callback throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        {
          ...makeBranchSwitch("branch", { a: [makePhase("ca")] }),
          on: () => {
            throw new Error("fail");
          },
        },
      ];
      const pm = new PhaseManager(phases);
      const state = makeState();

      const result = pm.resolveNext("branch", state);
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Condition evaluation failed for branch phase "branch": fail',
      );
      warnSpy.mockRestore();
    });

    // --- Backward compat: non-branch phases still work ---

    it("works for non-branch phases without state parameter", () => {
      const pm = new PhaseManager(makePhases(["a", "b", "c"]));

      expect(pm.resolveNext("a")).toBe("b");
      expect(pm.resolveNext("b")).toBe("c");
      expect(pm.resolveNext("c")).toBeUndefined();
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

    it("returns depth-first construction order for branched workflows with merge nodes interleaved", () => {
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
        "__branch-end-inner",
        "outer-y",
        "__branch-end-outer",
        "end",
      ]);
    });
  });

  describe("kind/run shape validation", () => {
    it("throws TypeError naming the phase id when a kind:code phase lacks run", () => {
      const phases: WorkflowPhase[] = [
        makePhase("a"),
        { id: "no-run", title: "No Run", kind: "code" },
        makePhase("b"),
      ];

      let error: unknown;
      try {
        new PhaseManager(phases);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(TypeError);
      expect(String((error as Error).message)).toContain("no-run");
    });

    it("throws TypeError when a code phase's run is not a function", () => {
      const phases: WorkflowPhase[] = [
        {
          id: "bad-run",
          title: "Bad Run",
          kind: "code",
          run: "not-a-function" as unknown as NonNullable<WorkflowPhase["run"]>,
        },
      ];

      expect(() => new PhaseManager(phases)).toThrow(TypeError);
    });

    it("throws TypeError naming the phase id and kind when a standard phase carries run", () => {
      const phases: WorkflowPhase[] = [
        makePhase("a"),
        {
          id: "stray-run",
          title: "Stray Run",
          kind: "standard",
          run: () => {},
        },
        makePhase("b"),
      ];

      let error: unknown;
      try {
        new PhaseManager(phases);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(TypeError);
      const message = String((error as Error).message);
      expect(message).toContain("stray-run");
      expect(message).toContain("standard");
    });

    it("throws TypeError when a phase with omitted kind carries run", () => {
      const phases: WorkflowPhase[] = [
        { id: "no-kind-run", title: "No Kind Run", run: () => {} },
      ];

      expect(() => new PhaseManager(phases)).toThrow(TypeError);
    });

    it("throws TypeError for a code phase nested in a branch arm that lacks run (recursion)", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf(
          "branch",
          [
            makePhase("x"),
            { id: "nested-code", title: "Nested Code", kind: "code" },
          ],
          [makePhase("y")],
        ),
      ];

      let error: unknown;
      try {
        new PhaseManager(phases);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(TypeError);
      expect(String((error as Error).message)).toContain("nested-code");
    });
  });

  describe("code-phase flattening and routing", () => {
    it("flattens a valid code phase as an ordinary node in construction order", () => {
      const phases: WorkflowPhase[] = [
        makePhase("a"),
        makeCodePhase("code-1"),
        makePhase("b"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual(["a", "code-1", "b"]);
      expect(pm.getPhase("code-1")).toBe(phases[1]);
    });

    it("routes through a code phase with linear successor links", () => {
      const phases: WorkflowPhase[] = [
        makePhase("a"),
        makeCodePhase("code-1"),
        makePhase("b"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("a")).toBe("code-1");
      expect(pm.resolveNext("code-1")).toBe("b");
      expect(pm.resolveNext("b")).toBeUndefined();
    });

    it("gives a code phase identical routing semantics to an equivalent standard phase", () => {
      const codePm = new PhaseManager([
        makePhase("a"),
        makeCodePhase("mid"),
        makePhase("b"),
      ]);
      const stdPm = new PhaseManager([
        makePhase("a"),
        makePhase("mid"),
        makePhase("b"),
      ]);

      expect(codePm.listIds()).toEqual(stdPm.listIds());
      for (const id of codePm.listIds()) {
        // No conditional routing: resolution without state matches standard phases exactly
        expect(codePm.resolveNext(id)).toBe(stdPm.resolveNext(id));
      }
    });

    it("flattens a valid code phase nested in a branch arm and routes it to the branch-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeBranchIf("branch", [makeCodePhase("arm-code")], [makePhase("y")]),
        makePhase("z"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "prev",
        "branch",
        "arm-code",
        "y",
        "__branch-end-branch",
        "z",
      ]);
      expect(pm.resolveNext("arm-code")).toBe("__branch-end-branch");
      expect(pm.resolveNext("__branch-end-branch")).toBe("z");
    });
  });

  describe("loop flattening", () => {
    beforeEach(() => {
      // Fresh singleton state — stateful loop-end assertions below pass
      // getState() so repeat writes land where the next test expects them.
      resetState();
    });

    it("flattens a simple loop with a synthetic loop-end merge node", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeLoop("loop", [makePhase("b1"), makePhase("b2")], () => true),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);

      // Registry contains the container and the synthetic loop-end merge node
      expect(pm.getPhase("loop")).toBe(phases[1]);
      const endPhase = pm.getPhase("__loop-end-loop");
      expect(endPhase).toBeDefined();
      expect(endPhase?.synthetic).toBe(true);
      expect(endPhase?.kind).toBe("code");
      expect(typeof endPhase?.run).toBe("function");
      expect(endPhase?.title).toBe("__loop-end-loop");

      // listIds DFS order: container, body, loop-end, successor
      expect(pm.listIds()).toEqual([
        "prev",
        "loop",
        "b1",
        "b2",
        "__loop-end-loop",
        "next",
      ]);

      // Container → body[0] is a plain linear link (do-while ≥1 pass), no state needed
      expect(pm.resolveNext("loop")).toBe("b1");
      // Body tail → loop-end is a state-independent linear link
      expect(pm.resolveNext("b1")).toBe("b2");
      expect(pm.resolveNext("b2")).toBe("__loop-end-loop");
      // Loop-end with live state and truthy condition repeats to body[0]
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("b1");
    });

    it("places the conditional entry on the loop-end, not the body tail", () => {
      let shouldRepeat = true;
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeLoop(
          "loop",
          [makePhase("b1"), makePhase("b2")],
          () => shouldRepeat,
        ),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);

      // Body-tail → loop-end resolution is state-independent (pure linear link)
      expect(pm.resolveNext("b2")).toBe("__loop-end-loop");
      expect(pm.resolveNext("b2", getState())).toBe("__loop-end-loop");

      // Loop-end resolution flips with the condition — proof the conditional
      // entry sits on the loop-end, not the body tail
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("b1");
      shouldRepeat = false;
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("next");
    });

    it("throws TypeError naming the block id and path when body is empty", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeLoop("loop", []),
        makePhase("next"),
      ];

      let message = "";
      try {
        new PhaseManager(phases);
      } catch (e) {
        expect(e).toBeInstanceOf(TypeError);
        message = String((e as Error).message);
      }
      expect(message).toBe('Loop phase "loop" at path: 1 has no "body"');
    });

    it("throws TypeError with the nested path for an empty body inside a branch arm", () => {
      const phases: WorkflowPhase[] = [
        makeBranchIf("branch", [makeLoop("loop", [])], [makePhase("y")]),
      ];

      let message = "";
      try {
        new PhaseManager(phases);
      } catch (e) {
        expect(e).toBeInstanceOf(TypeError);
        message = String((e as Error).message);
      }
      expect(message).toContain("loop");
      expect(message).toContain(".then");
    });

    it("throws TypeError when body is omitted", () => {
      const phase: WorkflowPhase = {
        id: "loop",
        title: "loop",
        kind: "loop" as const,
      };
      expect(() => new PhaseManager([phase])).toThrow(TypeError);
    });

    it("never makes the synthetic loop-end the first phase id", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.getFirstPhaseId()).toBe("loop");
    });

    it("suffixes the loop-end id when the reserved namespace is already occupied", () => {
      const phases: WorkflowPhase[] = [
        makePhase("__loop-end-a"),
        makeLoop("a", [makePhase("x")], () => false),
      ];
      const pm = new PhaseManager(phases);

      // The user-declared phase keeps the bare reserved id; the merge node
      // takes the -1 suffix and still acts as the loop's single decision node
      expect(pm.getPhase("__loop-end-a")).toBe(phases[0]);
      expect(pm.getPhase("__loop-end-a-1")?.synthetic).toBe(true);
      // Arm/tail wiring still converges on the suffixed merge node
      expect(pm.resolveNext("x")).toBe("__loop-end-a-1");
      // Falsy condition with no successor: the suffixed merge node exits to undefined
      expect(pm.resolveNext("__loop-end-a-1", getState())).toBeUndefined();
    });

    it("routes a loop inside a then arm through the arm's loop-end to the branch-end", () => {
      const phases: WorkflowPhase[] = [
        makePhase("start"),
        makeBranchIf(
          "outer",
          [makeLoop("loop", [makePhase("b1")], () => false)],
          [makePhase("y")],
        ),
        makePhase("end"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "start",
        "outer",
        "loop",
        "b1",
        "__loop-end-loop",
        "y",
        "__branch-end-outer",
        "end",
      ]);

      expect(pm.resolveNext("start")).toBe("outer");
      expect(pm.resolveNext("b1")).toBe("__loop-end-loop");
      // Falsy condition: the loop-end exits to the branch's branch-end
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe(
        "__branch-end-outer",
      );
      expect(pm.resolveNext("__branch-end-outer")).toBe("end");
    });

    it("routes a body containing code and branch phases through to the loop-end", () => {
      const phases: WorkflowPhase[] = [
        makePhase("start"),
        makeLoop(
          "loop",
          [
            makeCodePhase("code-1"),
            makeBranchIf("inner", [makePhase("x")], [makePhase("y")]),
          ],
          () => false,
        ),
        makePhase("end"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "start",
        "loop",
        "code-1",
        "inner",
        "x",
        "y",
        "__branch-end-inner",
        "__loop-end-loop",
        "end",
      ]);

      expect(pm.resolveNext("loop")).toBe("code-1");
      expect(pm.resolveNext("code-1")).toBe("inner");
      expect(pm.resolveNext("x")).toBe("__branch-end-inner");
      expect(pm.resolveNext("y")).toBe("__branch-end-inner");
      expect(pm.resolveNext("__branch-end-inner")).toBe("__loop-end-loop");
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("end");
    });

    it("routes a branch as the last body element (with else) to the loop-end", () => {
      const phases: WorkflowPhase[] = [
        makeLoop(
          "outer",
          [
            makePhase("b1"),
            makeBranchIf("last", [makePhase("x")], [makePhase("y")]),
          ],
          () => true,
        ),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("__branch-end-last")).toBe("__loop-end-outer");
      // The outer loop still repeats from that single terminal
      expect(pm.resolveNext("__loop-end-outer", getState())).toBe("b1");
    });

    it("routes a branch as the last body element (without else) to the loop-end", () => {
      const phases: WorkflowPhase[] = [
        makeLoop(
          "outer",
          [makePhase("b1"), makeBranchIf("last", [makePhase("x")])],
          () => true,
        ),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("__branch-end-last")).toBe("__loop-end-outer");
      expect(pm.resolveNext("__loop-end-outer", getState())).toBe("b1");
    });

    it("keeps nested loop-end entries distinct when a loop is the last body element", () => {
      const phases: WorkflowPhase[] = [
        makeLoop(
          "outer",
          [makeLoop("inner", [makePhase("i1")], () => true)],
          () => true,
        ),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.listIds()).toEqual([
        "outer",
        "inner",
        "i1",
        "__loop-end-inner",
        "__loop-end-outer",
      ]);

      // Inner's own conditional entry is NOT overwritten by the enclosing loop's
      expect(pm.resolveNext("__loop-end-inner", getState())).toBe("i1");
      // Outer repeats to its body[0] = the inner container
      expect(pm.resolveNext("__loop-end-outer", getState())).toBe("inner");
    });

    it("exits the inner nested loop to the outer loop-end when the inner condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makeLoop(
          "outer",
          [makeLoop("inner", [makePhase("i1")], () => false)],
          () => true,
        ),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("__loop-end-inner", getState())).toBe(
        "__loop-end-outer",
      );
    });

    it("exits a final-element loop to the terminal successor when the condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => false),
        makeCodePhase("__pio-exit"),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("__pio-exit");
    });

    it("exits a final-element loop at the cap to the terminal successor", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true, 2),
        makeCodePhase("__pio-exit"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      // First loop-end visit: repeat allowed (0 + 1 < 2)
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      // Second visit: capped (1 + 1 >= 2) → exit to the terminal successor
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("__pio-exit");
    });

    it("exits a final-element loop with no successor to undefined when the condition is falsy", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => false),
      ];
      const pm = new PhaseManager(phases);

      expect(pm.resolveNext("__loop-end-loop", getState())).toBeUndefined();
    });
  });

  describe("resolveNext with loop routing", () => {
    beforeEach(() => {
      // Restore delegation to the real resolveMaxIterations — a test-local
      // mockImplementation would otherwise leak into every later test — and
      // clear call history.
      // The vi.mock factory always sets `original` before any test runs.
      maxIterationsMock.fn.mockImplementation(maxIterationsMock.original!);
      maxIterationsMock.fn.mockClear();
      // Fresh full state between tests — these tests read the counter from
      // the state argument but write it via the setState singleton, so they
      // must pass the live singleton state (a detached stub would keep reads
      // at 0 while writes land on the singleton).
      resetState();
    });

    it("repeats when the variable-backed condition is truthy and exits when falsy", () => {
      const phases: WorkflowPhase[] = [
        makePhase("prev"),
        makeLoop("loop", [makePhase("b1")], (s) => s.store?.get("keep"), 5),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);

      // keep = true → repeat to loopTarget, counter increments to 1
      setState({
        store: {
          get: (name: string) => name === "keep",
        } as unknown as SessionVariableStore,
      });
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("b1");
      expect(getState().loopPasses.loop).toBe(1);

      // keep = false → exit to exitTarget, counter unchanged
      setState({
        store: {
          get: (name: string) => (name === "keep" ? false : undefined),
        } as unknown as SessionVariableStore,
      });
      expect(pm.resolveNext("__loop-end-loop", getState())).toBe("next");
      expect(getState().loopPasses.loop).toBe(1);
    });

    it("repeats until the cap when repeatWhile is omitted", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], undefined, 3),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("next");
      expect(state.loopPasses.loop).toBe(2);
    });

    it("runs exactly maxIterations full passes with an explicit maxIterations (off-by-one pinned)", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true, 3),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      // [repeat (counter 1), repeat (counter 2), exit] — final counter exactly 2
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(state.loopPasses.loop).toBe(1);
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(state.loopPasses.loop).toBe(2);
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("next");
      expect(state.loopPasses.loop).toBe(2);

      // Priority-1 override path: the explicit cap is passed on every evaluation
      expect(maxIterationsMock.fn.mock.calls).toEqual([[3], [3], [3]]);
    });

    it("repeats to the built-in default cap when maxIterations is omitted", () => {
      maxIterationsMock.fn.mockImplementation(() => 15);
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      // Repeats on evaluations 1–14 (counter reaches 14), exits on evaluation 15
      const results: string[] = [];
      for (let i = 0; i < 15; i++) {
        results.push(pm.resolveNext("__loop-end-loop", state) ?? "undefined");
      }
      expect(results).toEqual([...Array(14).fill("b1"), "next"]);
      expect(state.loopPasses.loop).toBe(14);

      // No block override: every evaluation resolved with undefined
      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(15);
      expect(
        maxIterationsMock.fn.mock.calls.every((c) => c[0] === undefined),
      ).toBe(true);
    });

    it("honors the config-resolved cap when maxIterations is omitted", () => {
      maxIterationsMock.fn.mockImplementation(() => 3);
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("b1");
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("next");
      expect(state.loopPasses.loop).toBe(2);

      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(3);
      expect(
        maxIterationsMock.fn.mock.calls.every((c) => c[0] === undefined),
      ).toBe(true);
    });

    it("resolves the cap once per loop-end evaluation, not at construction", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true, 3),
        makePhase("next"),
      ];

      // No cap resolution at construction time
      expect(maxIterationsMock.fn).not.toHaveBeenCalled();
      const pm = new PhaseManager(phases);
      expect(maxIterationsMock.fn).not.toHaveBeenCalled();

      // Exactly one resolution per loop-end evaluation — the capped exit
      // still resolves its cap first
      const state = getState();
      pm.resolveNext("__loop-end-loop", state); // repeat
      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(1);
      pm.resolveNext("__loop-end-loop", state); // repeat
      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(2);
      pm.resolveNext("__loop-end-loop", state); // capped exit
      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(3);
    });

    it("keeps per-block-id counters independent for sibling loops", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("first", [makePhase("f1")], () => true, 3),
        makeLoop("second", [makePhase("s1")], () => true, 3),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      // Drive the first loop to its cap: two repeats, then exit to the
      // successor (the second loop's container)
      expect(pm.resolveNext("__loop-end-first", state)).toBe("f1");
      expect(pm.resolveNext("__loop-end-first", state)).toBe("f1");
      expect(pm.resolveNext("__loop-end-first", state)).toBe("second");
      expect(state.loopPasses.first).toBe(2);

      // The second loop's counter is untouched — it still gets its full cap
      expect(state.loopPasses.second).toBeUndefined();
      expect(pm.resolveNext("__loop-end-second", state)).toBe("s1");
      expect(pm.resolveNext("__loop-end-second", state)).toBe("s1");
      expect(pm.resolveNext("__loop-end-second", state)).toBe("next");
      expect(state.loopPasses).toEqual({ first: 2, second: 2 });
    });

    it("exits on the first loop-end evaluation when the cap is 1", () => {
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true, 1),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      // Body ran exactly once; the first loop-end evaluation is already capped
      expect(pm.resolveNext("__loop-end-loop", state)).toBe("next");
      expect(state.loopPasses.loop).toBeUndefined();
    });

    it("warns and exits to the exitTarget when state is missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true, 3),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);

      const result = pm.resolveNext("__loop-end-loop");
      expect(result).toBe("next");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Missing-state exit happens before cap resolution
      expect(maxIterationsMock.fn).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("warns and exits to undefined for a final-element loop when state is missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        makeLoop("loop", [makePhase("b1")], () => true),
      ];
      const pm = new PhaseManager(phases);

      const result = pm.resolveNext("__loop-end-loop");
      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Missing-state exit happens before cap resolution
      expect(maxIterationsMock.fn).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("warns and exits without repeating when repeatWhile throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const phases: WorkflowPhase[] = [
        makeLoop(
          "loop",
          [makePhase("b1")],
          () => {
            throw new Error("boom");
          },
          3,
        ),
        makePhase("next"),
      ];
      const pm = new PhaseManager(phases);
      const state = getState();

      const result = pm.resolveNext("__loop-end-loop", state);
      expect(result).toBe("next");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain("boom");
      // Fail-safe: counter unchanged
      expect(state.loopPasses.loop).toBeUndefined();
      // The cap was resolved first
      expect(maxIterationsMock.fn).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });
});

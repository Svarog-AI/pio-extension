import { describe, expect, it } from "vitest";
import { getState } from "./session-state";
import type {
  BranchRouting,
  CodeStepContext,
  IfBranchRouting,
  LoopBackRouting,
  SwitchBranchRouting,
  WorkflowPhase,
} from "./workflow-types";

// ---------------------------------------------------------------------------
// Type-level tests — verify new branch types compile and have correct shape
// ---------------------------------------------------------------------------

describe("workflow-types branch extensions", () => {
  describe("WorkflowPhase.kind union", () => {
    it("accepts 'branch:if' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "branch-1",
        title: "If Branch",
        kind: "branch:if",
      };
      expect(phase.kind).toBe("branch:if");
    });

    it("accepts 'branch:switch' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "branch-2",
        title: "Switch Branch",
        kind: "branch:switch",
      };
      expect(phase.kind).toBe("branch:switch");
    });

    it("still accepts 'standard' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "normal",
        title: "Normal",
        kind: "standard",
      };
      expect(phase.kind).toBe("standard");
    });

    it("still accepts 'variable-definition' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "var-def",
        title: "Var Def",
        kind: "variable-definition",
      };
      expect(phase.kind).toBe("variable-definition");
    });

    it("allows kind to be omitted (optional field)", () => {
      const phase: WorkflowPhase = {
        id: "no-kind",
        title: "No Kind",
      };
      expect(phase.kind).toBeUndefined();
    });
  });

  describe("branch:if fields on WorkflowPhase", () => {
    it("accepts condition callback", () => {
      const phase: WorkflowPhase = {
        id: "if-branch",
        title: "If Branch",
        kind: "branch:if",
        condition: () => true,
      };
      expect(typeof phase.condition).toBe("function");
    });

    it("accepts then arm as WorkflowPhase[]", () => {
      const phase: WorkflowPhase = {
        id: "if-branch",
        title: "If Branch",
        kind: "branch:if",
        // biome-ignore lint/suspicious/noThenProperty: intentional test of WorkflowPhase.then field
        then: [{ id: "then-1", title: "Then 1" }],
      };
      expect(phase.then).toHaveLength(1);
      expect(phase.then![0].id).toBe("then-1");
    });

    it("accepts else arm as WorkflowPhase[]", () => {
      const phase: WorkflowPhase = {
        id: "if-branch",
        title: "If Branch",
        kind: "branch:if",
        else: [{ id: "else-1", title: "Else 1" }],
      };
      expect(phase.else).toHaveLength(1);
      expect(phase.else![0].id).toBe("else-1");
    });

    it("allows both then and else on the same phase", () => {
      const phase: WorkflowPhase = {
        id: "if-branch",
        title: "If Branch",
        kind: "branch:if",
        condition: () => true,
        // biome-ignore lint/suspicious/noThenProperty: intentional test of WorkflowPhase.then field
        then: [{ id: "then-1", title: "Then 1" }],
        else: [{ id: "else-1", title: "Else 1" }],
      };
      expect(phase.then).toHaveLength(1);
      expect(phase.else).toHaveLength(1);
    });
  });

  describe("branch:switch fields on WorkflowPhase", () => {
    it("accepts on as a callback", () => {
      const phase: WorkflowPhase = {
        id: "switch-branch",
        title: "Switch Branch",
        kind: "branch:switch",
        on: () => "value",
      };
      expect(typeof phase.on).toBe("function");
    });

    it("accepts on as a string ($varName form)", () => {
      const phase: WorkflowPhase = {
        id: "switch-branch",
        title: "Switch Branch",
        kind: "branch:switch",
        on: "$myVar",
      };
      expect(phase.on).toBe("$myVar");
    });

    it("accepts cases as Record<string, WorkflowPhase[]>", () => {
      const phase: WorkflowPhase = {
        id: "switch-branch",
        title: "Switch Branch",
        kind: "branch:switch",
        on: () => "a",
        cases: {
          a: [{ id: "case-a", title: "Case A" }],
          b: [{ id: "case-b", title: "Case B" }],
        },
      };
      expect(Object.keys(phase.cases!)).toHaveLength(2);
    });

    it("accepts defaultBranch as WorkflowPhase[]", () => {
      const phase: WorkflowPhase = {
        id: "switch-branch",
        title: "Switch Branch",
        kind: "branch:switch",
        on: () => "x",
        defaultBranch: [{ id: "default-1", title: "Default" }],
      };
      expect(phase.defaultBranch).toHaveLength(1);
    });
  });

  describe("IfBranchRouting", () => {
    it("requires thenFirst as string and allows optional elseFirst", () => {
      const routing: IfBranchRouting = {
        thenFirst: "then-phase-1",
        elseFirst: "else-phase-1",
      };
      expect(routing.thenFirst).toBe("then-phase-1");
      expect(routing.elseFirst).toBe("else-phase-1");
    });

    it("allows elseFirst to be omitted (trailing branch with no else and no successor)", () => {
      const routing: IfBranchRouting = {
        thenFirst: "then-phase-1",
      };
      expect(routing.thenFirst).toBe("then-phase-1");
      expect(routing.elseFirst).toBeUndefined();
    });
  });

  describe("SwitchBranchRouting", () => {
    it("requires caseFirst as Record<string, string> and optional defaultFirst", () => {
      const routing: SwitchBranchRouting = {
        caseFirst: { a: "case-a-1", b: "case-b-1" },
        defaultFirst: "default-1",
      };
      expect(routing.caseFirst.a).toBe("case-a-1");
      expect(routing.defaultFirst).toBe("default-1");
    });

    it("allows defaultFirst to be omitted", () => {
      const routing: SwitchBranchRouting = {
        caseFirst: { a: "case-a-1" },
      };
      expect(routing.caseFirst.a).toBe("case-a-1");
      expect(routing.defaultFirst).toBeUndefined();
    });
  });

  describe("BranchRouting union", () => {
    it("accepts IfBranchRouting as BranchRouting", () => {
      const routing: BranchRouting = {
        thenFirst: "t",
        elseFirst: "e",
      };
      expect(routing.thenFirst).toBe("t");
    });

    it("accepts SwitchBranchRouting as BranchRouting", () => {
      const routing: BranchRouting = {
        caseFirst: { x: "x-1" },
      };
      expect(routing.caseFirst.x).toBe("x-1");
    });
  });

  describe("code-step phase type", () => {
    it("accepts 'code' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "code-1",
        title: "Code Step",
        kind: "code",
      };
      expect(phase.kind).toBe("code");
    });

    it("accepts a synchronous run callback on a code phase", () => {
      const phase: WorkflowPhase = {
        id: "code-sync",
        title: "Sync Code",
        kind: "code",
        run: (ctx) => {
          // Type-level check: ctx exposes the full state
          expect(ctx.state.isActive).toBe(false);
        },
      };
      expect(typeof phase.run).toBe("function");
    });

    it("accepts an asynchronous run callback returning Promise<void>", async () => {
      const phase: WorkflowPhase = {
        id: "code-async",
        title: "Async Code",
        kind: "code",
        run: async (ctx) => {
          await Promise.resolve();
          expect(ctx.state.currentPhaseId).toBe("");
        },
      };
      const result = phase.run!({ state: getState() });
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it("accepts a literal { state } object as CodeStepContext", () => {
      const ctx: CodeStepContext = { state: getState() };
      expect(ctx.state).toBe(getState());
    });

    it("has exactly the single 'state' member (compile-time shape pin)", () => {
      // Fails to compile if a second member is added to CodeStepContext
      type IsExact<T, U> =
        (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
          ? true
          : false;
      const hasExactlyStateMember: IsExact<keyof CodeStepContext, "state"> =
        true;
      expect(hasExactlyStateMember).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    it("existing phases without branch fields still compile", () => {
      const phase: WorkflowPhase = {
        id: "old-phase",
        title: "Old Phase",
        instructions: "Do something",
        minIterations: 1,
        maxIterations: 3,
      };
      expect(phase.id).toBe("old-phase");
      expect(phase.kind).toBeUndefined();
      expect(phase.condition).toBeUndefined();
      expect(phase.then).toBeUndefined();
      expect(phase.else).toBeUndefined();
      expect(phase.on).toBeUndefined();
      expect(phase.cases).toBeUndefined();
      expect(phase.defaultBranch).toBeUndefined();
    });
  });

  describe("allowProjectWrites", () => {
    it("accepts allowProjectWrites as boolean on WorkflowPhase", () => {
      const phase: WorkflowPhase = {
        id: "write-gate",
        title: "Write Gate",
        allowProjectWrites: true,
      };
      expect(phase.allowProjectWrites).toBe(true);
    });

    it("allows allowProjectWrites to be false", () => {
      const phase: WorkflowPhase = {
        id: "no-writes",
        title: "No Writes",
        allowProjectWrites: false,
      };
      expect(phase.allowProjectWrites).toBe(false);
    });

    it("allows allowProjectWrites to be omitted (defaults to blocked via falsy)", () => {
      const phase: WorkflowPhase = {
        id: "default-blocked",
        title: "Default Blocked",
      };
      expect(phase.allowProjectWrites).toBeUndefined();
    });

    it("can coexist with write field on the same phase", () => {
      const phase: WorkflowPhase = {
        id: "combined",
        title: "Combined",
        write: ["TASK.md"],
        allowProjectWrites: true,
      };
      expect(phase.write).toEqual(["TASK.md"]);
      expect(phase.allowProjectWrites).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Type-level tests — verify loop block types compile and have correct shape
// ---------------------------------------------------------------------------

describe("workflow-types loop extensions", () => {
  describe("WorkflowPhase.kind union", () => {
    it("accepts 'loop' as a valid kind", () => {
      const phase: WorkflowPhase = {
        id: "loop-1",
        title: "Loop Block",
        kind: "loop",
      };
      expect(phase.kind).toBe("loop");
    });

    it("still accepts 'standard' as a valid kind (regression)", () => {
      const phase: WorkflowPhase = {
        id: "normal-2",
        title: "Normal",
        kind: "standard",
      };
      expect(phase.kind).toBe("standard");
    });
  });

  describe("loop block fields on WorkflowPhase", () => {
    it("accepts body as WorkflowPhase[]", () => {
      const phase: WorkflowPhase = {
        id: "loop-1",
        title: "Loop Block",
        kind: "loop",
        body: [{ id: "loop-body-1", title: "Body" }],
      };
      expect(phase.body).toHaveLength(1);
      expect(phase.body![0].id).toBe("loop-body-1");
    });

    it("accepts a repeatWhile callback", () => {
      const phase: WorkflowPhase = {
        id: "loop-2",
        title: "Loop Block",
        kind: "loop",
        body: [{ id: "loop-body-2", title: "Body" }],
        repeatWhile: () => true,
      };
      expect(typeof phase.repeatWhile).toBe("function");
    });

    it("accepts synthetic: true", () => {
      const phase: WorkflowPhase = {
        id: "synth-1",
        title: "Synthetic Phase",
        synthetic: true,
      };
      expect(phase.synthetic).toBe(true);
    });

    it("accepts synthetic: false", () => {
      const phase: WorkflowPhase = {
        id: "synth-2",
        title: "Not Synthetic",
        synthetic: false,
      };
      expect(phase.synthetic).toBe(false);
    });

    it("allows synthetic to be omitted", () => {
      const phase: WorkflowPhase = {
        id: "no-synth",
        title: "No Synthetic Flag",
      };
      expect(phase.synthetic).toBeUndefined();
    });
  });

  describe("LoopBackRouting", () => {
    it("accepts a full object with all five fields and round-trips values", () => {
      const routing: LoopBackRouting = {
        loopTarget: "body-1",
        exitTarget: "after-loop",
        repeatWhile: () => true,
        maxPasses: 5,
        loopId: "loop-block-1",
      };
      expect(routing.loopTarget).toBe("body-1");
      expect(routing.exitTarget).toBe("after-loop");
      expect(typeof routing.repeatWhile).toBe("function");
      expect(routing.maxPasses).toBe(5);
      expect(routing.loopId).toBe("loop-block-1");
    });

    it("accepts the minimal object { loopTarget, loopId } (rest omitted)", () => {
      const routing: LoopBackRouting = {
        loopTarget: "body-1",
        loopId: "loop-block-2",
      };
      expect(routing.loopTarget).toBe("body-1");
      expect(routing.exitTarget).toBeUndefined();
      expect(routing.repeatWhile).toBeUndefined();
      expect(routing.maxPasses).toBeUndefined();
    });

    it("requires loopTarget (missing → compile error)", () => {
      // @ts-expect-error — testing that loopTarget is required on LoopBackRouting
      const routing: LoopBackRouting = { loopId: "loop-block-3" };
      expect(routing.loopId).toBe("loop-block-3");
    });

    it("requires loopId (missing → compile error)", () => {
      // @ts-expect-error — testing that loopId is required on LoopBackRouting
      const routing: LoopBackRouting = { loopTarget: "body-1" };
      expect(routing.loopTarget).toBe("body-1");
    });

    it("requires loopTarget to be a string (number → compile error)", () => {
      const routing: LoopBackRouting = {
        // @ts-expect-error — testing that loopTarget must be a string, not a number
        loopTarget: 42,
        loopId: "loop-block-4",
      };
      expect(routing.loopId).toBe("loop-block-4");
    });
  });

  describe("BranchRouting union", () => {
    it("accepts a LoopBackRouting literal as BranchRouting (structural discrimination)", () => {
      const routing: BranchRouting = {
        loopTarget: "body-1",
        exitTarget: "after-loop",
        maxPasses: 3,
        loopId: "loop-block-5",
      };
      expect(routing.loopTarget).toBe("body-1");
    });
  });
});

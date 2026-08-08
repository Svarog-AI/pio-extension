import { describe, expect, it } from "vitest";
import type {
  BranchRouting,
  IfBranchRouting,
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
    it("requires thenFirst and elseFirst as strings", () => {
      const routing: IfBranchRouting = {
        thenFirst: "then-phase-1",
        elseFirst: "else-phase-1",
      };
      expect(routing.thenFirst).toBe("then-phase-1");
      expect(routing.elseFirst).toBe("else-phase-1");
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
});

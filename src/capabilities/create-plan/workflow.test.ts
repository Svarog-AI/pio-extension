import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { PioSessionState } from "../../runtime/session-state";
import { SessionVariableStore } from "../../runtime/session-store";
import type { WorkflowPhase } from "../../runtime/workflow-types";
import workflow from "./workflow";

// ---------------------------------------------------------------------------
// Helpers — build a fake PioSessionState and invoke code-phase run() callbacks
// through the public surface only.
// ---------------------------------------------------------------------------

function makeStore(): SessionVariableStore {
  return new SessionVariableStore({});
}

function makeState(
  overrides: {
    store?: SessionVariableStore;
    sessionId?: string;
    filesWritten?: string[];
    askUserCalled?: boolean;
  } = {},
): PioSessionState {
  return {
    store: overrides.store ?? makeStore(),
    sessionId: overrides.sessionId,
    filesWritten: overrides.filesWritten ?? [],
    askUserCalled: overrides.askUserCalled ?? false,
  } as unknown as PioSessionState;
}

/** Run a `kind: "code"` phase's run() inline against a state. */
function runCode(phase: WorkflowPhase, state: PioSessionState): void {
  const run = phase.run as
    | ((ctx: { state: PioSessionState }) => void | Promise<void>)
    | undefined;
  run?.({ state });
}

// ---------------------------------------------------------------------------
// Phase references by structural position
// ---------------------------------------------------------------------------

const setupPhase = workflow[0];
const readGoalPhase = workflow[1];
const researchPhase = workflow[2];
const validatePhase = workflow[3];
const writePlanPhase = workflow[4];

// ---------------------------------------------------------------------------
// default-setup — session-scoped scratch dir + notes_path store variable
// ---------------------------------------------------------------------------

describe("default-setup", () => {
  it("is a code phase that creates the session-scoped scratch dir and sets notes_path", () => {
    expect(setupPhase.kind).toBe("code");
    const state = makeState({ sessionId: "sess-123" });
    runCode(setupPhase, state);
    const notesPath = state.store?.get("notes_path") as string;
    expect(typeof notesPath).toBe("string");
    expect(notesPath).toBe("/tmp/pio-create-plan/sess-123/notes.md");
    expect(fs.existsSync(path.dirname(notesPath))).toBe(true);
  });

  it("derives the scratch dir from the session id", () => {
    const state = makeState({ sessionId: "other-session" });
    runCode(setupPhase, state);
    expect(state.store?.get("notes_path")).toBe(
      "/tmp/pio-create-plan/other-session/notes.md",
    );
  });

  it("has no agent-facing loop fields or write gates", () => {
    expect(setupPhase.maxIterations).toBeUndefined();
    expect(setupPhase.minIterations).toBeUndefined();
    expect(setupPhase.loopWhile).toBeUndefined();
    expect(setupPhase.terminateWhen).toBeUndefined();
    expect(setupPhase.write).toBeUndefined();
    expect(setupPhase.allowProjectWrites).toBeUndefined();
    expect(setupPhase.instructions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// read-goal — lean single-pass contract entry (no loop fields, no write gates)
// ---------------------------------------------------------------------------

describe("read-goal", () => {
  it("is a lean standard phase with no loop fields and no write gates", () => {
    expect(readGoalPhase.id).toBe("read-goal");
    expect(readGoalPhase.kind).toBeUndefined();
    expect(readGoalPhase.maxIterations).toBeUndefined();
    expect(readGoalPhase.minIterations).toBeUndefined();
    expect(readGoalPhase.loopWhile).toBeUndefined();
    expect(readGoalPhase.terminateWhen).toBeUndefined();
    expect(readGoalPhase.write).toBeUndefined();
    expect(readGoalPhase.allowProjectWrites).toBeUndefined();
  });

  it("instructs internalizing the Current State and To-Be State and reading PROJECT/OVERVIEW.md", () => {
    const instr = readGoalPhase.instructions as string;
    expect(instr).toContain("goal");
    expect(instr).toContain("Current State");
    expect(instr).toContain("To-Be State");
    expect(instr).toContain("OVERVIEW.md");
    expect(instr).not.toContain("signal-completion");
  });
});

// ---------------------------------------------------------------------------
// deep-research — exhaustion loop (evidence-fixpoint) on the scratch notes file
// ---------------------------------------------------------------------------

describe("deep-research", () => {
  it("is a standard phase with maxIterations and a single loopWhile callback on notes.md", () => {
    expect(researchPhase.id).toBe("deep-research");
    expect(researchPhase.kind).toBeUndefined();
    expect(researchPhase.maxIterations).toBe(8);
    expect(researchPhase.minIterations).toBeUndefined();
    expect(researchPhase.terminateWhen).toBeUndefined();
    expect(researchPhase.write).toBeUndefined();
    expect(researchPhase.allowProjectWrites).toBeUndefined();
    expect(researchPhase.loopWhile).toHaveLength(1);
  });

  it("replays when the just-finished run wrote notes.md; advances on silence (total)", () => {
    const cb = researchPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // nothing written → advance (silent run = evidence-fixpoint)
    expect(cb(makeState())).toBe(false);
    // some other file written → advance (only notes.md counts)
    expect(cb(makeState({ filesWritten: ["/tmp/other.md"] }))).toBe(false);
    // notes.md written → replay (more research to record)
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-create-plan/s/notes.md"] })),
    ).toBe(true);
  });

  it("is total — never throws on any filesWritten shape", () => {
    const cb = researchPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(() => cb(makeState())).not.toThrow();
    expect(() =>
      cb(makeState({ filesWritten: ["a", "b", "c/notes.md"] })),
    ).not.toThrow();
  });

  it("carries a non-empty evidence-fixpoint loopMessage that nudges re-checking", () => {
    const msg = researchPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain(`\${notes_path}`);
    expect(msg.toLowerCase()).toContain("another look");
    expect(msg).toContain("nothing new");
  });

  it("instructions demand evidence with a source and reference notes_path", () => {
    const instr = researchPhase.instructions as string;
    expect(instr).toContain(`\${notes_path}`);
    expect(instr).toContain("evidence");
    expect(instr).toContain("repo path");
    expect(instr).toContain("web URL");
    expect(instr).toContain("web_search");
    // web research is for assumptions unanswerable from code, not required for codebase facts
    expect(instr).toContain("not");
  });

  it("preserves the per-phase pio-planning skill plus source-research for external libraries", () => {
    expect(researchPhase.skills?.mandatory).toEqual(["pio-planning"]);
    expect(researchPhase.skills?.recommended).toEqual([
      { name: "source-research", condition: expect.any(String) },
    ]);
  });
});

// ---------------------------------------------------------------------------
// validate-assumptions — exhaustion loop on askUserCalled (silence advances)
// ---------------------------------------------------------------------------

describe("validate-assumptions", () => {
  it("is a standard phase with maxIterations and a single loopWhile callback on askUserCalled", () => {
    expect(validatePhase.id).toBe("validate-assumptions");
    expect(validatePhase.kind).toBeUndefined();
    expect(validatePhase.maxIterations).toBe(6);
    expect(validatePhase.minIterations).toBeUndefined();
    expect(validatePhase.write).toBeUndefined();
    expect(validatePhase.allowProjectWrites).toBeUndefined();
    expect(validatePhase.loopWhile).toHaveLength(1);
    expect(validatePhase.terminateWhen).toBeUndefined();
  });

  it("replays when the just-finished run asked the user; a silent run advances (total)", () => {
    const cb = validatePhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // asked → replay (more to confirm)
    expect(cb(makeState({ askUserCalled: true }))).toBe(true);
    // silent → advance (silence = legitimate end state)
    expect(cb(makeState({ askUserCalled: false }))).toBe(false);
    // total — never throws
    expect(() => cb(makeState())).not.toThrow();
  });

  it("uses loopWhile(askUserCalled), NOT terminateWhen(askUserCalled) (stall warning)", () => {
    expect(validatePhase.terminateWhen).toBeUndefined();
  });

  it("carries a non-empty exhaustion loopMessage that ends without asking when none remain", () => {
    const msg = validatePhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toContain("without asking");
  });

  it("instructions use grill-me probing, inline ask_user, and user-answer-as-evidence", () => {
    const instr = validatePhase.instructions as string;
    expect(instr).toContain(`\${notes_path}`);
    expect(instr).toContain("grill-me");
    expect(instr).toContain('displayMode: "inline"');
    expect(instr).toContain("evidence");
    expect(instr).toContain("without asking");
  });

  it("preserves the per-phase grill-me skill", () => {
    expect(validatePhase.skills?.mandatory).toEqual(["grill-me"]);
  });
});

// ---------------------------------------------------------------------------
// write-plan — single-output write gate + exhaustion loop on PLAN.md +
// final-consistency-review + subgoal classification
// ---------------------------------------------------------------------------

describe("write-plan", () => {
  it("is the contract-output-writing phase gated to exactly ['plan'] with no allowProjectWrites", () => {
    expect(writePlanPhase.id).toBe("write-plan");
    expect(writePlanPhase.kind).toBeUndefined();
    expect(writePlanPhase.write).toEqual(["plan"]);
    expect(writePlanPhase.allowProjectWrites).toBeUndefined();
  });

  it("is a standard phase with maxIterations and a single loopWhile callback on PLAN.md", () => {
    expect(writePlanPhase.maxIterations).toBe(8);
    expect(writePlanPhase.minIterations).toBeUndefined();
    expect(writePlanPhase.terminateWhen).toBeUndefined();
    expect(writePlanPhase.loopWhile).toHaveLength(1);
  });

  it("replays when the just-finished run wrote PLAN.md; a clean review pass advances (total)", () => {
    const cb = writePlanPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // nothing written → advance (clean review pass)
    expect(cb(makeState())).toBe(false);
    // some other file written → advance (only PLAN.md counts)
    expect(cb(makeState({ filesWritten: ["/tmp/notes.md"] }))).toBe(false);
    // PLAN.md written → replay for another review pass
    expect(cb(makeState({ filesWritten: ["/x/goals/g/PLAN.md"] }))).toBe(true);
    // total — never throws
    expect(() => cb(makeState())).not.toThrow();
  });

  it("carries a non-empty review-nudge loopMessage", () => {
    const msg = writePlanPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toContain("another look");
  });

  it("instructions carry the step-design + PLAN.md-structure + subgoal classification guidance", () => {
    const instr = writePlanPhase.instructions as string;
    expect(instr).toContain(`\${notes_path}`);
    expect(instr).toContain("totalSteps");
    expect(instr).toContain("steps");
    expect(instr).toContain("PLAN.md");
    expect(instr).toContain("complexity");
    expect(instr).toContain("subgoal");
    expect(instr).toContain("name");
  });

  it("instructions carry the full final-consistency-review protocol", () => {
    const instr = writePlanPhase.instructions as string;
    expect(instr).toContain("outcomes not covered");
    expect(instr).toContain("order of steps wrong or impossible");
    expect(instr).toContain("final outcome not satisfying the goal");
    expect(instr).toContain("explicit unit-test steps");
    expect(instr).toContain("Filter");
    expect(instr).toContain("consequential");
    expect(instr).toContain("web_search");
    expect(instr).toContain("code_search");
    expect(instr).toContain('displayMode: "inline"');
  });

  it("preserves the per-phase pio-planning skill", () => {
    expect(writePlanPhase.skills?.mandatory).toEqual(["pio-planning"]);
  });
});

// ---------------------------------------------------------------------------
// Structure pins
// ---------------------------------------------------------------------------

describe("workflow structure", () => {
  const expectedTopLevel = [
    "default-setup",
    "read-goal",
    "deep-research",
    "validate-assumptions",
    "write-plan",
  ];

  it("has 5 top-level phases in order with correct kinds", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBe("code");
    expect(workflow[1].kind).toBeUndefined();
    expect(workflow[2].kind).toBeUndefined();
    expect(workflow[3].kind).toBeUndefined();
    expect(workflow[4].kind).toBeUndefined();
  });

  it("declares no allowProjectWrites anywhere", () => {
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.allowProjectWrites).toBeUndefined();
        if (p.body) visit(p.body);
        if (p.then) visit(p.then);
        if (p.else) visit(p.else);
      }
    };
    visit(workflow);
  });

  it("references no old phase ids, signal-completion, or pio_mark_complete anywhere", () => {
    // Built via concatenation so the literal strings don't appear in the file
    // (the capability contract forbids them directory-wide).
    const SIGNAL = ["signal", "-completion"].join("");
    const MARK = ["pio_mark", "_complete"].join("");
    const OLD_IDS = new RegExp(
      [SIGNAL, "self-review", "design-steps", "write-updates"].join("|"),
    );
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.id).not.toMatch(OLD_IDS);
        if (p.instructions) {
          expect(p.instructions).not.toContain(MARK);
          expect(p.instructions).not.toContain(SIGNAL);
        }
        if (p.body) visit(p.body);
        if (p.then) visit(p.then);
        if (p.else) visit(p.else);
      }
    };
    visit(workflow);
  });
});

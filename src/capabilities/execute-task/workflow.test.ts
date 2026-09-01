import * as os from "node:os";
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
    projectRoot?: string;
    filesWritten?: string[];
    askUserCalled?: boolean;
  } = {},
): PioSessionState {
  const store = overrides.store ?? makeStore();
  // Mirror default-setup: declare the durable arrays so store.get(...)
  // resolves to [] when unset rather than undefined.
  store.declare("tasks", "array");
  store.declare("research_notes", "array");
  return {
    store,
    sessionId: overrides.sessionId,
    projectRoot: overrides.projectRoot,
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

/** Set a boolean store variable (mirrors what the LLM does via setVar). */
function setBool(state: PioSessionState, name: string, value: boolean): void {
  state.store?.set(name, "boolean", value);
}

// ---------------------------------------------------------------------------
// Phase references by structural position
// ---------------------------------------------------------------------------

const readTaskPhase = workflow[0];
const setupPhase = workflow[1];
const researchPhase = workflow[2];
const iterativeTddPhase = workflow[3];
const writeTestFilePhase = workflow[4];
const commitPhase = workflow[5];
const captureHashPhase = workflow[6];
const pushPhase = workflow[7];
const writeSummaryPhase = workflow[8];

/** A phase inside the inner tdd-process loop, keyed by id. */
const tddBodyById = (id: string): WorkflowPhase =>
  (iterativeTddPhase.body?.[2].body ?? []).find((p) => p.id === id)!;

/** The first phase of a refinement loop's body (the rich standard phase). */
const refinementWorkPhase = (loopId: string): WorkflowPhase =>
  (tddBodyById(loopId).body ?? [])[0];

// ---------------------------------------------------------------------------
// read-task — lean single-pass contract entry (no goal/plan, no loop fields)
// ---------------------------------------------------------------------------

describe("read-task", () => {
  it("is a lean standard phase with no loop fields and no write gates", () => {
    expect(readTaskPhase.id).toBe("read-task");
    expect(readTaskPhase.kind).toBeUndefined();
    expect(readTaskPhase.maxIterations).toBeUndefined();
    expect(readTaskPhase.minIterations).toBeUndefined();
    expect(readTaskPhase.loopWhile).toBeUndefined();
    expect(readTaskPhase.terminateWhen).toBeUndefined();
    expect(readTaskPhase.write).toBeUndefined();
    expect(readTaskPhase.allowProjectWrites).toBeUndefined();
  });

  it("reads the task input and does NOT reference a goal/plan file", () => {
    const instr = readTaskPhase.instructions as string;
    expect(instr).toContain("task");
    expect(instr).toContain("OVERVIEW.md");
    // execute-task's sole input is `task`; it must not read a goal/plan
    expect(instr).not.toContain("GOAL.md");
    expect(instr).not.toContain("PLAN.md");
    expect(instr).not.toContain("read-goal-and-plan");
  });
});

// ---------------------------------------------------------------------------
// default-setup — declares the durable store arrays (no scratch dir, no notes)
// ---------------------------------------------------------------------------

describe("default-setup", () => {
  it("is a code phase", () => {
    expect(setupPhase.kind).toBe("code");
  });

  it("declares the durable arrays so store.get resolves to [] when unset", () => {
    const state = makeState({ sessionId: "sess-123" });
    runCode(setupPhase, state);
    expect(state.store?.get("tasks")).toEqual([]);
    expect(state.store?.get("research_notes")).toEqual([]);
  });

  it("does not create a scratch dir or set a notes_path variable", () => {
    // Unique session id so a leftover dir from a prior implementation run can't
    // cause a false positive.
    const sid = `no-scratch-${Date.now()}`;
    const state = makeState({ sessionId: sid });
    runCode(setupPhase, state);
    expect(state.store?.get("notes_path")).toBeUndefined();
    // No /tmp scratch dir is created — all state is store-backed.
    expect(fsScratchExists(sid)).toBe(false);
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
// research-context — do-while loop: research accumulates evidence into a
// store variable; research-complete sets the completion boolean
// ---------------------------------------------------------------------------

describe("research-context", () => {
  it("is a kind:loop do-while block with maxIterations and a total repeatWhile on research_complete", () => {
    expect(researchPhase.id).toBe("research-context");
    expect(researchPhase.kind).toBe("loop");
    expect(researchPhase.maxIterations).toBe(8);
    expect(researchPhase.loopWhile).toBeUndefined();
    expect(researchPhase.write).toBeUndefined();
    expect(researchPhase.allowProjectWrites).toBeUndefined();
    expect(researchPhase.body).toHaveLength(2);
  });

  it("repeats while research_complete is not true; advances when true (total)", () => {
    const cb = researchPhase.repeatWhile as (s: PioSessionState) => boolean;
    const withComplete = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "research_complete", val);
      return state;
    };
    // unset (not declared yet) or false → repeat (research not complete)
    expect(cb(makeState())).toBe(true);
    expect(cb(withComplete(false))).toBe(true);
    // true → advance (research complete)
    expect(cb(withComplete(true))).toBe(false);
    // total — never throws on missing state/store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body is a research variable phase followed by a research-complete variable phase", () => {
    expect(researchPhase.body?.[0].id).toBe("research");
    expect(researchPhase.body?.[0].kind).toBe("variable-definition");
    expect(researchPhase.body?.[0].variables?.[0]).toMatchObject({
      name: "research_notes",
      type: "array",
      kind: "llm",
    });
    expect(researchPhase.body?.[1].id).toBe("research-complete");
    expect(researchPhase.body?.[1].kind).toBe("variable-definition");
    expect(researchPhase.body?.[1].variables?.[0]).toMatchObject({
      name: "research_complete",
      type: "boolean",
      kind: "llm",
    });
  });

  it("research description demands evidence with a source accumulated into research_notes", () => {
    const desc = researchPhase.body?.[0].variables?.[0].description as string;
    expect(desc).toContain("research_notes");
    expect(desc).toContain("evidence");
    expect(desc).toContain("repo path");
    expect(desc).toContain("web URL");
    expect(desc).toContain("web_search");
    expect(desc).toContain('displayMode: "inline"');
    // No scratch notes file path is referenced anywhere.
    expect(desc).not.toContain("notes.md");
    expect(desc).not.toContain("/tmp/");
  });

  it("research-complete description directs setting true only when nothing is missing/unanswered", () => {
    const desc = researchPhase.body?.[1].variables?.[0].description as string;
    expect(desc).toContain("research_notes");
    expect(desc).toContain("true");
    expect(desc).toContain("nothing missing");
    expect(desc).toContain("web_search");
  });

  it("carries a non-empty loopMessage nudging further research", () => {
    const msg = researchPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// iterative-tdd (outer loop) — task-generation + inner tdd-process +
// verify-acceptance-criteria + finalize-tasks; store-backed repeatWhile
// ---------------------------------------------------------------------------

describe("iterative-tdd (outer loop)", () => {
  it("is a kind:loop do-while block with a high maxIterations cap and a total store-backed repeatWhile", () => {
    expect(iterativeTddPhase.id).toBe("iterative-tdd");
    expect(iterativeTddPhase.kind).toBe("loop");
    // Unbounded iterations aren't supported, so the outer loop uses a high
    // safety-net cap (it should normally end via the repeatWhile store check).
    expect(iterativeTddPhase.maxIterations).toBeGreaterThanOrEqual(1000);
    expect(iterativeTddPhase.body).toHaveLength(5);
  });

  it("advances when all tasks are verified or any is blocked; repeats otherwise (total, store-backed)", () => {
    const cb = iterativeTddPhase.repeatWhile as (s: PioSessionState) => boolean;
    const withTasks = (tasks: unknown[]) => {
      const state = makeState();
      state.store?.set("tasks", "array", tasks);
      return state;
    };
    // all verified → advance (stop repeating)
    expect(cb(withTasks([{ name: "A", status: "verified" }]))).toBe(false);
    // any blocked → advance
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "blocked" },
        ]),
      ),
    ).toBe(false);
    // pending work remains → repeat
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "pending" },
        ]),
      ),
    ).toBe(true);
    // any task neither verified nor blocked (e.g. an unrecognized status) → repeat
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "queued" },
        ]),
      ),
    ).toBe(true);
    // empty array (nothing seeded yet) → repeat (first pass)
    expect(cb(makeState())).toBe(true);
    // total — never throws on missing state/store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains task-generation, select-task, the inner tdd-process loop, verify-acceptance-criteria, and finalize-tasks", () => {
    expect(iterativeTddPhase.body?.map((p) => p.id)).toEqual([
      "task-generation",
      "select-task",
      "tdd-process",
      "verify-acceptance-criteria",
      "finalize-tasks",
    ]);
  });

  it("carries a non-empty loopMessage nudging continuation", () => {
    const msg = iterativeTddPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// task-generation — do-while refinement loop over the task list (store-backed)
// ---------------------------------------------------------------------------

describe("task-generation", () => {
  const phase = iterativeTddPhase.body?.[0];

  it("is a kind:loop refinement block with a total repeatWhile on task_list_refined", () => {
    expect(phase?.id).toBe("task-generation");
    expect(phase?.kind).toBe("loop");
    expect(phase?.maxIterations).toBeGreaterThanOrEqual(4);
    expect(phase?.body).toHaveLength(2);
  });

  it("repeats while task_list_refined is not true; advances when true (total)", () => {
    const cb = phase?.repeatWhile as (s: PioSessionState) => boolean;
    const withRefined = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "task_list_refined", val);
      return state;
    };
    // unset (not declared) or false → repeat (list not well-formed)
    expect(cb(makeState())).toBe(true);
    expect(cb(withRefined(false))).toBe(true);
    // true → advance (list well-formed)
    expect(cb(withRefined(true))).toBe(false);
    // total — never throws on missing state/store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body is generate-tasks (sets tasks) followed by tasks-refined (sets task_list_refined)", () => {
    expect(phase?.body?.[0].id).toBe("generate-tasks");
    expect(phase?.body?.[0].kind).toBe("variable-definition");
    expect(phase?.body?.[0].variables?.[0]).toMatchObject({
      name: "tasks",
      type: "array",
      kind: "llm",
    });
    expect(phase?.body?.[1].id).toBe("tasks-refined");
    expect(phase?.body?.[1].kind).toBe("variable-definition");
    expect(phase?.body?.[1].variables?.[0]).toMatchObject({
      name: "task_list_refined",
      type: "boolean",
      kind: "llm",
    });
  });

  it("tasks-refined description directs reviewing ordering and feasibility", () => {
    const desc = phase?.body?.[1].variables?.[0].description as string;
    expect(desc).toContain("dependency");
    expect(desc).toContain("feasible");
  });
});

// ---------------------------------------------------------------------------
// select-task — programmatic task selection (code phase)
// ---------------------------------------------------------------------------

describe("select-task", () => {
  const phase = iterativeTddPhase.body?.[1];

  it("is a code phase", () => {
    expect(phase?.id).toBe("select-task");
    expect(phase?.kind).toBe("code");
  });

  it("selects the first pending task and sets current_task without modifying statuses", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [
      { name: "First", status: "pending" },
      { name: "Second", status: "pending" },
    ]);
    runCode(phase!, state);
    expect(state.store?.get("current_task")).toBe("First");
    // select-task only sets current_task; it does not touch statuses.
    expect(state.store?.get("tasks")).toEqual([
      { name: "First", status: "pending" },
      { name: "Second", status: "pending" },
    ]);
  });

  it("skips already-verified tasks and picks the next pending one", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [
      { name: "Done", status: "verified" },
      { name: "Next", status: "pending" },
    ]);
    runCode(phase!, state);
    expect(state.store?.get("current_task")).toBe("Next");
  });

  it("is total when there is no task array", () => {
    const state = makeState();
    expect(() => runCode(phase!, state)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// finalize-tasks — programmatic terminal decision from the store verdict
// booleans (code phase)
// ---------------------------------------------------------------------------

describe("finalize-tasks", () => {
  const phase = iterativeTddPhase.body?.[4];

  it("is a code phase", () => {
    expect(phase?.id).toBe("finalize-tasks");
    expect(phase?.kind).toBe("code");
  });

  it("reconciles the current task (matched by name) to verified from task_verified and resets the verdicts", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [{ name: "One", status: "pending" }]);
    state.store?.set("current_task", "string", "One");
    setBool(state, "task_verified", true);
    runCode(phase!, state);
    expect(state.store?.get("tasks")).toEqual([
      { name: "One", status: "verified" },
    ]);
    // verdict booleans are reset for the next task
    expect(state.store?.get("task_verified")).toBe(false);
    expect(state.store?.get("task_blocked")).toBe(false);
  });

  it("reconciles the current task (matched by name) to blocked from task_blocked", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [{ name: "One", status: "pending" }]);
    state.store?.set("current_task", "string", "One");
    setBool(state, "task_blocked", true);
    runCode(phase!, state);
    expect(state.store?.get("tasks")).toEqual([
      { name: "One", status: "blocked" },
    ]);
  });

  it("reconciles the current task (matched by name) to blocked from acceptance_blocked", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [{ name: "One", status: "pending" }]);
    state.store?.set("current_task", "string", "One");
    setBool(state, "acceptance_blocked", true);
    runCode(phase!, state);
    expect(state.store?.get("tasks")).toEqual([
      { name: "One", status: "blocked" },
    ]);
  });

  it("blocks a non-verified task when acceptance_blocked is set but the current task is not matched", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [{ name: "One", status: "pending" }]);
    // no current_task → no name match, so acceptance_blocked blocks the first
    // non-verified task.
    setBool(state, "acceptance_blocked", true);
    runCode(phase!, state);
    expect(state.store?.get("tasks")).toEqual([
      { name: "One", status: "blocked" },
    ]);
  });

  it("leaves pending work untouched when the current task is verified, and resets verdicts", () => {
    const state = makeState();
    state.store?.set("tasks", "array", [
      { name: "One", status: "pending" },
      { name: "Two", status: "pending" },
    ]);
    state.store?.set("current_task", "string", "One");
    setBool(state, "task_verified", true);
    runCode(phase!, state);
    expect(state.store?.get("tasks")).toEqual([
      { name: "One", status: "verified" },
      { name: "Two", status: "pending" },
    ]);
    expect(state.store?.get("task_verified")).toBe(false);
  });

  it("is total when there is no in-memory task array", () => {
    const state = makeState();
    expect(() => runCode(phase!, state)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tdd-process (inner loop) — 6-phase TDD body; repeats until the store
// verdict (task_verified/task_blocked) is set
// ---------------------------------------------------------------------------

describe("tdd-process (inner loop)", () => {
  const inner = iterativeTddPhase.body?.[2];

  it("is a kind:loop do-while block with min/max iterations and a total store-backed repeatWhile", () => {
    expect(inner?.id).toBe("tdd-process");
    expect(inner?.kind).toBe("loop");
    expect(inner?.minIterations).toBe(1);
    expect(inner?.maxIterations).toBe(6);
    expect(inner?.body).toHaveLength(6);
  });

  it("advances when task_verified or task_blocked is set; repeats otherwise (total, store-backed)", () => {
    const cb = inner?.repeatWhile as (s: PioSessionState) => boolean;
    const withVerdict = (verified?: boolean, blocked?: boolean) => {
      const state = makeState();
      if (verified !== undefined) setBool(state, "task_verified", verified);
      if (blocked !== undefined) setBool(state, "task_blocked", blocked);
      return state;
    };
    // neither verdict → repeat (task not yet verified)
    expect(cb(makeState())).toBe(true);
    expect(cb(withVerdict(false, false))).toBe(true);
    // verified or blocked → advance
    expect(cb(withVerdict(true))).toBe(false);
    expect(cb(withVerdict(undefined, true))).toBe(false);
    // total — never throws on missing store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains the 6 TDD phases in order", () => {
    expect(inner?.body?.map((p) => p.id)).toEqual([
      "write-tests-loop",
      "implement-loop",
      "verify-green",
      "refactor-loop",
      "verify-final",
      "task-verdict",
    ]);
  });

  it("carries a non-empty loopMessage nudging the current task to verification", () => {
    const msg = inner?.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Conditional refinement loops on write-tests / implement / refactor — each a
// do-while block whose trailing variable phase sets a `*_changed` boolean;
// verify-green stays lean
// ---------------------------------------------------------------------------

describe("TDD sub-phase refinement loops", () => {
  it("write-tests-loop is a do-while block replaying while write_tests_changed is true", () => {
    const loop = tddBodyById("write-tests-loop");
    expect(loop.kind).toBe("loop");
    expect(loop.maxIterations).toBe(4);
    const cb = loop.repeatWhile as (s: PioSessionState) => boolean;
    const withChanged = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "write_tests_changed", val);
      return state;
    };
    expect(cb(withChanged(true))).toBe(true);
    expect(cb(withChanged(false))).toBe(false);
    expect(cb(makeState())).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect((loop.loopMessage as string).length).toBeGreaterThan(0);
    // body: rich standard write-tests phase + a verdict variable phase
    expect(loop.body?.map((p) => p.id)).toEqual([
      "write-tests",
      "write-tests-verdict",
    ]);
    expect(loop.body?.[1].kind).toBe("variable-definition");
    expect(loop.body?.[1].variables?.[0]).toMatchObject({
      name: "write_tests_changed",
      type: "boolean",
      kind: "llm",
    });
    // the rich standard phase keeps the tdd skill
    expect(refinementWorkPhase("write-tests-loop").skills?.mandatory).toEqual([
      "tdd",
    ]);
  });

  it("implement-loop is a do-while block replaying while implement_changed is true", () => {
    const loop = tddBodyById("implement-loop");
    expect(loop.kind).toBe("loop");
    expect(loop.maxIterations).toBe(4);
    const cb = loop.repeatWhile as (s: PioSessionState) => boolean;
    const withChanged = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "implement_changed", val);
      return state;
    };
    expect(cb(withChanged(true))).toBe(true);
    expect(cb(withChanged(false))).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect(loop.body?.map((p) => p.id)).toEqual([
      "implement",
      "implement-verdict",
    ]);
    expect(loop.body?.[1].kind).toBe("variable-definition");
    expect(loop.body?.[1].variables?.[0]).toMatchObject({
      name: "implement_changed",
      type: "boolean",
      kind: "llm",
    });
    expect(refinementWorkPhase("implement-loop").skills?.mandatory).toEqual([
      "tdd",
    ]);
  });

  it("refactor-loop is a do-while block replaying while refactor_changed is true", () => {
    const loop = tddBodyById("refactor-loop");
    expect(loop.kind).toBe("loop");
    expect(loop.maxIterations).toBe(4);
    const cb = loop.repeatWhile as (s: PioSessionState) => boolean;
    const withChanged = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "refactor_changed", val);
      return state;
    };
    expect(cb(withChanged(true))).toBe(true);
    expect(cb(withChanged(false))).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect(loop.body?.map((p) => p.id)).toEqual([
      "refactor",
      "refactor-verdict",
    ]);
    expect(loop.body?.[1].kind).toBe("variable-definition");
    expect(loop.body?.[1].variables?.[0]).toMatchObject({
      name: "refactor_changed",
      type: "boolean",
      kind: "llm",
    });
    expect(refinementWorkPhase("refactor-loop").skills?.mandatory).toEqual([
      "tdd",
    ]);
  });

  it("write-tests rich phase carries the tracer-bullet behavior-not-implementation guidance", () => {
    const instr = refinementWorkPhase("write-tests-loop")
      .instructions as string;
    expect(instr).toContain("tracer bullet");
    expect(instr).toContain("behavior");
    expect(instr).toContain("implementation");
    expect(instr).toContain("write_tests_changed");
  });

  it("implement rich phase carries the minimal GREEN guidance", () => {
    const instr = refinementWorkPhase("implement-loop").instructions as string;
    expect(instr).toContain("minimal");
    expect(instr).toContain("implement_changed");
  });

  it("refactor rich phase carries the keep-tests-green + web_search guidance", () => {
    const instr = refinementWorkPhase("refactor-loop").instructions as string;
    expect(instr).toContain("web_search");
    expect(instr).toContain("tests green");
    expect(instr).toContain("refactor_changed");
  });

  it("verify-green is lean — no loop fields", () => {
    const phase = tddBodyById("verify-green");
    expect(phase.maxIterations).toBeUndefined();
    expect(phase.minIterations).toBeUndefined();
    expect(phase.loopWhile).toBeUndefined();
    expect(phase.terminateWhen).toBeUndefined();
    expect(phase.write).toBeUndefined();
    expect(phase.allowProjectWrites).toBeUndefined();
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });

  it("verify-final runs formal tests + programmatic checks without writing markers", () => {
    const phase = tddBodyById("verify-final");
    expect(phase.kind).toBeUndefined();
    const instr = phase.instructions as string;
    expect(instr).toContain(`\`\${current_task}\``);
    expect(instr).toContain("formal tests");
    expect(instr).toContain("programmatic checks");
    expect(instr).toContain("genuine blocker");
    // No marker-file writing — the verdict is recorded as store variables.
    expect(instr).not.toContain("verified.txt");
    expect(instr).not.toContain("blocked.txt");
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });

  it("task-verdict is a variable phase setting task_verified/task_blocked with the blocked discipline", () => {
    const phase = tddBodyById("task-verdict");
    expect(phase.kind).toBe("variable-definition");
    const names = phase.variables?.map((v) => v.name);
    expect(names).toEqual(["task_verified", "task_blocked"]);
    expect(phase.variables?.[0]).toMatchObject({
      name: "task_verified",
      type: "boolean",
      kind: "llm",
    });
    expect(phase.variables?.[1]).toMatchObject({
      name: "task_blocked",
      type: "boolean",
      kind: "llm",
    });
    const desc = phase.variables?.[0].description as string;
    expect(desc).toContain("only when ALL formal tests");
    const blockedDesc = phase.variables?.[1].description as string;
    expect(blockedDesc).toContain("genuine blocker");
    expect(blockedDesc).toContain("NOT blockers");
  });
});

// ---------------------------------------------------------------------------
// verify-acceptance-criteria — judgment; adds missing work to tasks and
// records the acceptance-blocked verdict as a store boolean
// ---------------------------------------------------------------------------

describe("verify-acceptance-criteria", () => {
  const phase = iterativeTddPhase.body?.[3];

  it("is a variable-definition judgment phase (tasks + acceptance_blocked) before finalize-tasks", () => {
    expect(phase?.id).toBe("verify-acceptance-criteria");
    expect(phase?.kind).toBe("variable-definition");
    expect(phase?.variables?.map((v) => v.name)).toEqual([
      "tasks",
      "acceptance_blocked",
    ]);
    expect(phase?.variables?.[0]).toMatchObject({
      name: "tasks",
      type: "array",
      kind: "llm",
    });
    expect(phase?.variables?.[1]).toMatchObject({
      name: "acceptance_blocked",
      type: "boolean",
      kind: "llm",
    });
    expect(iterativeTddPhase.body?.[4].id).toBe("finalize-tasks");
  });

  it("description carries judgment-only discipline and stuck-task blocker handling (no marker files)", () => {
    const tasksDesc = phase?.variables?.[0].description as string;
    expect(tasksDesc).toContain("finalize-tasks");
    expect(tasksDesc).toContain("missing work");
    const blockedDesc = phase?.variables?.[1].description as string;
    expect(blockedDesc).toContain("stuck");
    expect(blockedDesc).toContain("max-iteration");
    expect(blockedDesc).toContain("genuine blocker");
    expect(blockedDesc).toContain("tasks");
    // no terminal-marker file writing
    expect(tasksDesc).not.toContain("tasks-complete.txt");
    expect(blockedDesc).not.toContain("blocked.txt");
  });
});

// ---------------------------------------------------------------------------
// write-test-file / write-summary-file — explicit contract-output write gates
// ---------------------------------------------------------------------------

describe("output-writing phases", () => {
  it("write-test-file is gated to exactly ['test'] with the TEST.md format guidance", () => {
    expect(writeTestFilePhase.id).toBe("write-test-file");
    expect(writeTestFilePhase.write).toEqual(["test"]);
    expect(writeTestFilePhase.allowProjectWrites).toBeUndefined();
    const instr = writeTestFilePhase.instructions as string;
    expect(instr).toContain("TEST.md");
    expect(instr).toContain("Given");
    expect(instr).toContain("when");
    expect(instr).toContain("then");
  });

  it("write-summary-file is gated to exactly ['summary'] with status+commit frontmatter and body/blocked structure", () => {
    expect(writeSummaryPhase.id).toBe("write-summary-file");
    expect(writeSummaryPhase.write).toEqual(["summary"]);
    expect(writeSummaryPhase.allowProjectWrites).toBeUndefined();
    const instr = writeSummaryPhase.instructions as string;
    expect(instr).toContain("SUMMARY.md");
    expect(instr).toContain("status: completed");
    expect(instr).toContain("status: blocked");
    expect(instr).toContain(`\${commit_hash}`);
    expect(instr).toContain("What was attempted");
    expect(instr).toContain("What specifically remains blocking");
    expect(instr).toContain("Prerequisite to unblock");
    expect(instr).toContain("User-Requested Changes");
  });
});

// ---------------------------------------------------------------------------
// commit — standard pio-git phase, graceful
// ---------------------------------------------------------------------------

describe("commit", () => {
  it("is a standard phase with the pio-git skill and graceful-failure instruction", () => {
    expect(commitPhase.id).toBe("commit");
    expect(commitPhase.kind).toBeUndefined();
    expect(commitPhase.skills?.mandatory).toEqual(["pio-git"]);
    const instr = commitPhase.instructions as string;
    expect(instr).toContain("pio-git");
    expect(instr).toContain("never block");
  });
});

// ---------------------------------------------------------------------------
// capture-commit-hash / push — code phases with graceful git behavior
// ---------------------------------------------------------------------------

describe("capture-commit-hash", () => {
  it("is a code phase", () => {
    expect(captureHashPhase.kind).toBe("code");
  });

  it("sets the commit_hash store var from git rev-parse HEAD", () => {
    const tempDir = fsMkdtempSync();
    try {
      runInGitRepo(tempDir);
      const state = makeState({ projectRoot: tempDir, sessionId: "s" });
      runCode(captureHashPhase, state);
      const hash = state.store?.get("commit_hash") as string;
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    } finally {
      fsRmrf(tempDir);
    }
  });

  it("leaves commit_hash unset when git fails (graceful)", () => {
    const tempDir = fsMkdtempSync();
    try {
      // Not a git repository → git rev-parse HEAD fails
      const state = makeState({ projectRoot: tempDir, sessionId: "s" });
      expect(() => runCode(captureHashPhase, state)).not.toThrow();
      expect(state.store?.get("commit_hash")).toBeUndefined();
    } finally {
      fsRmrf(tempDir);
    }
  });
});

describe("push", () => {
  it("is a code phase that does not throw on a repo with no remote (graceful)", () => {
    const tempDir = fsMkdtempSync();
    try {
      runInGitRepo(tempDir);
      const state = makeState({ projectRoot: tempDir, sessionId: "s" });
      expect(() => runCode(pushPhase, state)).not.toThrow();
    } finally {
      fsRmrf(tempDir);
    }
  });

  it("is a code phase", () => {
    expect(pushPhase.kind).toBe("code");
  });
});

// ---------------------------------------------------------------------------
// Structure pins
// ---------------------------------------------------------------------------

describe("workflow structure", () => {
  const expectedTopLevel = [
    "read-task",
    "default-setup",
    "research-context",
    "iterative-tdd",
    "write-test-file",
    "commit",
    "capture-commit-hash",
    "push",
    "write-summary-file",
  ];

  it("has 9 top-level phases in order with correct kinds (3 code, 2 loop, 4 standard)", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBeUndefined(); // read-task
    expect(workflow[1].kind).toBe("code"); // default-setup
    expect(workflow[2].kind).toBe("loop"); // research-context (do-while)
    expect(workflow[3].kind).toBe("loop"); // iterative-tdd
    expect(workflow[4].kind).toBeUndefined(); // write-test-file
    expect(workflow[5].kind).toBeUndefined(); // commit
    expect(workflow[6].kind).toBe("code"); // capture-commit-hash
    expect(workflow[7].kind).toBe("code"); // push
    expect(workflow[8].kind).toBeUndefined(); // write-summary-file
  });

  it("declares no allowProjectWrites anywhere and only the intended variable-definition phases", () => {
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.allowProjectWrites).toBeUndefined();
        if (p.kind === "variable-definition") {
          expect([
            "research",
            "research-complete",
            "generate-tasks",
            "tasks-refined",
            "write-tests-verdict",
            "implement-verdict",
            "refactor-verdict",
            "task-verdict",
            "verify-acceptance-criteria",
          ]).toContain(p.id);
        }
        if (p.body) visit(p.body);
      }
    };
    visit(workflow);
  });

  it("references no old phase ids, signal-completion, or pio_mark_complete anywhere", () => {
    const SIGNAL = ["signal", "-completion"].join("");
    const MARK = ["pio_mark", "_complete"].join("");
    const OLD_IDS = new RegExp(
      [
        SIGNAL,
        "read-goal-and-plan",
        "run-verification",
        "write-completion-artifacts",
        "push-to-remote",
      ].join("|"),
    );
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.id).not.toMatch(OLD_IDS);
        if (p.instructions) {
          expect(p.instructions).not.toContain(MARK);
          expect(p.instructions).not.toContain(SIGNAL);
        }
        if (p.variables) {
          for (const v of p.variables) {
            if (v.description) {
              expect(v.description).not.toContain(MARK);
              expect(v.description).not.toContain(SIGNAL);
            }
          }
        }
        if (p.body) visit(p.body);
      }
    };
    visit(workflow);
  });

  it("eliminates all /tmp scratch files in favor of store variables", () => {
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        if (p.instructions) {
          expect(p.instructions).not.toContain("/tmp/");
          expect(p.instructions).not.toContain(".txt");
        }
        if (p.loopMessage) expect(p.loopMessage).not.toContain("/tmp/");
        if (p.variables) {
          for (const v of p.variables) {
            if (v.description) {
              expect(v.description).not.toContain("/tmp/");
              expect(v.description).not.toContain(".txt");
            }
          }
        }
        if (p.body) visit(p.body);
      }
    };
    visit(workflow);
  });
});

// ---------------------------------------------------------------------------
// Small fs helpers (kept local to avoid importing node:fs at the top level
// of the test body — the code phases no longer touch the filesystem).
// ---------------------------------------------------------------------------

function fsMkdtempSync(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require("node:fs") as typeof import("node:fs");
  return mkdtempSync(path.join(os.tmpdir(), "pio-exec-"));
}

function fsRmrf(dir: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rmSync } = require("node:fs") as typeof import("node:fs");
  rmSync(dir, { recursive: true, force: true });
}

function fsScratchExists(sessionId: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  return existsSync(`/tmp/pio-execute-task/${sessionId}`);
}

/** Create a throwaway git repo with one commit in the given directory. */
function runInGitRepo(dir: string): void {
  const run = (cmd: string): void => {
    const { execSync } =
      require("node:child_process") as typeof import("node:child_process");
    execSync(cmd, { cwd: dir, encoding: "utf-8", stdio: "pipe" });
  };
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(path.join(dir, "file.txt"), "hello", "utf-8");
  run("git init -q");
  run("git config user.email test@example.com");
  run("git config user.name Test");
  run("git add -A");
  run("git commit -q -m init");
}

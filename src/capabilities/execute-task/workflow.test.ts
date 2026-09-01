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
  // Mirror default-setup: declare every session variable so store.get(...)
  // resolves to a type-appropriate default ([] / "" / false) when unset.
  store.declare("tasks", "array");
  store.declare("research_notes", "array");
  store.declare("research_complete", "boolean");
  store.declare("task_list_refined", "boolean");
  store.declare("current_task", "string");
  store.declare("tests_pass", "boolean");
  store.declare("commit_hash", "string");
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

  it("declares every session variable so store.get resolves to a type default when unset", () => {
    const state = makeState({ sessionId: "sess-123" });
    runCode(setupPhase, state);
    expect(state.store?.get("tasks")).toEqual([]);
    expect(state.store?.get("research_notes")).toEqual([]);
    expect(state.store?.get("research_complete")).toBe(false);
    expect(state.store?.get("task_list_refined")).toBe(false);
    expect(state.store?.get("current_task")).toBe("");
    expect(state.store?.get("tests_pass")).toBe(false);
    expect(state.store?.get("commit_hash")).toBe("");
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

  it("research-complete description directs setting true only when nothing is missing/unanswered, with critical evaluation", () => {
    const desc = researchPhase.body?.[1].variables?.[0].description as string;
    expect(desc).toContain("research_notes");
    expect(desc).toContain("true");
    expect(desc).toContain("nothing missing");
    expect(desc).toContain("web_search");
    // Gating verdicts must instruct critical evaluation, not rubber-stamping.
    expect(desc).toContain("critical");
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

  it("advances when tasks is empty or any task is blocked; repeats when non-empty non-blocked work remains (total, store-backed)", () => {
    const cb = iterativeTddPhase.repeatWhile as (s: PioSessionState) => boolean;
    const withTasks = (tasks: unknown[]) => {
      const state = makeState();
      state.store?.set("tasks", "array", tasks);
      return state;
    };
    // empty array → advance (all tasks were verified and dequeued; do-while)
    expect(cb(makeState())).toBe(false);
    // any blocked → advance
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "blocked" },
        ]),
      ),
    ).toBe(false);
    // a single blocked task → advance
    expect(cb(withTasks([{ name: "A", status: "blocked" }]))).toBe(false);
    // pending/in-progress work remains → repeat
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "pending" },
        ]),
      ),
    ).toBe(true);
    expect(
      cb(
        withTasks([
          { name: "A", status: "verified" },
          { name: "B", status: "in-progress" },
        ]),
      ),
    ).toBe(true);
    // total — never throws on missing state/store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains task-generation, select-task, the inner tdd-process loop, verify-acceptance-criteria, and complete-current", () => {
    expect(iterativeTddPhase.body?.map((p) => p.id)).toEqual([
      "task-generation",
      "select-task",
      "tdd-process",
      "verify-acceptance-criteria",
      "complete-current",
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
// select-task — variable-definition phase that peeks the front of the tasks
// queue, marks it in-progress, and sets current_task
// ---------------------------------------------------------------------------

describe("select-task", () => {
  const phase = iterativeTddPhase.body?.[1];

  it("is a variable-definition phase declaring current_task", () => {
    expect(phase?.id).toBe("select-task");
    expect(phase?.kind).toBe("variable-definition");
    expect(phase?.variables?.map((v) => v.name)).toEqual(["current_task"]);
    expect(phase?.variables?.[0]).toMatchObject({
      name: "current_task",
      type: "string",
      kind: "llm",
    });
  });

  it("description instructs peeking the front, marking it in-progress via setVarAt, and setting current_task explicitly", () => {
    const desc = phase?.variables?.[0].description as string;
    expect(desc).toContain("peek");
    expect(desc).toContain("setVarAt");
    expect(desc).toContain("in-progress");
    expect(desc).toContain("setVar");
    expect(desc).toContain("index 0");
    expect(desc).toContain("replace the whole array");
  });
});

// ---------------------------------------------------------------------------
// complete-current — variable-definition phase that advances the tasks queue:
// peeks the front and dequeues it once verified
// ---------------------------------------------------------------------------

describe("complete-current", () => {
  const phase = iterativeTddPhase.body?.[4];

  it("is a variable-definition phase declaring tasks (replaces finalize-tasks)", () => {
    expect(phase?.id).toBe("complete-current");
    expect(phase?.kind).toBe("variable-definition");
    expect(phase?.variables?.map((v) => v.name)).toEqual(["tasks"]);
    expect(phase?.variables?.[0]).toMatchObject({
      name: "tasks",
      type: "array",
      kind: "llm",
    });
  });

  it("description instructs peeking and dequeuing a verified front while leaving blocked/in-progress in place", () => {
    const desc = phase?.variables?.[0].description as string;
    expect(desc).toContain("peek");
    expect(desc).toContain("dequeue");
    expect(desc).toContain("verified");
    expect(desc).toContain("blocked");
    expect(desc).toContain("in-progress");
    expect(desc).toContain("shift");
    expect(desc).toContain("leave it in place");
    expect(desc).toContain("not replace the whole array");
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
    expect(inner?.body).toHaveLength(5);
  });

  it("advances when the front task is verified/blocked or the queue is empty; repeats while the front is in-progress (total, store-backed)", () => {
    const cb = inner?.repeatWhile as (s: PioSessionState) => boolean;
    const withFront = (status?: string) => {
      const state = makeState();
      if (status !== undefined) {
        state.store?.set("tasks", "array", [{ name: "A", status }]);
      }
      return state;
    };
    // front is in-progress → repeat (task not yet resolved)
    expect(cb(withFront("in-progress"))).toBe(true);
    // verified or blocked front → advance
    expect(cb(withFront("verified"))).toBe(false);
    expect(cb(withFront("blocked"))).toBe(false);
    // pending front (not yet selected) → advance (select-task marks in-progress)
    expect(cb(withFront("pending"))).toBe(false);
    // empty/unset queue → advance
    expect(cb(makeState())).toBe(false);
    // total — never throws on missing store
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains the 5 TDD phases in order", () => {
    expect(inner?.body?.map((p) => p.id)).toEqual([
      "write-tests",
      "implement-loop",
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
// TDD sub-phases — write-tests is a filesWritten exhaustion loop (loop while
// anything was edited); implement and refactor are do-while loops gated on the
// tests_pass verdict (loop while the tests aren't green)
// ---------------------------------------------------------------------------

describe("TDD sub-phases", () => {
  it("write-tests is a single-phase exhaustion loop replaying while any file was written", () => {
    const phase = tddBodyById("write-tests");
    expect(phase.kind).toBeUndefined();
    expect(phase.maxIterations).toBe(4);
    expect(phase.loopWhile).toHaveLength(1);
    const cb = phase.loopWhile?.[0].callback as (s: PioSessionState) => boolean;
    // any file written this run → replay (have another look)
    expect(cb(makeState({ filesWritten: ["/src/foo.test.ts"] }))).toBe(true);
    expect(cb(makeState({ filesWritten: ["/src/foo.spec.js"] }))).toBe(true);
    expect(cb(makeState({ filesWritten: ["/src/foo.ts"] }))).toBe(true);
    // no file written → advance
    expect(cb(makeState())).toBe(false);
    // total — never throws on missing filesWritten
    expect(() => cb(makeState())).not.toThrow();
    expect((phase.loopMessage as string).length).toBeGreaterThan(0);
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });

  it("write-tests rich phase carries the tracer-bullet behavior-not-implementation guidance", () => {
    const instr = tddBodyById("write-tests").instructions as string;
    expect(instr).toContain("tracer bullet");
    expect(instr).toContain("behavior");
    expect(instr).toContain("implementation");
  });

  it("implement-loop is a do-while block replaying while tests_pass is false", () => {
    const loop = tddBodyById("implement-loop");
    expect(loop.kind).toBe("loop");
    expect(loop.maxIterations).toBe(4);
    const cb = loop.repeatWhile as (s: PioSessionState) => boolean;
    const withPass = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "tests_pass", val);
      return state;
    };
    // tests not green (false or unset) → repeat
    expect(cb(withPass(false))).toBe(true);
    expect(cb(makeState())).toBe(true);
    // tests green → advance
    expect(cb(withPass(true))).toBe(false);
    // total — never throws on missing store
    expect(() => cb(makeState())).not.toThrow();
    // body: implement, verify-green (variable phase sets tests_pass)
    expect(loop.body?.map((p) => p.id)).toEqual(["implement", "verify-green"]);
    expect(loop.body?.[1].kind).toBe("variable-definition");
    expect(loop.body?.[1].variables?.[0]).toMatchObject({
      name: "tests_pass",
      type: "boolean",
      kind: "llm",
    });
    expect(loop.body?.[0].skills?.mandatory).toEqual(["tdd"]);
    // the inner implement phase is itself an exhaustion loop on filesWritten
    const inner = loop.body?.[0];
    expect(inner?.maxIterations).toBe(4);
    expect(inner?.loopWhile).toHaveLength(1);
    const innerCb = inner?.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(innerCb(makeState({ filesWritten: ["/src/a.ts"] }))).toBe(true);
    expect(innerCb(makeState())).toBe(false);
    expect(() => innerCb(makeState())).not.toThrow();
  });

  it("implement rich phase carries the minimal GREEN guidance", () => {
    const instr = tddBodyById("implement-loop").body?.[0]
      .instructions as string;
    expect(instr).toContain("minimal");
  });

  it("refactor-loop is a do-while block replaying while tests_pass is false", () => {
    const loop = tddBodyById("refactor-loop");
    expect(loop.kind).toBe("loop");
    expect(loop.maxIterations).toBe(4);
    const cb = loop.repeatWhile as (s: PioSessionState) => boolean;
    const withPass = (val?: boolean) => {
      const state = makeState();
      if (val !== undefined) setBool(state, "tests_pass", val);
      return state;
    };
    expect(cb(withPass(false))).toBe(true);
    expect(cb(makeState())).toBe(true);
    expect(cb(withPass(true))).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    // body: refactor, refactor-verify-green (variable phase sets tests_pass)
    expect(loop.body?.map((p) => p.id)).toEqual([
      "refactor",
      "refactor-verify-green",
    ]);
    expect(loop.body?.[1].kind).toBe("variable-definition");
    expect(loop.body?.[1].variables?.[0]).toMatchObject({
      name: "tests_pass",
      type: "boolean",
      kind: "llm",
    });
    expect(loop.body?.[0].skills?.mandatory).toEqual(["tdd"]);
    // the inner refactor phase is itself an exhaustion loop on filesWritten
    const inner = loop.body?.[0];
    expect(inner?.maxIterations).toBe(4);
    expect(inner?.loopWhile).toHaveLength(1);
    const innerCb = inner?.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(innerCb(makeState({ filesWritten: ["/src/a.ts"] }))).toBe(true);
    expect(innerCb(makeState())).toBe(false);
    expect(() => innerCb(makeState())).not.toThrow();
  });

  it("refactor rich phase carries the keep-tests-green + web_search guidance", () => {
    const instr = tddBodyById("refactor-loop").body?.[0].instructions as string;
    expect(instr).toContain("web_search");
    expect(instr).toContain("tests green");
  });

  it("verify-green (inside implement-loop) is a variable phase setting tests_pass", () => {
    const phase = tddBodyById("implement-loop").body?.[1];
    expect(phase?.id).toBe("verify-green");
    expect(phase?.kind).toBe("variable-definition");
    expect(phase?.variables?.[0]).toMatchObject({
      name: "tests_pass",
      type: "boolean",
      kind: "llm",
    });
    const desc = phase?.variables?.[0].description as string;
    expect(desc).toContain("Run the test suite");
    expect(desc).toContain("npm run check");
    expect(desc).toContain("npm run lint");
    expect(desc).toContain("honest");
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

  it("task-verdict is a variable phase declaring tasks and setting the front task's status directly with the blocked discipline", () => {
    const phase = tddBodyById("task-verdict");
    expect(phase.kind).toBe("variable-definition");
    const names = phase.variables?.map((v) => v.name);
    expect(names).toEqual(["tasks"]);
    expect(phase.variables?.[0]).toMatchObject({
      name: "tasks",
      type: "array",
      kind: "llm",
    });
    const desc = phase.variables?.[0].description as string;
    expect(desc).toContain("setVarAt");
    expect(desc).toContain("verified");
    expect(desc).toContain("blocked");
    expect(desc).toContain("in-progress");
    expect(desc).toContain("ALL formal tests");
    expect(desc).toContain("NOT blockers");
    expect(desc).toContain("never replace the whole array");
  });
});

// ---------------------------------------------------------------------------
// verify-acceptance-criteria — judgment; adds missing work to tasks and
// records the acceptance-blocked verdict as a store boolean
// ---------------------------------------------------------------------------

describe("verify-acceptance-criteria", () => {
  const phase = iterativeTddPhase.body?.[3];

  it("is a variable-definition judgment phase declaring only tasks, before complete-current", () => {
    expect(phase?.id).toBe("verify-acceptance-criteria");
    expect(phase?.kind).toBe("variable-definition");
    expect(phase?.variables?.map((v) => v.name)).toEqual(["tasks"]);
    expect(phase?.variables?.[0]).toMatchObject({
      name: "tasks",
      type: "array",
      kind: "llm",
    });
    expect(iterativeTddPhase.body?.[4].id).toBe("complete-current");
  });

  it("description carries judgment-only discipline: enqueues missing work and sets a genuinely unresolvable stuck front task to blocked (no marker files)", () => {
    const tasksDesc = phase?.variables?.[0].description as string;
    expect(tasksDesc).toContain("enqueue");
    expect(tasksDesc).toContain("pending");
    expect(tasksDesc).toContain("missing work");
    expect(tasksDesc).toContain("stuck");
    expect(tasksDesc).toContain("setVarAt");
    expect(tasksDesc).toContain("blocked");
    expect(tasksDesc).toContain("complete-current");
    // no terminal-marker file writing
    expect(tasksDesc).not.toContain("tasks-complete.txt");
    expect(tasksDesc).not.toContain("blocked.txt");
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
      expect(state.store?.isDefined("commit_hash")).toBe(false);
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
            "verify-green",
            "refactor-verify-green",
            "select-task",
            "task-verdict",
            "verify-acceptance-criteria",
            "complete-current",
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

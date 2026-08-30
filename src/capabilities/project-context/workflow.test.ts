import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { preparePhaseVariables } from "../../runtime/loop-engine";
import type { PioSessionState } from "../../runtime/session-state";
import { SessionVariableStore } from "../../runtime/session-store";
import type { WorkflowPhase } from "../../runtime/workflow-types";
import workflow from "./workflow";

// ---------------------------------------------------------------------------
// Helpers — build a fake PioSessionState (store + projectRoot + capState)
// through the public surface only, and invoke code-phase run() callbacks.
// ---------------------------------------------------------------------------

function makeStore(): SessionVariableStore {
  return new SessionVariableStore({});
}

function makeState(
  overrides: {
    store?: SessionVariableStore;
    sessionId?: string;
    projectRoot?: string;
    capState?: unknown;
  } = {},
): PioSessionState {
  return {
    store: overrides.store ?? makeStore(),
    sessionId: overrides.sessionId,
    projectRoot: overrides.projectRoot,
    capState: overrides.capState,
  } as unknown as PioSessionState;
}

/** Run a `kind: "code"` phase's run() inline against a state. */
function runCode(phase: WorkflowPhase, state: PioSessionState): void {
  const run = phase.run as
    | ((ctx: { state: PioSessionState }) => void | Promise<void>)
    | undefined;
  run?.({ state });
}

function makeCapState(pathMap: Record<string, string>): unknown {
  return {
    outputExists: (name: string) => {
      const p = pathMap[name];
      return p ? fs.existsSync(p) : false;
    },
  };
}

/** The 16 seeded themes — original 8, then 3 (re-execution), then 5 (coverage audit). */
const SEEDED_THEMES = [
  "What is the top-level directory tree of the project, and what is each top-level area for?",
  "How many git repositories does the project contain (embedded .git directories, submodules, workspaces), and how do they relate?",
  "What languages, frameworks, and runtime versions define the project (per dependency manifests)?",
  "What are the build, test, lint, and packaging commands, and what does CI run?",
  "How is source organized, and where do tests live relative to source (conventions + runner config)?",
  "Which external services/integrations does the project depend on (databases, APIs, brokers, caches, SDKs)?",
  "What are the main entry points / executables / packages a contributor must know?",
  "What domain terminology or acronyms recur that a newcomer would need?",
  "What is the deployment or release mechanism, if any (targets, pipelines, artifact distribution, environments)?",
  "Where do documentation references live — in-repo docs and external references?",
  "Which agentic coding instruction files exist (CLAUDE.md, AGENTS.md, CURSOR.md, .github/copilot-instructions.md, or similar), and what conventions or rules do they encode for agents working on this repo?",
  "What is the project's purpose, who maintains it, and what license and repository reference apply?",
  "What is needed to run the project locally (environment variables, configs, secrets, and start commands)?",
  "What coding style and formatting conventions do the editor and lint configs encode (indentation, line length, quotes, semicolons, naming, and the lint/format tools and how to run them)?",
  "What are the git commit and release conventions (commit message format, types and scope usage, tag/versioning scheme, branch naming, and merge or signing practices)?",
  "What architecture patterns and key design decisions structure the project, and are there Architecture Decision Records (ADRs)?",
];

/** Seed via the default-questions code phase and return the resulting state. */
function seedState(): PioSessionState {
  const state = makeState({
    sessionId: `seed-${Math.random().toString(36).slice(2)}`,
  });
  runCode(workflow[0], state);
  return state;
}

// ---------------------------------------------------------------------------
// Phase references by structural position
// ---------------------------------------------------------------------------

const researchLoop = workflow[1];
const innerLoop = (researchLoop.body as WorkflowPhase[])[0];
const mergeNotesPhase = (researchLoop.body as WorkflowPhase[])[1];
const generateQuestions = (researchLoop.body as WorkflowPhase[])[2];
const mergeQuestions = (researchLoop.body as WorkflowPhase[])[3];
const innerBody = innerLoop.body as WorkflowPhase[];
const resetPhase = innerBody[0];
const getNextPhase = innerBody[1];
const answerPhase = innerBody[2];
const refineLoop = innerBody[3] as WorkflowPhase;
const popPhase = innerBody[4] as WorkflowPhase;
const refineBody = refineLoop.body as WorkflowPhase[];
const validatePhase = refineBody[0];
const branchPhase = refineBody[1];
const branchThen = branchPhase.then as WorkflowPhase[];
const refinePhase = branchThen[0];
const writePhases = workflow.slice(3, 10) as WorkflowPhase[];
const cleanupPhase = workflow[10];

// ---------------------------------------------------------------------------
// default-questions seed
// ---------------------------------------------------------------------------

describe("default-questions seed", () => {
  it("seeds the questions queue with exactly 16 default themes and creates the notes file + answers dir", () => {
    const state = seedState();
    const questions = state.store?.get("questions") as string[];
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(16);
    expect(questions).toEqual(SEEDED_THEMES);

    const notesPath = state.store?.get("notes_path") as string;
    expect(typeof notesPath).toBe("string");
    expect(fs.existsSync(notesPath)).toBe(true);
    expect(fs.readFileSync(notesPath, "utf8")).toContain("# Research Notes");

    const answersDir = state.store?.get("answers_dir") as string;
    expect(typeof answersDir).toBe("string");
    expect(fs.existsSync(answersDir)).toBe(true);
  });

  it("re-seeds fresh (overwriting any stale queue/notes, clearing the answers dir) on re-run", () => {
    const state = seedState();
    state.store?.set("questions", "array", ["stale"]);
    fs.writeFileSync(
      state.store?.get("notes_path") as string,
      "stale notes\n",
      "utf8",
    );
    const staleAnswer = path.join(
      state.store?.get("answers_dir") as string,
      "q-stale-deadbeef.md",
    );
    fs.writeFileSync(staleAnswer, "stale answer", "utf8");
    runCode(workflow[0], state);
    const questions = state.store?.get("questions") as string[];
    expect(questions).toHaveLength(16);
    expect(questions).toEqual(SEEDED_THEMES);
    const content = fs.readFileSync(
      state.store?.get("notes_path") as string,
      "utf8",
    );
    expect(content).toContain("# Research Notes");
    expect(content).not.toContain("stale notes");
    // stale answer file cleared on a fresh seed
    expect(fs.existsSync(staleAnswer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get-next-question (peek) and pop-question (shift + index advance)
// ---------------------------------------------------------------------------

describe("question queue code steps", () => {
  it("get-next-question peeks the front into nextQuestion and sets a content-addressed answer_path WITHOUT popping", () => {
    const state = seedState();
    runCode(getNextPhase, state);
    expect(state.store?.get("nextQuestion")).toBe(SEEDED_THEMES[0]);
    const answersDir = state.store?.get("answers_dir") as string;
    const answerPath = state.store?.get("answer_path") as string;
    // content-addressed: under the answers dir, ends .md, an 8-hex hash name
    expect(answerPath.startsWith(answersDir + path.sep)).toBe(true);
    expect(answerPath.endsWith(".md")).toBe(true);
    expect(answerPath).toMatch(/q-[0-9a-f]{8}\.md$/);
    // queue unchanged — peek does not pop
    expect(state.store?.get("questions")).toEqual(SEEDED_THEMES);
  });

  it("get-next-question derives a deterministic answer_path for the same question (same file, no counter)", () => {
    const state = seedState();
    runCode(getNextPhase, state);
    const first = state.store?.get("answer_path");
    // same front question → same content-addressed file (what makes
    // refine-answer rewrite the same file without a counter)
    runCode(getNextPhase, state);
    expect(state.store?.get("answer_path")).toBe(first);
  });

  it("get-next-question is total on an empty/undefined queue (nextQuestion = '')", () => {
    const state = makeState();
    runCode(getNextPhase, state);
    expect(state.store?.get("nextQuestion")).toBe("");
  });

  it("pop-question shifts the front of the queue", () => {
    const state = seedState();
    runCode(popPhase, state);
    const questions = state.store?.get("questions") as string[];
    expect(questions).toHaveLength(15);
    expect(questions[0]).toBe(SEEDED_THEMES[1]);
  });
});

// ---------------------------------------------------------------------------
// branch-if-answered condition (questionAnswered === true)
// ---------------------------------------------------------------------------

describe("branch-if-unanswered", () => {
  it("routes to the refine arm only when questionAnswered is exactly false", () => {
    const condition = branchPhase.condition as (
      s: PioSessionState,
    ) => boolean | unknown;
    expect(
      condition(
        makeState({ store: withVar("questionAnswered", "boolean", false) }),
      ),
    ).toBeTruthy();
    expect(
      condition(
        makeState({ store: withVar("questionAnswered", "boolean", true) }),
      ),
    ).toBeFalsy();
    expect(condition(makeState())).toBeFalsy();
  });

  it("then arm is exactly [refine-answer]; else arm is absent (skip to loop-end)", () => {
    expect(branchPhase.kind).toBe("branch:if");
    expect(branchThen.map((p) => p.id)).toEqual(["refine-answer"]);
    expect(branchPhase.else).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// answer-question — writes to its dedicated file with a non-empty existence
// durability loop (answerFileWritten)
// ---------------------------------------------------------------------------

describe("answer-question durability loop", () => {
  it("replays until the answer file exists and is non-empty (loopWhile on !answerFileWritten)", () => {
    expect(answerPhase.id).toBe("answer-question");
    expect(answerPhase.maxIterations).toBe(2);
    const cb = answerPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(typeof cb).toBe("function");

    // no answer_path → not written → keep looping
    expect(cb(makeState())).toBe(true);

    // path set but file missing → keep looping
    const store = makeStore();
    store.set("answer_path", "string", "/nonexistent/answers/q-0.md");
    expect(cb(makeState({ store }))).toBe(true);

    // file exists but is empty → keep looping
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-ans-"));
    const file = path.join(root, "q-0.md");
    fs.writeFileSync(file, "", "utf8");
    const store2 = makeStore();
    store2.set("answer_path", "string", file);
    expect(cb(makeState({ store: store2 }))).toBe(true);

    // file exists and is non-empty → advance
    fs.writeFileSync(file, "**Question:** Q\nAnswer.\n", "utf8");
    expect(cb(makeState({ store: store2 }))).toBe(false);
  });

  it("is total — missing or unreadable answer file keeps looping without throwing", () => {
    const cb = answerPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // no store vars at all
    expect(cb(makeState())).toBe(true);
    // answer_path empty string
    const store = makeStore();
    store.set("answer_path", "string", "");
    expect(cb(makeState({ store }))).toBe(true);
    // answer_path is a directory (statSync succeeds but not a file)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-dir-"));
    const store2 = makeStore();
    store2.set("answer_path", "string", root);
    expect(cb(makeState({ store: store2 }))).toBe(true);
  });

  it("instructions reference the dedicated answer file path and the current question", () => {
    const instr = answerPhase.instructions as string;
    expect(instr).toContain(`\${answer_path}`);
    expect(instr).toContain(`\${nextQuestion}`);
    expect(instr).toContain('displayMode: "inline"');
  });
});

// ---------------------------------------------------------------------------
// refine-answer — second-chance phase rewriting the same dedicated file
// ---------------------------------------------------------------------------

describe("refine-answer", () => {
  it("is a standard LLM phase with a non-empty-existence durability loop and maxIterations 2", () => {
    expect(refinePhase.kind).toBeUndefined();
    expect(refinePhase.maxIterations).toBe(2);
    const cb = refinePhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(typeof cb).toBe("function");

    // missing path → not written → keep looping
    expect(cb(makeState())).toBe(true);

    // non-empty file → advance
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-ref-"));
    const file = path.join(root, "q-0.md");
    fs.writeFileSync(file, "improved answer", "utf8");
    const store = makeStore();
    store.set("answer_path", "string", file);
    expect(cb(makeState({ store }))).toBe(false);
  });

  it("instructions direct rewriting the same answer file for the current question", () => {
    const instr = refinePhase.instructions as string;
    expect(instr).toContain(`\${answer_path}`);
    expect(instr).toContain(`\${nextQuestion}`);
    expect(instr).toContain("rewrite it to the same file");
  });
});

// ---------------------------------------------------------------------------
// merge-notes — post-loop consolidation of per-question files into the notes
// ---------------------------------------------------------------------------

describe("merge-notes", () => {
  it("concatenates every per-question answer file in mtime order into the notes file preserving the header", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-merge-"));
    const answersDir = path.join(root, "answers");
    fs.mkdirSync(answersDir);
    const notesPath = path.join(root, "notes.md");
    fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
    const fA = path.join(answersDir, "q-aaa-11111111.md");
    const fB = path.join(answersDir, "q-bbb-22222222.md");
    fs.writeFileSync(fA, "Answer A", "utf8");
    fs.writeFileSync(fB, "Answer B", "utf8");
    // B answered earlier (earlier mtime) than A — merge follows mtime order,
    // not filename order ("bbb" > "aaa" would otherwise put A first)
    fs.utimesSync(fB, new Date(1000), new Date(1000));
    fs.utimesSync(fA, new Date(2000), new Date(2000));

    const store = makeStore();
    store.set("answers_dir", "string", answersDir);
    store.set("notes_path", "string", notesPath);
    runCode(mergeNotesPhase, makeState({ store }));

    const content = fs.readFileSync(notesPath, "utf8");
    expect(content).toContain("# Research Notes");
    // mtime order: B (earlier mtime) before A (later mtime)
    expect(content.indexOf("Answer B")).toBeLessThan(
      content.indexOf("Answer A"),
    );
    expect(content).toContain("Answer A");
    expect(content).toContain("Answer B");
  });

  it("ignores non-matching files in the answers dir and skips unreadable ones", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-merge2-"));
    const answersDir = path.join(root, "answers");
    fs.mkdirSync(answersDir);
    const notesPath = path.join(root, "notes.md");
    fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
    fs.writeFileSync(
      path.join(answersDir, "q-real-11111111.md"),
      "Real answer",
      "utf8",
    );
    fs.writeFileSync(
      path.join(answersDir, "stray.txt"),
      "not an answer",
      "utf8",
    );

    const store = makeStore();
    store.set("answers_dir", "string", answersDir);
    store.set("notes_path", "string", notesPath);
    runCode(mergeNotesPhase, makeState({ store }));

    const content = fs.readFileSync(notesPath, "utf8");
    expect(content).toContain("Real answer");
    expect(content).not.toContain("not an answer");
  });

  it("is total — missing answers dir or notes path does not throw", () => {
    // no store vars at all
    expect(() => runCode(mergeNotesPhase, makeState())).not.toThrow();
    // answers dir missing but notes_path set → no write, no throw
    const store = makeStore();
    store.set("notes_path", "string", "/tmp/does-not-exist-pio/notes.md");
    expect(() => runCode(mergeNotesPhase, makeState({ store }))).not.toThrow();
    expect(fs.existsSync("/tmp/does-not-exist-pio/notes.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reset-vars (static variable reset at the start of every pass)
// ---------------------------------------------------------------------------

describe("reset-vars", () => {
  it("declares static questionAnswered=false and nextQuestion='' and resets stale values", () => {
    expect(resetPhase.kind).toBe("variable-definition");
    const vars = resetPhase.variables as Array<{
      name: string;
      type: string;
      kind: string;
      value?: unknown;
    }>;
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({
      name: "questionAnswered",
      type: "boolean",
      kind: "static",
      value: false,
    });
    expect(vars[1]).toMatchObject({
      name: "nextQuestion",
      type: "string",
      kind: "static",
      value: "",
    });

    // Behavior: running preparePhaseVariables overrides stale values
    const store = makeStore();
    store.set("questionAnswered", "boolean", true);
    store.set("nextQuestion", "string", "stale");
    preparePhaseVariables(resetPhase, store);
    expect(store.get("questionAnswered")).toBe(false);
    expect(store.get("nextQuestion")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// validate-answer (llm judgment variable)
// ---------------------------------------------------------------------------

describe("validate-answer", () => {
  it("is a variable-definition phase with an llm boolean questionAnswered", () => {
    expect(validatePhase.kind).toBe("variable-definition");
    const vars = validatePhase.variables as Array<{
      name: string;
      type: string;
      kind: string;
    }>;
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({
      name: "questionAnswered",
      type: "boolean",
      kind: "llm",
    });
  });
});

// ---------------------------------------------------------------------------
// generate-questions + merge-questions (discovery)
// ---------------------------------------------------------------------------

describe("generate-questions and merge-questions", () => {
  it("generate-questions is a variable-definition phase declaring llm array new_questions", () => {
    expect(generateQuestions.kind).toBe("variable-definition");
    const vars = generateQuestions.variables as Array<{
      name: string;
      type: string;
      kind: string;
    }>;
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({
      name: "new_questions",
      type: "array",
      kind: "llm",
    });
  });

  it("generate-questions carries the complete-architecture-coverage mandate", () => {
    const description = (
      generateQuestions.variables as Array<{ description?: string }>
    )[0]?.description as string;
    expect(description).toContain("complete architecture coverage");
    expect(description).toContain("coverage gaps");
  });

  it("merge-questions appends new_questions to the queue and resets new_questions to []", () => {
    const state = seedState();
    state.store?.set("new_questions", "array", ["Q-new-1", "Q-new-2"]);
    runCode(mergeQuestions, state);
    const questions = state.store?.get("questions") as string[];
    expect(questions).toHaveLength(18);
    expect(questions.slice(16)).toEqual(["Q-new-1", "Q-new-2"]);
    expect(state.store?.get("new_questions")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// repeatWhile polarity (both loops loop while the queue is non-empty)
// ---------------------------------------------------------------------------

describe("repeatWhile polarity", () => {
  it("inner and outer loops repeat while any question remains", () => {
    const outerRepeat = researchLoop.repeatWhile as (
      s: PioSessionState,
    ) => boolean | unknown;
    const innerRepeat = innerLoop.repeatWhile as (
      s: PioSessionState,
    ) => boolean | unknown;

    const full = seedState();
    expect(outerRepeat(full)).toBeTruthy();
    expect(innerRepeat(full)).toBeTruthy();

    // drain the queue
    const drained = seedState();
    drained.store?.set("questions", "array", []);
    expect(outerRepeat(drained)).toBeFalsy();
    expect(innerRepeat(drained)).toBeFalsy();

    // undefined queue → falsy (no questions)
    expect(outerRepeat(makeState())).toBeFalsy();
    expect(innerRepeat(makeState())).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Loop-body structure
// ---------------------------------------------------------------------------

describe("research-loop structure", () => {
  it("inner loop body is exactly [reset-vars, get-next-question, answer-question, refine-loop, pop-question]", () => {
    expect(innerLoop.kind).toBe("loop");
    expect(innerBody.map((p) => p.id)).toEqual([
      "reset-vars",
      "get-next-question",
      "answer-question",
      "refine-loop",
      "pop-question",
    ]);
    // answer-question is the sole standard (LLM) phase in the inner body
    expect(innerBody[2].kind).toBeUndefined();
    // pop-question is a code phase AFTER the refinement loop — never inside arms
    expect(popPhase.kind).toBe("code");
  });

  it("refine-loop body is exactly [validate-answer, branch-if-unanswered]; repeatWhile loops while questionAnswered !== true", () => {
    expect(refineLoop.kind).toBe("loop");
    expect(refineLoop.maxIterations).toBe(3);
    expect(refineBody.map((p) => p.id)).toEqual([
      "validate-answer",
      "branch-if-unanswered",
    ]);
    const repeat = refineLoop.repeatWhile as (
      s: PioSessionState,
    ) => boolean | unknown;
    // unsatisfied → keep refining (loop back to re-judge)
    expect(
      repeat(
        makeState({ store: withVar("questionAnswered", "boolean", false) }),
      ),
    ).toBeTruthy();
    // satisfied → exit the refinement loop
    expect(
      repeat(
        makeState({ store: withVar("questionAnswered", "boolean", true) }),
      ),
    ).toBeFalsy();
    // undefined → not satisfactory → keep refining
    expect(repeat(makeState())).toBeTruthy();
  });

  it("a refined answer is re-validated before the question is popped (false → refine → re-judge true → only then pop)", () => {
    const cond = branchPhase.condition as (
      s: PioSessionState,
    ) => boolean | unknown;
    const repeat = refineLoop.repeatWhile as (
      s: PioSessionState,
    ) => boolean | unknown;

    const state = seedState();
    const firstQ = (state.store?.get("questions") as string[])[0];

    // Pass 1: validate-answer judges unsatisfactory (questionAnswered = false).
    state.store?.set("questionAnswered", "boolean", false);
    // branch-if-unanswered: false → refine arm selected (refine rewrites the file)
    expect(cond(state)).toBeTruthy();
    // repeatWhile: questionAnswered !== true → loop back to re-judge
    expect(repeat(state)).toBeTruthy();

    // The refined draft is NOT popped while it is still judged unsatisfactory.
    expect((state.store?.get("questions") as string[])[0]).toBe(firstQ);

    // Pass 2: validate-answer re-judges the refined draft satisfactory.
    state.store?.set("questionAnswered", "boolean", true);
    // branch-if-unanswered: true → skip refine arm (absent else → loop-end)
    expect(cond(state)).toBeFalsy();
    // repeatWhile: questionAnswered === true → exit the loop
    expect(repeat(state)).toBeFalsy();

    // The single pop-question runs only after re-validation passes.
    expect((state.store?.get("questions") as string[])[0]).toBe(firstQ);
    runCode(popPhase, state);
    const remaining = state.store?.get("questions") as string[];
    expect(remaining[0]).toBe(SEEDED_THEMES[1]);
  });

  it("outer loop body is exactly [answer-questions, merge-notes, generate-questions, merge-questions]", () => {
    expect(researchLoop.kind).toBe("loop");
    expect((researchLoop.body as WorkflowPhase[]).map((p) => p.id)).toEqual([
      "answer-questions",
      "merge-notes",
      "generate-questions",
      "merge-questions",
    ]);
  });

  it("merge-notes is a code phase in the outer body (after the inner loop)", () => {
    expect(mergeNotesPhase.kind).toBe("code");
    expect(mergeNotesPhase.id).toBe("merge-notes");
    expect(innerLoop.id).toBe("answer-questions");
  });
});

// ---------------------------------------------------------------------------
// clarify — lean final gap-check, no loop fields
// ---------------------------------------------------------------------------

describe("clarify", () => {
  it("is a lean single-run phase (no loop fields, no write gates)", () => {
    const clarify = workflow[2] as WorkflowPhase;
    expect(clarify.id).toBe("clarify");
    expect(clarify.kind).toBeUndefined();
    expect(clarify.maxIterations).toBeUndefined();
    expect(clarify.minIterations).toBeUndefined();
    expect(clarify.terminateWhen).toBeUndefined();
    expect(clarify.loopWhile).toBeUndefined();
    expect(clarify.write).toBeUndefined();
    expect(clarify.allowProjectWrites).toBeUndefined();
    expect(clarify.instructions).toContain(`\${notes_path}`);
  });
});

// ---------------------------------------------------------------------------
// Write-phase validation-loop polarity
// ---------------------------------------------------------------------------

describe("write-phase loopWhile", () => {
  const outputs = [
    "overview",
    "development",
    "conventions",
    "git",
    "architecture",
    "dependencies",
    "glossary",
  ];

  it("gates exactly its own single output name", () => {
    expect(writePhases).toHaveLength(7);
    for (let i = 0; i < outputs.length; i++) {
      expect(writePhases[i].write).toEqual([outputs[i]]);
    }
  });

  it.each(
    outputs,
  )("for %s: missing → true, present → false, unresolvable → true", (name) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-write-"));
    const file = path.join(root, `${name}.md`);
    const phase = writePhases[outputs.indexOf(name)];
    const cb = phase.loopWhile?.[0].callback as (s: PioSessionState) => boolean;

    // missing
    expect(cb(makeState({ capState: makeCapState({ [name]: file }) }))).toBe(
      true,
    );

    // present
    fs.writeFileSync(file, "some content\n", "utf8");
    expect(cb(makeState({ capState: makeCapState({ [name]: file }) }))).toBe(
      false,
    );

    // unresolvable path
    expect(cb(makeState({ capState: makeCapState({}) }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanup — removes the session-scoped scratch directory after the writes
// ---------------------------------------------------------------------------

describe("cleanup", () => {
  it("is a code phase that removes the scratch directory (from notes_path) after writes", () => {
    expect(cleanupPhase.kind).toBe("code");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-clean-"));
    const notesPath = path.join(root, "notes.md");
    fs.mkdirSync(path.join(root, "answers"));
    fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
    fs.writeFileSync(path.join(root, "answers", "q-deadbeef.md"), "x", "utf8");
    const store = makeStore();
    store.set("notes_path", "string", notesPath);
    runCode(cleanupPhase, makeState({ store }));
    // the scratch root (parent of notes_path) is gone
    expect(fs.existsSync(root)).toBe(false);
  });

  it("is total — missing notes_path does not throw", () => {
    expect(() => runCode(cleanupPhase, makeState())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Structure pins
// ---------------------------------------------------------------------------

describe("workflow structure", () => {
  const expectedTopLevel = [
    "default-questions",
    "research-loop",
    "clarify",
    "write-overview",
    "write-development",
    "write-conventions",
    "write-git",
    "write-architecture",
    "write-dependencies",
    "write-glossary",
    "cleanup",
  ];

  it("has 11 top-level phases in order with correct kinds", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBe("code");
    expect(workflow[1].kind).toBe("loop");
    expect(workflow[2].kind).toBeUndefined();
    for (const p of writePhases) {
      expect(p.kind).toBeUndefined();
    }
    expect(workflow[10].kind).toBe("code");
  });

  it("carries no number-prefixed titles anywhere", () => {
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.title).not.toMatch(/^Phase \d+:/);
        if (p.body) visit(p.body);
        if (p.then) visit(p.then);
        if (p.else) visit(p.else);
      }
    };
    visit(workflow);
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
});

// ---------------------------------------------------------------------------
// Local helper used above — build a store with a single variable preset
// ---------------------------------------------------------------------------

function withVar(
  name: string,
  type: "boolean" | "string" | "array",
  value: unknown,
): SessionVariableStore {
  const store = makeStore();
  store.set(name, type, value);
  return store;
}

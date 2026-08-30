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
const generateQuestions = (researchLoop.body as WorkflowPhase[])[1];
const mergeQuestions = (researchLoop.body as WorkflowPhase[])[2];
const innerBody = innerLoop.body as WorkflowPhase[];
const resetPhase = innerBody[0];
const getNextPhase = innerBody[1];
const validatePhase = innerBody[3];
const branchPhase = innerBody[4];
const branchThen = branchPhase.then as WorkflowPhase[];
const snapshotPhase = branchThen[0];
const popPhase = branchThen[2];
const writePhases = workflow.slice(3) as WorkflowPhase[];

// ---------------------------------------------------------------------------
// default-questions seed
// ---------------------------------------------------------------------------

describe("default-questions seed", () => {
  it("seeds the questions queue with exactly 16 default themes and creates the notes file", () => {
    const state = seedState();
    const questions = state.store?.get("questions") as string[];
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(16);
    expect(questions).toEqual(SEEDED_THEMES);

    const notesPath = state.store?.get("notes_path") as string;
    expect(typeof notesPath).toBe("string");
    expect(fs.existsSync(notesPath)).toBe(true);
    expect(fs.readFileSync(notesPath, "utf8")).toContain("# Research Notes");
  });

  it("re-seeds fresh (overwriting any stale queue and notes file) on re-run", () => {
    const state = seedState();
    state.store?.set("questions", "array", ["stale"]);
    fs.writeFileSync(
      state.store?.get("notes_path") as string,
      "stale notes\n",
      "utf8",
    );
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
  });
});

// ---------------------------------------------------------------------------
// get-next-question (peek) and pop-question (shift)
// ---------------------------------------------------------------------------

describe("question queue code steps", () => {
  it("get-next-question peeks the front into nextQuestion WITHOUT popping", () => {
    const state = seedState();
    runCode(getNextPhase, state);
    expect(state.store?.get("nextQuestion")).toBe(SEEDED_THEMES[0]);
    // queue unchanged — peek does not pop
    expect(state.store?.get("questions")).toEqual(SEEDED_THEMES);
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

describe("branch-if-answered", () => {
  it("routes to the then arm only when questionAnswered is exactly true", () => {
    const condition = branchPhase.condition as (
      s: PioSessionState,
    ) => boolean | unknown;
    expect(
      condition(
        makeState({ store: withVar("questionAnswered", "boolean", true) }),
      ),
    ).toBeTruthy();
    expect(
      condition(
        makeState({ store: withVar("questionAnswered", "boolean", false) }),
      ),
    ).toBeFalsy();
    expect(condition(makeState())).toBeFalsy();
  });

  it("then arm is exactly [snapshot-notes, write-notes, pop-question] (snapshot-then-write-then-pop); else arm is absent (skip)", () => {
    expect(branchPhase.kind).toBe("branch:if");
    expect(branchThen.map((p) => p.id)).toEqual([
      "snapshot-notes",
      "write-notes",
      "pop-question",
    ]);
    expect(branchPhase.else).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// snapshot-notes — captures the notes file size before the write attempt
// ---------------------------------------------------------------------------

describe("snapshot-notes", () => {
  it("records the current notes file size into notes_baseline", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-snap-"));
    const notesPath = path.join(root, "notes.md");
    fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
    const store = makeStore();
    store.set("notes_path", "string", notesPath);
    runCode(snapshotPhase, makeState({ store }));
    expect(store.get("notes_baseline")).toBe(fs.statSync(notesPath).size);
  });

  it("records the sentinel -1 when the notes file is unreadable or path is missing", () => {
    // unreadable/missing file
    const store = makeStore();
    store.set("notes_path", "string", "/nonexistent/path/notes.md");
    runCode(snapshotPhase, makeState({ store }));
    expect(store.get("notes_baseline")).toBe(-1);

    // no notes_path variable at all
    const store2 = makeStore();
    runCode(snapshotPhase, makeState({ store: store2 }));
    expect(store2.get("notes_baseline")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// write-notes — mechanical completeness loop (size-based edit detection)
// ---------------------------------------------------------------------------

describe("write-notes completeness loop", () => {
  const writeNotes = branchThen[1] as WorkflowPhase;

  it("replays until the note's file size changes from baseline (loopWhile on !notesEdited)", () => {
    expect(writeNotes.id).toBe("write-notes");
    expect(writeNotes.maxIterations).toBe(2);
    const cb = writeNotes.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(typeof cb).toBe("function");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-notes-"));
    const notesPath = path.join(root, "notes.md");
    const store = makeStore();
    store.set("notes_path", "string", notesPath);
    store.set("nextQuestion", "string", "What is the tree?");

    // size unchanged from baseline → not edited → keep looping
    fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
    store.set("notes_baseline", "number", fs.statSync(notesPath).size);
    expect(cb(makeState({ store }))).toBe(true);

    // size changed (note appended) → edited → advance
    fs.writeFileSync(
      notesPath,
      "# Research Notes\n\n**Question:** What is the tree?\nAnswer.\n",
      "utf8",
    );
    expect(cb(makeState({ store }))).toBe(false);
  });

  it("keeps looping when the note is a substring of an earlier-written note (no false positive)", () => {
    const cb = writeNotes.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // current question B is a strict substring of an earlier-written note A.
    // Substring matching would falsely advance; size-based detection keeps
    // looping because the file has not grown.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-notes-"));
    const notesPath = path.join(root, "notes.md");
    const store = makeStore();
    store.set("notes_path", "string", notesPath);
    store.set("nextQuestion", "string", "What is the build command?");
    // Earlier note already contains B as a substring
    fs.writeFileSync(
      notesPath,
      "# Research Notes\n\n**Question:** What is the build command and test setup?\nAnswer.\n",
      "utf8",
    );
    store.set("notes_baseline", "number", fs.statSync(notesPath).size);
    // size unchanged → keep looping (no false-positive advance)
    expect(cb(makeState({ store }))).toBe(true);
  });

  it("is total — missing baseline or unreadable file keep looping without throwing", () => {
    const cb = writeNotes.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // no store vars → no baseline → keep looping
    expect(cb(makeState())).toBe(true);
    // notes_path + nextQuestion set but no baseline → keep looping
    const store = makeStore();
    store.set("notes_path", "string", "/nonexistent/path/notes.md");
    store.set("nextQuestion", "string", "q");
    expect(cb(makeState({ store }))).toBe(true);
    // baseline is sentinel -1 and file still unreadable → keep looping
    const store2 = makeStore();
    store2.set("notes_path", "string", "/nonexistent/path/notes.md");
    store2.set("nextQuestion", "string", "q");
    store2.set("notes_baseline", "number", -1);
    expect(cb(makeState({ store: store2 }))).toBe(true);
  });

  it("advances when there is no current question (empty nextQuestion)", () => {
    const cb = writeNotes.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-notes-"));
    const notesPath = path.join(root, "notes.md");
    const store = makeStore();
    store.set("notes_path", "string", notesPath);
    store.set("notes_baseline", "number", 0);
    store.set("nextQuestion", "string", "");
    // loopWhile is !notesEdited; empty question → notesEdited true → advance
    expect(cb(makeState({ store }))).toBe(false);
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
// Inner-loop body structure
// ---------------------------------------------------------------------------

describe("research-loop structure", () => {
  it("inner loop body is exactly [reset-vars, get-next-question, answer-question, validate-answer, branch-if-answered]", () => {
    expect(innerLoop.kind).toBe("loop");
    expect(innerBody.map((p) => p.id)).toEqual([
      "reset-vars",
      "get-next-question",
      "answer-question",
      "validate-answer",
      "branch-if-answered",
    ]);
    // answer-question is the sole standard (LLM) phase in the inner body
    expect(innerBody[2].kind).toBeUndefined();
  });

  it("outer loop body is exactly [answer-questions, generate-questions, merge-questions]", () => {
    expect(researchLoop.kind).toBe("loop");
    expect((researchLoop.body as WorkflowPhase[]).map((p) => p.id)).toEqual([
      "answer-questions",
      "generate-questions",
      "merge-questions",
    ]);
  });

  it("answer-question interpolates the next question and notes reference", () => {
    const instr = innerBody[2].instructions as string;
    expect(instr).toContain(`\${nextQuestion}`);
    expect(instr).toContain('displayMode: "inline"');
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
  ];

  it("has 10 top-level phases in order with correct kinds", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBe("code");
    expect(workflow[1].kind).toBe("loop");
    expect(workflow[2].kind).toBeUndefined();
    for (const p of writePhases) {
      expect(p.kind).toBeUndefined();
    }
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

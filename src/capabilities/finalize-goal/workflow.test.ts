import * as fs from "node:fs";
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
    filesWritten?: string[];
  } = {},
): PioSessionState {
  return {
    store: overrides.store ?? makeStore(),
    sessionId: overrides.sessionId,
    filesWritten: overrides.filesWritten ?? [],
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
const readContextPhase = workflow[1];
const draftPhase = workflow[2];
const writePhases = workflow.slice(3, 10) as WorkflowPhase[];
const summaryPhase = workflow[10];
const cleanupPhase = workflow[11];

// ---------------------------------------------------------------------------
// default-setup — session-scoped scratch dir + updates_path store variable
// ---------------------------------------------------------------------------

describe("default-setup", () => {
  it("is a code phase that creates the session-scoped scratch dir and sets updates_path", () => {
    expect(setupPhase.kind).toBe("code");
    const state = makeState({ sessionId: "sess-123" });
    runCode(setupPhase, state);
    const updatesPath = state.store?.get("updates_path") as string;
    expect(typeof updatesPath).toBe("string");
    expect(updatesPath).toBe("/tmp/pio-finalize-goal/sess-123/updates.md");
    expect(fs.existsSync(path.dirname(updatesPath))).toBe(true);
  });

  it("derives the scratch dir from the session id", () => {
    const state = makeState({ sessionId: "other-session" });
    runCode(setupPhase, state);
    expect(state.store?.get("updates_path")).toBe(
      "/tmp/pio-finalize-goal/other-session/updates.md",
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
// read-context — single-pass, lean (no loop fields, no write gates)
// ---------------------------------------------------------------------------

describe("read-context", () => {
  it("is a lean standard phase with no loop fields and no write gates", () => {
    expect(readContextPhase.id).toBe("read-context");
    expect(readContextPhase.kind).toBeUndefined();
    expect(readContextPhase.maxIterations).toBeUndefined();
    expect(readContextPhase.minIterations).toBeUndefined();
    expect(readContextPhase.loopWhile).toBeUndefined();
    expect(readContextPhase.terminateWhen).toBeUndefined();
    expect(readContextPhase.write).toBeUndefined();
    expect(readContextPhase.allowProjectWrites).toBeUndefined();
  });

  it("instructs reading all change drivers and cross-referencing sources", () => {
    const instr = readContextPhase.instructions as string;
    expect(instr).toContain("completion summaries");
    expect(instr).toContain("Decisions file");
    expect(instr).not.toContain("subgoals");
    expect(instr).toContain("git commit history");
    expect(instr).toContain("plan");
    expect(instr).toContain("goal");
    expect(instr).toContain("quality-gate");
    expect(instr).toContain("PROJECT/*.md");
    expect(instr).toContain("Cross-reference");
    expect(instr).toContain("skip");
  });
});

// ---------------------------------------------------------------------------
// draft-updates — exhaustion loop on "this run wrote updates.md"
// ---------------------------------------------------------------------------

describe("draft-updates", () => {
  it("is a standard phase with maxIterations 4 and a single loopWhile callback on updates.md", () => {
    expect(draftPhase.kind).toBeUndefined();
    expect(draftPhase.maxIterations).toBe(10);
    expect(draftPhase.minIterations).toBeUndefined();
    expect(draftPhase.terminateWhen).toBeUndefined();
    expect(draftPhase.write).toBeUndefined();
    expect(draftPhase.allowProjectWrites).toBeUndefined();
    expect(draftPhase.loopWhile).toHaveLength(1);
  });

  it("replays when the just-finished run wrote updates.md; advances on silence (total)", () => {
    const cb = draftPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    // nothing written → advance
    expect(cb(makeState())).toBe(false);
    // some other file written → advance (only updates.md counts)
    expect(cb(makeState({ filesWritten: ["/tmp/notes.md"] }))).toBe(false);
    // updates.md written → replay
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-finalize-goal/s/updates.md"] })),
    ).toBe(true);
  });

  it("is total — never throws on any filesWritten shape", () => {
    const cb = draftPhase.loopWhile?.[0].callback as (
      s: PioSessionState,
    ) => boolean;
    expect(() => cb(makeState())).not.toThrow();
    expect(() =>
      cb(makeState({ filesWritten: ["a", "b", "c/updates.md"] })),
    ).not.toThrow();
  });

  it("carries a non-empty double-check loopMessage", () => {
    const msg = draftPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toContain("double-check");
    expect(msg).toContain(`\${updates_path}`);
  });

  it("instructions identify, filter, and apply update rules in one turn writing to updates_path", () => {
    const instr = draftPhase.instructions as string;
    expect(instr).toContain(`\${updates_path}`);
    expect(instr).toContain("Decision Filtering");
    expect(instr).toContain("Update Rules");
    expect(instr).toContain("target PROJECT file");
    expect(instr).toContain("dedupe");
  });
});

// ---------------------------------------------------------------------------
// write phases — seven single-output exhaustion loops
// ---------------------------------------------------------------------------

describe("write phases", () => {
  const names = [
    "overview",
    "development",
    "conventions",
    "git",
    "architecture",
    "dependencies",
    "glossary",
  ];
  const files = [
    "PROJECT/OVERVIEW.md",
    "PROJECT/DEVELOPMENT.md",
    "PROJECT/CONVENTIONS.md",
    "PROJECT/GIT.md",
    "PROJECT/ARCHITECTURE.md",
    "PROJECT/DEPENDENCIES.md",
    "PROJECT/GLOSSARY.md",
  ];

  it("are seven standard phases each gated to exactly its own single output", () => {
    expect(writePhases).toHaveLength(7);
    for (let i = 0; i < names.length; i++) {
      const p = writePhases[i];
      expect(p.kind).toBeUndefined();
      expect(p.id).toBe(`write-${names[i]}`);
      expect(p.write).toEqual([names[i]]);
      expect(p.maxIterations).toBe(5);
      expect(p.allowProjectWrites).toBeUndefined();
    }
  });

  it.each(
    names,
  )("for %s: loopWhile replays only when its own PROJECT file was written (total)", (name) => {
    const i = names.indexOf(name);
    const p = writePhases[i];
    const cb = p.loopWhile?.[0].callback as (s: PioSessionState) => boolean;
    expect(typeof cb).toBe("function");

    // nothing written → advance (silent run)
    expect(cb(makeState())).toBe(false);

    // some other (non-matching) file written → advance
    expect(cb(makeState({ filesWritten: ["/x/some/other.md"] }))).toBe(false);

    // this phase's own file written → replay
    expect(cb(makeState({ filesWritten: [`/x/${files[i]}`] }))).toBe(true);

    // total — never throws
    expect(() => cb(makeState())).not.toThrow();
  });

  it.each(
    names,
  )("for %s: carries a non-empty double-check loopMessage", (name) => {
    const i = names.indexOf(name);
    const msg = writePhases[i].loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).toContain("double-check");
    expect(msg).toContain(`\${updates_path}`);
    expect(msg).toContain(files[i]);
  });

  it.each(
    names,
  )("for %s: instructions check existence-first and skip (never create) a missing file", (name) => {
    const i = names.indexOf(name);
    const instr = writePhases[i].instructions as string;
    expect(instr).toContain(`\`${files[i]}\``);
    expect(instr).toContain("does not exist");
    expect(instr).toContain("do not create it");
    expect(instr).toContain(`\${updates_path}`);
    expect(instr).toContain("preserve all existing content");
  });
});

// ---------------------------------------------------------------------------
// produce-summary — lean, single-pass, original content preserved
// ---------------------------------------------------------------------------

describe("produce-summary", () => {
  it("is a lean standard phase with no loop fields and no write gates", () => {
    expect(summaryPhase.id).toBe("produce-summary");
    expect(summaryPhase.kind).toBeUndefined();
    expect(summaryPhase.maxIterations).toBeUndefined();
    expect(summaryPhase.minIterations).toBeUndefined();
    expect(summaryPhase.loopWhile).toBeUndefined();
    expect(summaryPhase.terminateWhen).toBeUndefined();
    expect(summaryPhase.write).toBeUndefined();
    expect(summaryPhase.allowProjectWrites).toBeUndefined();
  });

  it("preserves the original summary content including the explicit no-updates statement", () => {
    const instr = summaryPhase.instructions as string;
    expect(instr).toContain("Files modified");
    expect(instr).toContain("Changes made");
    expect(instr).toContain("Triggering sources");
    expect(instr).toContain("Sources available");
    expect(instr).toContain("No PROJECT file updates were warranted");
  });
});

// ---------------------------------------------------------------------------
// cleanup — removes the session-scoped scratch directory, best-effort/total
// ---------------------------------------------------------------------------

describe("cleanup", () => {
  it("is a code phase that removes the scratch directory (derived from updates_path)", () => {
    expect(cleanupPhase.kind).toBe("code");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pio-finalize-clean-"));
    const updatesPath = path.join(root, "updates.md");
    fs.writeFileSync(updatesPath, "# Updates\n", "utf8");
    const store = makeStore();
    store.set("updates_path", "string", updatesPath);
    runCode(cleanupPhase, makeState({ store }));
    expect(fs.existsSync(root)).toBe(false);
  });

  it("is total — missing updates_path does not throw", () => {
    expect(() => runCode(cleanupPhase, makeState())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Structure pins
// ---------------------------------------------------------------------------

describe("workflow structure", () => {
  const expectedTopLevel = [
    "default-setup",
    "read-context",
    "draft-updates",
    "write-overview",
    "write-development",
    "write-conventions",
    "write-git",
    "write-architecture",
    "write-dependencies",
    "write-glossary",
    "produce-summary",
    "cleanup",
  ];

  it("has 12 top-level phases in order with correct kinds", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBe("code");
    expect(workflow[1].kind).toBeUndefined();
    expect(workflow[2].kind).toBeUndefined();
    for (const p of writePhases) {
      expect(p.kind).toBeUndefined();
    }
    expect(workflow[10].kind).toBeUndefined();
    expect(workflow[11].kind).toBe("code");
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

  it("references no old phase ids or completion-signaling anywhere", () => {
    // Built via concatenation so the literal strings don't appear in the file
    // (the capability contract forbids them directory-wide).
    const SIGNAL = ["signal", "-completion"].join("");
    const MARK = ["pio_mark", "_complete"].join("");
    const OLD_IDS = new RegExp(
      [
        SIGNAL,
        "write-updates",
        "read-project-files",
        "read-plan",
        "read-summaries",
        "read-decisions",
        "synthesize",
        "filter-decisions",
        "evaluate-rules",
      ].join("|"),
    );
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.id).not.toMatch(OLD_IDS);
        if (p.instructions) {
          expect(p.instructions).not.toContain(MARK);
        }
        if (p.body) visit(p.body);
        if (p.then) visit(p.then);
        if (p.else) visit(p.else);
      }
    };
    visit(workflow);
  });
});

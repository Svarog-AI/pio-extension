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
    projectRoot?: string;
    filesWritten?: string[];
    askUserCalled?: boolean;
  } = {},
): PioSessionState {
  return {
    store: overrides.store ?? makeStore(),
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

/** The 5 TDD sub-phases inside the inner tdd-process loop, keyed by id. */
const tddBodyById = (id: string): WorkflowPhase =>
  (iterativeTddPhase.body?.[1].body ?? []).find((p) => p.id === id)!;

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
// default-setup — session-scoped scratch dir + notes_path store variable
// ---------------------------------------------------------------------------

describe("default-setup", () => {
  it("is a code phase that creates the session-scoped scratch dir and sets notes_path", () => {
    expect(setupPhase.kind).toBe("code");
    const state = makeState({ sessionId: "sess-123" });
    runCode(setupPhase, state);
    const notesPath = state.store?.get("notes_path") as string;
    expect(typeof notesPath).toBe("string");
    expect(notesPath).toBe("/tmp/pio-execute-task/sess-123/notes.md");
    expect(fs.existsSync(path.dirname(notesPath))).toBe(true);
  });

  it("derives the scratch dir from the session id", () => {
    const state = makeState({ sessionId: "other-session" });
    runCode(setupPhase, state);
    expect(state.store?.get("notes_path")).toBe(
      "/tmp/pio-execute-task/other-session/notes.md",
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
// research-context — exhaustion loop (evidence-fixpoint) on the scratch notes
// ---------------------------------------------------------------------------

describe("research-context", () => {
  it("is a standard phase with maxIterations and a single loopWhile callback on notes.md", () => {
    expect(researchPhase.id).toBe("research-context");
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
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/notes.md"] })),
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
    expect(instr).toContain('displayMode: "inline"');
  });

  it("preserves the per-phase source-research skill for external libraries", () => {
    expect(researchPhase.skills?.recommended).toEqual([
      { name: "source-research", condition: expect.any(String) },
    ]);
  });
});

// ---------------------------------------------------------------------------
// iterative-tdd (outer loop) — task-generation + inner tdd-process +
// verify-acceptance-criteria; advances when tasks-complete/blocked marker
// ---------------------------------------------------------------------------

describe("iterative-tdd (outer loop)", () => {
  it("is a kind:loop do-while block with maxIterations and a total repeatWhile on the terminal markers", () => {
    expect(iterativeTddPhase.id).toBe("iterative-tdd");
    expect(iterativeTddPhase.kind).toBe("loop");
    expect(iterativeTddPhase.maxIterations).toBe(12);
    expect(iterativeTddPhase.body).toHaveLength(3);
  });

  it("advances when tasks-complete.txt or blocked.txt was written; repeats otherwise (total)", () => {
    const cb = iterativeTddPhase.repeatWhile as (s: PioSessionState) => boolean;
    // terminal marker written → advance (stop repeating)
    expect(
      cb(
        makeState({
          filesWritten: ["/tmp/pio-execute-task/s/tasks-complete.txt"],
        }),
      ),
    ).toBe(false);
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/blocked.txt"] })),
    ).toBe(false);
    // nothing terminal written → repeat (more tasks remain)
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/notes.md"] })),
    ).toBe(true);
    expect(cb(makeState())).toBe(true);
    // total — never throws on missing filesWritten
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains task-generation, the inner tdd-process loop, and verify-acceptance-criteria", () => {
    expect(iterativeTddPhase.body?.[0].id).toBe("task-generation");
    expect(iterativeTddPhase.body?.[1].id).toBe("tdd-process");
    expect(iterativeTddPhase.body?.[2].id).toBe("verify-acceptance-criteria");
  });

  it("carries a non-empty loopMessage nudging continuation", () => {
    const msg = iterativeTddPhase.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// tdd-process (inner loop) — the 5-phase TDD sequence; advances when the
// current task's verification passes (verified/blocked marker)
// ---------------------------------------------------------------------------

describe("tdd-process (inner loop)", () => {
  const inner = iterativeTddPhase.body?.[1];

  it("is a kind:loop do-while block with min/max iterations and a total repeatWhile", () => {
    expect(inner?.id).toBe("tdd-process");
    expect(inner?.kind).toBe("loop");
    expect(inner?.minIterations).toBe(1);
    expect(inner?.maxIterations).toBe(6);
    expect(inner?.body).toHaveLength(5);
  });

  it("advances when verified.txt or blocked.txt was written; repeats otherwise (total)", () => {
    const cb = inner?.repeatWhile as (s: PioSessionState) => boolean;
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/verified.txt"] })),
    ).toBe(false);
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/blocked.txt"] })),
    ).toBe(false);
    // neither marker → repeat (task not yet verified)
    expect(
      cb(makeState({ filesWritten: ["/tmp/pio-execute-task/s/notes.md"] })),
    ).toBe(true);
    expect(cb(makeState())).toBe(true);
    // total — never throws on missing filesWritten
    expect(() => cb(makeState())).not.toThrow();
  });

  it("body contains the 5 TDD phases in order", () => {
    expect(inner?.body?.map((p) => p.id)).toEqual([
      "write-tests",
      "implement",
      "verify-green",
      "refactor",
      "verify-final",
    ]);
  });

  it("carries a non-empty loopMessage nudging the current task to verification", () => {
    const msg = inner?.loopMessage as string;
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Conditional refinement loops on write-tests / implement / refactor;
// verify-green stays lean
// ---------------------------------------------------------------------------

describe("TDD sub-phase refinement loops", () => {
  it("write-tests replays while its change-marker was written; silent run advances (total)", () => {
    const phase = tddBodyById("write-tests");
    expect(phase.maxIterations).toBe(4);
    expect(phase.loopWhile).toHaveLength(1);
    const cb = phase.loopWhile?.[0].callback as (s: PioSessionState) => boolean;
    expect(
      cb(
        makeState({
          filesWritten: ["/tmp/pio-execute-task/s/write-tests-changed.txt"],
        }),
      ),
    ).toBe(true);
    expect(cb(makeState())).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect((phase.loopMessage as string).length).toBeGreaterThan(0);
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });

  it("implement replays while its change-marker was written; silent run advances (total)", () => {
    const phase = tddBodyById("implement");
    expect(phase.maxIterations).toBe(4);
    expect(phase.loopWhile).toHaveLength(1);
    const cb = phase.loopWhile?.[0].callback as (s: PioSessionState) => boolean;
    expect(
      cb(
        makeState({
          filesWritten: ["/tmp/pio-execute-task/s/implement-changed.txt"],
        }),
      ),
    ).toBe(true);
    expect(cb(makeState())).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect((phase.loopMessage as string).length).toBeGreaterThan(0);
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });

  it("refactor replays while its change-marker was written; silent run advances (total)", () => {
    const phase = tddBodyById("refactor");
    expect(phase.maxIterations).toBe(4);
    expect(phase.loopWhile).toHaveLength(1);
    const cb = phase.loopWhile?.[0].callback as (s: PioSessionState) => boolean;
    expect(
      cb(
        makeState({
          filesWritten: ["/tmp/pio-execute-task/s/refactor-changed.txt"],
        }),
      ),
    ).toBe(true);
    expect(cb(makeState())).toBe(false);
    expect(() => cb(makeState())).not.toThrow();
    expect((phase.loopMessage as string).length).toBeGreaterThan(0);
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
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

  it("verify-final carries the verified.txt-on-success / blocked.txt-on-blocker rule and tdd skill", () => {
    const phase = tddBodyById("verify-final");
    const instr = phase.instructions as string;
    expect(instr).toContain("verified.txt");
    expect(instr).toContain("blocked.txt");
    expect(instr).toContain("Only when all");
    expect(instr.toLowerCase()).toContain("never write");
    expect(phase.skills?.mandatory).toEqual(["tdd"]);
  });
});

// ---------------------------------------------------------------------------
// verify-acceptance-criteria — sole writer of the outer terminal markers
// ---------------------------------------------------------------------------

describe("verify-acceptance-criteria", () => {
  const phase = iterativeTddPhase.body?.[2];

  it("is the outer body's last phase", () => {
    expect(phase?.id).toBe("verify-acceptance-criteria");
    expect(iterativeTddPhase.body?.at(-1)?.id).toBe(
      "verify-acceptance-criteria",
    );
  });

  it("instructions carry the sole-writer discipline and stuck-task blocker handling", () => {
    const instr = phase?.instructions as string;
    expect(instr).toContain("tasks-complete.txt");
    expect(instr).toContain("blocked.txt");
    expect(instr).toContain("sole");
    expect(instr).toContain("stuck");
    expect(instr).toContain("max-iteration");
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-exec-hash-"));
    try {
      runInGitRepo(tempDir);
      const state = makeState({
        projectRoot: tempDir,
        sessionId: "s",
      });
      runCode(captureHashPhase, state);
      const hash = state.store?.get("commit_hash") as string;
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("leaves commit_hash unset when git fails (graceful)", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-exec-hash-"));
    try {
      // Not a git repository → git rev-parse HEAD fails
      const state = makeState({ projectRoot: tempDir, sessionId: "s" });
      expect(() => runCode(captureHashPhase, state)).not.toThrow();
      expect(state.store?.get("commit_hash")).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("push", () => {
  it("is a code phase that does not throw on a repo with no remote (graceful)", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-exec-push-"));
    try {
      runInGitRepo(tempDir);
      const state = makeState({ projectRoot: tempDir, sessionId: "s" });
      expect(() => runCode(pushPhase, state)).not.toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is a code phase", () => {
    expect(pushPhase.kind).toBe("code");
  });
});

/** Create a throwaway git repo with one commit in the given directory. */
function runInGitRepo(dir: string): void {
  const run = (cmd: string): void => {
    const { execSync } =
      require("node:child_process") as typeof import("node:child_process");
    execSync(cmd, { cwd: dir, encoding: "utf-8", stdio: "pipe" });
  };
  fs.writeFileSync(path.join(dir, "file.txt"), "hello", "utf-8");
  run("git init -q");
  run("git config user.email test@example.com");
  run("git config user.name Test");
  run("git add -A");
  run("git commit -q -m init");
}

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

  it("has 9 top-level phases in order with correct kinds (3 code, 1 loop, 5 standard)", () => {
    expect(workflow.map((p) => p.id)).toEqual(expectedTopLevel);
    expect(workflow[0].kind).toBeUndefined(); // read-task
    expect(workflow[1].kind).toBe("code"); // default-setup
    expect(workflow[2].kind).toBeUndefined(); // research-context
    expect(workflow[3].kind).toBe("loop"); // iterative-tdd
    expect(workflow[4].kind).toBeUndefined(); // write-test-file
    expect(workflow[5].kind).toBeUndefined(); // commit
    expect(workflow[6].kind).toBe("code"); // capture-commit-hash
    expect(workflow[7].kind).toBe("code"); // push
    expect(workflow[8].kind).toBeUndefined(); // write-summary-file
  });

  it("declares no allowProjectWrites and no variable-definition phases anywhere", () => {
    const visit = (phases: WorkflowPhase[]): void => {
      for (const p of phases) {
        expect(p.allowProjectWrites).toBeUndefined();
        expect(p.kind).not.toBe("variable-definition");
        if (p.body) visit(p.body);
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
        if (p.body) visit(p.body);
      }
    };
    visit(workflow);
  });
});

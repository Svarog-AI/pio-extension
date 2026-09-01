import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

/** Store variable carrying the absolute path of this session's research-notes scratch file. */
const NOTES_VAR = "notes_path";

/** Store variable carrying the commit hash captured after `commit` (unset when git fails). */
const COMMIT_VAR = "commit_hash";

/** Store variable carrying the currently-selected task name for the inner TDD loop. */
const CURRENT_TASK_VAR = "current_task";

/** Store variable carrying the in-memory task array: [{ name, status }]. */
const TASKS_VAR = "tasks";

/** Session-scoped scratch directory (OS reclaims /tmp; no cleanup phase needed). */
const SCRATCH_DIR = "/tmp/pio-execute-task";

/** Resolve the session-scoped scratch root. Total — never throws. */
function scratchRootOf(state: PioSessionState): string {
  return path.join(SCRATCH_DIR, state.sessionId ?? "unknown");
}

/**
 * Resolve the LLM->code task handoff file. The LLM phases (task-generation,
 * verify-acceptance-criteria) cannot write the store (setVar is gated to
 * variable-definition phases), so they write the task NAMES here as a JSON
 * array; the code phases load them into the in-memory store array. Total.
 */
function tasksJsonPathOf(state: PioSessionState): string {
  return path.join(scratchRootOf(state), "tasks.json");
}

/** In-memory task array entry. */
type TaskEntry = { name: string; status: string };

/** Read the in-memory task array from the store (empty when unset). Total. */
function tasksArrayOf(state: PioSessionState): TaskEntry[] {
  const v = state.store?.get(TASKS_VAR);
  return Array.isArray(v) ? (v as TaskEntry[]) : [];
}

/**
 * Total helper — true when the just-finished run wrote any of the given
 * marker filenames (suffix match). Never throws: a missing/undefined
 * filesWritten array fails safe to `false`.
 */
function wroteMarker(state: PioSessionState, names: string[]): boolean {
  return (
    state.filesWritten?.some((f) => names.some((n) => f.endsWith(n))) ?? false
  );
}

/** True when the run wrote the terminal marker for the inner TDD loop. */
const wroteVerifiedOrBlocked = (s: PioSessionState) =>
  wroteMarker(s, ["verified.txt", "blocked.txt"]);

/**
 * Total repeatWhile condition for the `iterative-tdd` loop. Reads the
 * persisted in-memory task array (the store survives session interruption,
 * unlike the lossy /tmp scratch dir): keep looping while pending/in-progress
 * work remains and no task is blocked; stop when every task is verified or any
 * task is blocked. Never throws (store reads are total).
 */
function iterativeTddShouldContinue(state: PioSessionState): boolean {
  const tasks = tasksArrayOf(state);
  if (tasks.length === 0) return true; // nothing seeded yet — first pass
  const hasBlocked = tasks.some((t) => t.status === "blocked");
  const allVerified = tasks.every((t) => t.status === "verified");
  return !(hasBlocked || allVerified);
}

/** True when the run appended to the research-notes evidence file. */
const wroteNotes = (s: PioSessionState) => wroteMarker(s, ["notes.md"]);

/** True when the run appended to a per-phase refinement change-marker. */
const wroteChangeMarker = (s: PioSessionState, suffix: string) =>
  wroteMarker(s, [suffix]);

const steps: WorkflowPhase[] = [
  // -------------------------------------------------------------------------
  // Read Task — internalize the task contract. Lean single pass: no loop
  // fields, no write gates. `task` is the sole input of execute-task — there
  // is no goal/plan to read. Establishes the contract for the phases that
  // follow.
  // -------------------------------------------------------------------------
  {
    id: "read-task",
    title: "Read the `task` input",
    instructions: `Read the \`task\` input from the workspace:

- **\`task\` input** — the focused specification of what to build, including code components, approach decisions, files affected, and acceptance criteria.

Skim \`.pio/PROJECT/OVERVIEW.md\` if available for background. This is a single-pass contract entry — the \`task\` input is the sole contract; there is no goal/plan to read. Research follows in the next phase.`,
  },

  // -------------------------------------------------------------------------
  // Default Setup — create the session-scoped scratch dir and set the
  // notes_path store variable (programmatic, no agent turn).
  // -------------------------------------------------------------------------
  {
    id: "default-setup",
    title: "Set up the session scratch space",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const root = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      fs.mkdirSync(root, { recursive: true });
      ctx.state.store?.set(NOTES_VAR, "string", path.join(root, "notes.md"));
    },
  },

  // -------------------------------------------------------------------------
  // Research Context — thorough research over the repo, tests, and web, with
  // every finding recorded as evidence to the scratch notes file. An
  // exhaustion loop (evidence-fixpoint): a run that appended new notes
  // replays; a silent run (nothing new to record) advances.
  // -------------------------------------------------------------------------
  {
    id: "research-context",
    title: "Research supporting context",
    maxIterations: 8,
    loopWhile: [
      {
        type: "callback",
        callback: wroteNotes,
      },
    ],
    loopMessage: `Have another look — any missed files, dependencies, or assumptions? Re-scan the repo, referenced files, and test setup for anything not yet recorded. If you find something new, record it to \`\${notes_path}\` (under /tmp — writes there are not blocked). If you find nothing new, make **no changes** to \`\${notes_path}\` and finish.`,
    instructions: `Conduct thorough research using your tools (\`read\`, \`bash\`, \`web_search\`), following the research process in the \`pio-planning\` skill. Read the files listed in the \`task\` input's "Files affected" section, trace imports and dependencies, understand the testing setup (how things are tested today, what tools are available), and look at similar code to follow existing patterns.

**Record every finding as evidence to the scratch notes file at \`\${notes_path}\`** (under /tmp — writes there are not blocked). Append each finding with its evidence source:

- **Evidence = repo path | web URL | recorded test output | explicit user statement.** A source is required — "just saying something" is not evidence.
- Do **not** require a web link for codebase facts. Use \`web_search\` for assumptions genuinely unanswerable from code/tests, and cite the URL.
- If a phase's acceptance criteria can't be made programmatic because you don't understand the test setup, go learn the test setup and record it as evidence.

Resolve genuinely-unanswerable questions via \`ask_user\` (\`displayMode: "inline"\`, \`grill-me\` probing), recording the answer as evidence. **Dedupe** — do not re-add findings already present in \`\${notes_path}\`.`,
    skills: {
      recommended: [
        {
          name: "source-research",
          condition:
            "when researching existing solutions or external libraries",
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Iterative TDD — OUTER do-while block. Repeats while tasks remain; the
  // container never gets an agent turn. Body: task-generation → inner
  // tdd-process → verify-acceptance-criteria. Advances when the run wrote a
  // terminal marker (tasks-complete.txt or blocked.txt), which only
  // verify-acceptance-criteria writes.
  // -------------------------------------------------------------------------
  {
    id: "iterative-tdd",
    title: "Iterative TDD",
    kind: "loop",
    // The outer loop repeats until every task is verified (or a blocker is
    // found). Unbounded is not supported (resolveMaxIterations requires a
    // positive integer), so use a high cap as a safety net.
    maxIterations: 1000,
    repeatWhile: iterativeTddShouldContinue,
    loopMessage: `Continue with the next task, or finish when all tasks are verified and the acceptance criteria are met. A task that is genuinely blocked should be marked as such rather than re-attempted forever.`,
    body: [
      // ---------------------------------------------------------------------
      // Task Generation — maintain the durable /tmp tasks.md task list
      // (create on first pass; add newly-identified tasks on later passes).
      // ---------------------------------------------------------------------
      {
        id: "task-generation",
        title: "Decompose the task into discrete TDD tasks",
        instructions: `Maintain the scratch task list at \`/tmp/pio-execute-task/<sessionId>/tasks.json\` (under /tmp — writes there are not blocked). **tasks.json is a JSON array of task-name strings** that the programmatic \`select-task\`/\`finalize-tasks\` phases load into the in-memory task array — keep it valid JSON:

- **First pass:** decompose the \`task\` input into a numbered list of discrete TDD tasks, each a nameable, verifiable unit. Write them to \`tasks.json\` as a JSON array, e.g. \`["Implement the public API", "Add error handling"]\`.
- **Later passes:** read \`tasks.json\` and append any newly-identified tasks (e.g. gaps surfaced by the acceptance review) to the array. Do not re-add already-completed tasks.

The in-memory task array (with statuses) is maintained by the code phases. **Do not select a task yourself** — \`select-task\` picks the first pending task. If you find a genuine blocker here, note it; do not write \`blocked.txt\` directly (the \`finalize-tasks\` code phase writes the terminal markers).`,
      },

      // ---------------------------------------------------------------------
      // Select Task — PROGRAMMATIC selection of the next task. Loads the task
      // names from tasks.json into the in-memory store array (preserving any
      // existing statuses), picks the first pending task, sets the current_task
      // store var (interpolated into the inner loop's instructions), and marks
      // it in-progress so the next pass selects a different one.
      // ---------------------------------------------------------------------
      {
        id: "select-task",
        title: "Select the next pending task",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          const state = ctx.state;
          const merged = tasksArrayOf(state);
          try {
            // Merge any LLM-authored task names (tasks.json) into the durable
            // store array. The array is the source of truth (survives
            // interruption); tasks.json is only a transient seed/append channel
            // because LLM phases cannot write the store.
            const jsonPath = tasksJsonPathOf(state);
            if (fs.existsSync(jsonPath)) {
              const parsed = JSON.parse(
                fs.readFileSync(jsonPath, "utf-8"),
              ) as unknown;
              if (Array.isArray(parsed)) {
                const seen = new Set(merged.map((t) => t.name));
                for (const n of parsed.map((n) => String(n))) {
                  if (!seen.has(n)) merged.push({ name: n, status: "pending" });
                }
              }
            }
            // Resume-safe: if a task is already in-progress (e.g. the session
            // was interrupted mid-task), keep it as the current task rather than
            // selecting a different one.
            const inProgress = merged.findIndex(
              (t) => t.status === "in-progress",
            );
            if (inProgress >= 0) {
              state.store?.set(
                CURRENT_TASK_VAR,
                "string",
                merged[inProgress].name,
              );
              state.store?.set(TASKS_VAR, "array", merged);
              return;
            }
            const idx = merged.findIndex((t) => t.status === "pending");
            if (idx < 0) {
              state.store?.set(TASKS_VAR, "array", merged);
              return;
            }
            const current = merged[idx].name;
            merged[idx] = { ...merged[idx], status: "in-progress" };
            state.store?.set(TASKS_VAR, "array", merged);
            state.store?.set(CURRENT_TASK_VAR, "string", current);
          } catch {
            // total — never throw
          }
        },
      },

      // ---------------------------------------------------------------------
      // TDD Process — INNER do-while block: the red→green→refactor→final-
      // verify sequence for the current task. The container never gets an
      // agent turn. Advances when the run wrote verified.txt or blocked.txt
      // (written by verify-final); a run writing neither replays.
      // ---------------------------------------------------------------------
      {
        id: "tdd-process",
        title: "TDD process for the current task",
        kind: "loop",
        minIterations: 1,
        maxIterations: 6,
        repeatWhile: (state: PioSessionState) => !wroteVerifiedOrBlocked(state),
        loopMessage: `The current task is not yet verified — keep iterating (fix failing tests, then run the final verification). Write \`verified.txt\` only when all tests + programmatic checks pass, or \`blocked.txt\` on a genuine blocker.`,
        body: [
          // -----------------------------------------------------------------
          // Write Tests — RED phase, conditional refinement loop.
          // -----------------------------------------------------------------
          {
            id: "write-tests",
            title: "Write failing tests for the current task (RED)",
            maxIterations: 4,
            loopWhile: [
              {
                type: "callback",
                callback: (s: PioSessionState) =>
                  wroteChangeMarker(s, "write-tests-changed.txt"),
              },
            ],
            loopMessage: `Have another look — any test cases, edge cases, or acceptance criteria still missed for the current task? Add them (and note the change to \`\${write-tests-changed}\`), else make no changes and finish.`,
            instructions: `For the current task, write failing tests that express its **behavior** — what the system does through its public interface, not how it's implemented — per the \`tdd\` skill's tracer-bullet → RED→GREEN methodology. Use the project's domain glossary so test names and interface vocabulary match the domain language.

**Prefer tracer bullet tests:** start with the smallest test that confirms one real thing about the system end-to-end through a public API, then grow incrementally (one test → one implementation → repeat). A tracer bullet proves the path works before you add coverage.

**Test behavior, not implementation.** A good test still passes after an internal refactor as long as behavior is unchanged. Avoid asserting string-literal content (descriptions, labels, error text), internal data-structure shapes, function signatures/parameter counts, or reading source files as raw strings. If renaming an internal function would break the test, it is testing implementation, not behavior. Before writing a test, ask: "if I changed the internals but the system still did the right thing, would this test still pass?" If not, test the outcome instead.

**Whenever you add or change a test this pass, append a line to \`/tmp/pio-execute-task/<sessionId>/write-tests-changed.txt\`** (under /tmp — writes there are not blocked). When a pass adds no new tests, make **no write** — only note the change when you actually made one.

Treat an inner-loop replay as "tests likely already exist — proceed to fix the implementation/verification," not a re-write from scratch.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Implement — GREEN phase, conditional refinement loop.
          // -----------------------------------------------------------------
          {
            id: "implement",
            title: "Implement the current task (GREEN)",
            maxIterations: 4,
            loopWhile: [
              {
                type: "callback",
                callback: (s: PioSessionState) =>
                  wroteChangeMarker(s, "implement-changed.txt"),
              },
            ],
            loopMessage: `Have another look — any missing branches, inputs, or edge cases in the implementation for the current task? Cover them (and note the change to \`\${implement-changed}\`), else make no changes and finish.`,
            instructions: `Write the minimal implementation to make the current task's tests pass (per the \`tdd\` skill's GREEN step). Keep it minimal — only enough code to pass the current tests; do not anticipate future tests.

**Whenever you change the implementation this pass, append a line to \`/tmp/pio-execute-task/<sessionId>/implement-changed.txt\`** (under /tmp — writes there are not blocked). When a pass changes nothing, make **no write** — only note the change when you actually made one.

Treat an inner-loop replay as "tests already exist — proceed to fix the implementation," not a re-write from scratch.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Verify Green — lean single run (failures are caught by verify-final).
          // -----------------------------------------------------------------
          {
            id: "verify-green",
            title: "Run the test suite (green check)",
            instructions: `Run the test suite and confirm the current task's tests are green. This is a single lean run — failures are caught by the final verification.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Refactor — conditional refinement loop, informed by web research.
          // -----------------------------------------------------------------
          {
            id: "refactor",
            title: "Refactor the implementation",
            maxIterations: 4,
            loopWhile: [
              {
                type: "callback",
                callback: (s: PioSessionState) =>
                  wroteChangeMarker(s, "refactor-changed.txt"),
              },
            ],
            loopMessage: `Have another look — any remaining duplication, naming, or structural cleanup worth doing for the current task? Refine (and note the change to \`\${refactor-changed}\`), else make no changes and finish.`,
            instructions: `Refactor for clarity, keeping the tests green. Use \`web_search\` (no workflow) to look up good refactoring practices / idiomatic patterns for the codebase's language and libraries before restructuring — cite what you find; do not refactor blind.

**Whenever you change the code in refactor this pass, append a line to \`/tmp/pio-execute-task/<sessionId>/refactor-changed.txt\`** (under /tmp — writes there are not blocked). When a pass changes nothing, make **no write** — only note the change when you actually made one.

Never refactor while RED — get to GREEN first.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Verify Final — the inner loop's terminal decision point.
          // -----------------------------------------------------------------
          {
            id: "verify-final",
            title: "Final verification for the current task",
            instructions: `Run the final verification for the current task (\`\${current_task}\`): formal tests + programmatic checks from the \`task\` input's acceptance criteria.

**Only when all tests + programmatic checks pass, write \`verified.txt\` to the scratch dir (\`/tmp/pio-execute-task/<sessionId>/verified.txt\`)** (under /tmp — writes there are not blocked). The in-memory task status is reconciled by \`finalize-tasks\`.

- If a check fails but is fixable, write **nothing** and continue iterating (fix it in the next TDD pass).
- On a genuine blocker (external dependency unavailable, environmental constraint, ambiguous spec with no reasonable default), write \`blocked.txt\` to \`/tmp/pio-execute-task/<sessionId>/blocked.txt\`.

**Never write \`verified.txt\` on failure** — the inner loop's advance depends on that file being absent on a failing run.`,
            skills: { mandatory: ["tdd"] },
          },
        ],
      },

      // ---------------------------------------------------------------------
      // Verify Acceptance Criteria — LLM judgment only. Cross-references the
      // task's acceptance criteria against the implementation and updates
      // tasks.md (adds missing `[ ]` tasks, marks a genuinely-unresolvable
      // task `[!]`). Does NOT write the terminal markers — the `finalize-tasks`
      // code phase decides those from tasks.md.
      // ---------------------------------------------------------------------
      {
        id: "verify-acceptance-criteria",
        title: "Verify non-test acceptance criteria",
        instructions: `Cross-reference the \`task\` input's acceptance criteria against your implementation:

- Are all listed files created, modified, or deleted as specified?
- Do integration points (imports, exports, wiring) work correctly?
- Are conventions followed (naming, patterns, styles matching existing code)?
- Have you stayed within scope — no unplanned refactoring or out-of-scope changes?

You do **not** write the terminal markers — the \`finalize-tasks\` code phase decides those from the in-memory task array. Your job is only the judgment:

- If acceptance is unmet, append the missing work as new task names to \`/tmp/pio-execute-task/<sessionId>/tasks.json\`.
- If a genuine blocker is present, or a task did not succeed (remains unverified — e.g. it hit the inner TDD max-iteration cap), **assess first** per blocked discipline: if the stuck task is a quick-fixable bug, compile/type error, or plain difficulty, append it to \`tasks.json\` and iterate via TDD; only when it is genuinely unresolvable in this session, write \`blocked.txt\` to the scratch dir. Do not re-add a permanently-stuck task and spin the outer loop forever.`,
      },

      // ---------------------------------------------------------------------
      // Finalize Tasks — PROGRAMMATIC terminal decision over the in-memory
      // store array. Reconciles the current (in-progress) task's status from
      // the per-pass marker files (verified.txt / blocked.txt written by
      // verify-final), then writes the outer terminal marker: blocked.txt when
      // any task is blocked, tasks-complete.txt when all tasks are verified, or
      // nothing while pending work remains (clearing the per-pass markers so
      // the next task starts clean). The outer loop's repeatWhile reads the
      // terminal markers from disk (code-phase fs writes are not in filesWritten).
      // ---------------------------------------------------------------------
      {
        id: "finalize-tasks",
        title: "Reconcile the current task and decide done vs blocked",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          const state = ctx.state;
          const root = scratchRootOf(state);
          const verifiedPath = path.join(root, "verified.txt");
          const blockedPath = path.join(root, "blocked.txt");
          const array = tasksArrayOf(state);
          if (!array.length) return;
          try {
            // Reconcile the current (in-progress) task's status from the
            // transient per-pass markers written by verify-final.
            let changed = false;
            const next = array.map((t) => {
              if (t.status === "in-progress") {
                if (fs.existsSync(blockedPath)) {
                  changed = true;
                  return { ...t, status: "blocked" };
                }
                if (fs.existsSync(verifiedPath)) {
                  changed = true;
                  return { ...t, status: "verified" };
                }
              }
              return t;
            });
            if (changed) state.store?.set(TASKS_VAR, "array", next);
            // The outer loop's terminal decision reads the persisted store
            // array, not marker files. Clear the transient per-pass markers so
            // the next task starts clean.
            fs.rmSync(verifiedPath, { force: true });
            fs.rmSync(blockedPath, { force: true });
          } catch {
            // total — never throw
          }
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Write Test File — write TEST.md (the `test` contract output). Placed
  // BEFORE the commit so TEST.md is committed with the code it documents.
  // -------------------------------------------------------------------------
  {
    id: "write-test-file",
    title: "Write TEST.md",
    write: ["test"],
    instructions: `Write \`TEST.md\` in the workspace as a post-hoc summary record of what was actually tested (created AFTER implementation, not before — a record, not a pre-written plan).

Start with a single short paragraph describing what is tested. Then list test cases as single sentences following the "Given ____ when ____ then ____" pattern. List programmatic verification commands below unit tests using the same pattern.`,
  },

  // -------------------------------------------------------------------------
  // Commit — standard phase, pio-git skill. Graceful failure: if git fails,
  // log a warning and proceed — never block workflow completion.
  // -------------------------------------------------------------------------
  {
    id: "commit",
    title: "Commit the implementation",
    skills: { mandatory: ["pio-git"] },
    instructions: `Load the \`pio-git\` skill and commit the implementation + TEST.md as one capability commit. Read \`.pio/PROJECT/GIT.md\` for commit conventions; stage only the files you changed (never \`git add -A\`). If git fails, log a warning and proceed — never block workflow completion.`,
  },

  // -------------------------------------------------------------------------
  // Capture Commit Hash — programmatic. Run `git rev-parse HEAD` and set the
  // commit_hash store var. If the hash cannot be obtained (e.g. git failed),
  // leave commit_hash unset so the summary simply omits the `commit` field.
  // -------------------------------------------------------------------------
  {
    id: "capture-commit-hash",
    title: "Capture the commit hash",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const cwd = ctx.state.projectRoot ?? process.cwd();
      try {
        const hash = execSync("git rev-parse HEAD", {
          cwd,
          encoding: "utf-8",
        }).trim();
        if (hash) ctx.state.store?.set(COMMIT_VAR, "string", hash);
      } catch {
        // leave commit_hash unset — the summary simply omits the commit field
      }
    },
  },

  // -------------------------------------------------------------------------
  // Push — programmatic git push via the Push Protocol. Graceful failure is
  // expected: not all goals have remotes, and network/auth issues occur —
  // catch errors, log a warning, and continue.
  // -------------------------------------------------------------------------
  {
    id: "push",
    title: "Push commits to remote",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const cwd = ctx.state.projectRoot ?? process.cwd();
      try {
        const branch = execSync("git symbolic-ref --short HEAD", {
          cwd,
          encoding: "utf-8",
        }).trim();
        if (branch) {
          execSync(`git push origin ${branch}`, {
            cwd,
            encoding: "utf-8",
            stdio: "pipe",
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[execute-task] git push skipped (graceful): ${msg}`);
      }
    },
  },

  // -------------------------------------------------------------------------
  // Write Summary File — write SUMMARY.md (the `summary` contract output).
  // Runs after commit/capture-commit-hash so it references the commit hash
  // and is not part of the implementation commit.
  // -------------------------------------------------------------------------
  {
    id: "write-summary-file",
    title: "Write SUMMARY.md",
    write: ["summary"],
    instructions: `Write \`SUMMARY.md\` in the workspace starting with a YAML frontmatter block at the very top of the file, before any markdown headings:

\`\`\`yaml
---
status: completed
commit: \${commit_hash}
---
\`\`\`

Use \`status: completed\` when all tests pass and all criteria are met, or \`status: blocked\` when genuinely blocked. Include the \`commit\` field recording the commit hash (interpolate \`\${commit_hash}\`); **omit the \`commit\` field entirely when the hash is unset** (e.g. git failed) — it is optional.

**When \`status: blocked\` is appropriate:** external dependencies not yet available, environmental constraints outside pio's control, or ambiguous specs requiring human clarification.

**When \`status: blocked\` is NOT appropriate:** test failures, compile/type errors, unclear-but-interpretable requirements, or difficulty — these are not blockers; iterate via TDD.

After the frontmatter closing \`---\`, write the human-readable markdown body:
- For successful steps: Status, Files Created, Files Modified, Files Deleted, Decisions Made, User-Requested Changes, and Test Coverage sections.
- For blocked steps: a structured section documenting What was attempted / What specifically remains blocking / Prerequisite to unblock.

**User-requested changes:** After initial implementation, the user may send change requests. Treat these as user-requested changes distinct from the original \`task\` scope. Apply them using the \`tdd\` skill methodology, and **before completing**, update \`SUMMARY.md\` to record each user-requested change and the files created/modified/deleted as a result — so \`SUMMARY.md\` always reflects the final file state regardless of feedback iterations.

**Note:** \`SUMMARY.md\` is written after \`commit\`/\`capture-commit-hash\`, so it references the commit hash and is not part of the implementation commit.`,
  },
];

export default steps;

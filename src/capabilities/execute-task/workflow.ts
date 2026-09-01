import { execSync } from "node:child_process";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

/** Store variable carrying the commit hash captured after `commit` (unset when git fails). */
const COMMIT_VAR = "commit_hash";

/** Store variable carrying the currently-selected task name for the inner TDD loop. */
const CURRENT_TASK_VAR = "current_task";

/** Store variable carrying the in-memory task array: [{ name, status }]. */
const TASKS_VAR = "tasks";

/** Store variable set true once the task list is well-formed (order, feasibility). */
const TASK_LIST_REFINED_VAR = "task_list_refined";

/** Store variable carrying the accumulated research evidence (each item a finding + source). */
const RESEARCH_NOTES_VAR = "research_notes";

/** Store variable set true once research is complete. */
const RESEARCH_COMPLETE_VAR = "research_complete";

/** Inner-loop verdict booleans set by the task-verdict variable phase. */
const TASK_VERIFIED_VAR = "task_verified";
const TASK_BLOCKED_VAR = "task_blocked";

/** Store variable set true by verify-acceptance-criteria when a genuine blocker is found. */
const ACCEPTANCE_BLOCKED_VAR = "acceptance_blocked";

/** Store variable set by the verify-green phases once the current task's tests + checks pass. */
const TESTS_PASS_VAR = "tests_pass";

/** In-memory task array entry. */
type TaskEntry = { name: string; status: string };

/** Total helper — true when a store boolean variable is set to `true`. */
function isSet(state: PioSessionState, name: string): boolean {
  return state.store.get(name) === true;
}

/**
 * Total repeatWhile condition for the `iterative-tdd` loop. Reads the
 * persisted in-memory task array (the store survives session interruption):
 * keep looping while pending work remains and no task is blocked;
 * stop when every task is verified or any task is blocked. Never throws
 * (store reads are total).
 */
function iterativeTddShouldContinue(state: PioSessionState): boolean {
  const tasks = state.store.get(TASKS_VAR) as TaskEntry[];
  if (tasks.length === 0) return true; // nothing seeded yet — first pass
  const hasBlocked = tasks.some((t) => t.status === "blocked");
  const allVerified = tasks.every((t) => t.status === "verified");
  return !(hasBlocked || allVerified);
}

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
  // Default Setup — programmatic (no agent turn). Declares every session
  // variable up front so store.get(...) resolves to a type-appropriate empty
  // default ([] / "" / false) when unset, and so setVar/store.set type
  // enforcement is consistent from the start. All durable state lives in the
  // session variable store — there are no /tmp scratch files.
  // -------------------------------------------------------------------------
  {
    id: "default-setup",
    title: "Set up the session variable store",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const store = ctx.state.store;
      store.declare(TASKS_VAR, "array");
      store.declare(RESEARCH_NOTES_VAR, "array");
      store.declare(RESEARCH_COMPLETE_VAR, "boolean");
      store.declare(TASK_LIST_REFINED_VAR, "boolean");
      store.declare(CURRENT_TASK_VAR, "string");
      store.declare(TASK_VERIFIED_VAR, "boolean");
      store.declare(TASK_BLOCKED_VAR, "boolean");
      store.declare(ACCEPTANCE_BLOCKED_VAR, "boolean");
      store.declare(TESTS_PASS_VAR, "boolean");
      store.declare(COMMIT_VAR, "string");
    },
  },

  // -------------------------------------------------------------------------
  // Research Context — a do-while block: a research variable phase that
  // accumulates evidence into the `research_notes` array, then a
  // research-complete variable phase that sets `research_complete` true once
  // nothing is missing, no questions remain unanswered, and no topics are left
  // to investigate with web_search. The loop repeats while not complete.
  // -------------------------------------------------------------------------
  {
    id: "research-context",
    title: "Research supporting context",
    kind: "loop",
    maxIterations: 8,
    repeatWhile: (state: PioSessionState) =>
      state.store.get(RESEARCH_COMPLETE_VAR) !== true,
    loopMessage: `Research is not complete yet — look for anything still missing: unread files, unresolved dependencies, unverified assumptions, unanswered questions, or topics left to investigate with \`web_search\`. Do another research pass, then re-assess in the next phase.`,
    body: [
      {
        id: "research",
        title: "Research the codebase, tests, and web",
        kind: "variable-definition",
        variables: [
          {
            name: RESEARCH_NOTES_VAR,
            type: "array",
            kind: "llm",
            description: `Conduct thorough research using your tools (\`read\`, \`bash\`, \`web_search\`), following the research process in the \`pio-planning\` skill. Read the files listed in the \`task\` input's "Files affected" section, trace imports and dependencies, understand the testing setup (how things are tested today, what tools are available), and look at similar code to follow existing patterns.

Accumulate every finding into the \`${RESEARCH_NOTES_VAR}\` array (read the current value via \`getVar\`, then set the full accumulated array via \`setVar\`, or append via \`appendVar\`). Each finding records its evidence source:

- **Evidence = repo path | web URL | recorded test output | explicit user statement.** A source is required — "just saying something" is not evidence.
- Do **not** require a web link for codebase facts. Use \`web_search\` for assumptions genuinely unanswerable from code/tests, and cite the URL.
- If a phase's acceptance criteria can't be made programmatic because you don't understand the test setup, go learn the test setup and record it as evidence.

Resolve genuinely-unanswerable questions via \`ask_user\` (\`displayMode: "inline"\`, \`grill-me\` probing), recording the answer as evidence. **Dedupe** — do not re-add findings already present in \`${RESEARCH_NOTES_VAR}\`. Set \`${RESEARCH_NOTES_VAR}\` to the full array of findings gathered so far.`,
          },
        ],
      },
      {
        id: "research-complete",
        title: "Assess whether research is complete",
        kind: "variable-definition",
        variables: [
          {
            name: RESEARCH_COMPLETE_VAR,
            type: "boolean",
            kind: "llm",
            description: `Revisit the findings recorded in \`${RESEARCH_NOTES_VAR}\` (via \`getVar\`) and the open questions. **Think carefully and be critical** — actively hunt for gaps (unread files, unresolved dependencies, unverified assumptions, unanswered questions, topics left to investigate with \`web_search\`) rather than rubber-stamping completion. Set \`${RESEARCH_COMPLETE_VAR}\` to \`true\` only when you have genuinely verified there is nothing missing, no unanswered questions, and no topics left to investigate; otherwise set it to \`false\` so another research pass runs. Always set it explicitly.`,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Iterative TDD — OUTER do-while block. Repeats while tasks remain; the
  // container never gets an agent turn. Body: task-generation → inner
  // tdd-process → verify-acceptance-criteria → finalize-tasks. The repeat
  // condition reads the persisted in-memory task array, which finalize-tasks
  // updates from the store verdict booleans.
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
      // Task Generation — a do-while refinement loop over the task list. A
      // generate-tasks variable phase sets the persisted tasks list; a
      // tasks-refined variable phase reviews ordering/feasibility and sets
      // task_list_refined true once the list is well-formed. The loop repeats
      // while not refined.
      // ---------------------------------------------------------------------
      {
        id: "task-generation",
        title: "Generate and refine the task list",
        kind: "loop",
        maxIterations: 6,
        repeatWhile: (state: PioSessionState) =>
          state.store.get(TASK_LIST_REFINED_VAR) !== true,
        loopMessage: `The task list is not yet well-formed — review the ordering (dependencies before dependents), feasibility, and completeness of \`${TASKS_VAR}\`, refine it in the generate phase, then re-assess in the next phase.`,
        body: [
          {
            id: "generate-tasks",
            title: "Generate the task list",
            kind: "variable-definition",
            variables: [
              {
                name: TASKS_VAR,
                type: "array",
                kind: "llm",
                description: `Decompose the \`task\` input into a numbered list of discrete TDD tasks, each a nameable, verifiable unit, and set \`${TASKS_VAR}\` (via \`setVar\`) to the array of task objects \`[{ name, status }]\`, each with \`status: "pending"\`. On a later pass, read the current \`${TASKS_VAR}\` (via \`getVar\`/\`listVars\`), preserve every existing entry and its status, and refine it: fix the ordering (dependencies before dependents), split oversized/infeasible units, and preserve already-completed tasks; do not re-add or re-pend completed tasks. Do not select a task yourself — the \`select-task\` code phase picks the first pending one.`,
              },
            ],
          },
          {
            id: "tasks-refined",
            title: "Assess whether the task list is well-formed",
            kind: "variable-definition",
            variables: [
              {
                name: TASK_LIST_REFINED_VAR,
                type: "boolean",
                kind: "llm",
                description: `Review the \`${TASKS_VAR}\` list critically: are tasks ordered by real dependency (each task's prerequisites come first)? are all units feasible and nameable? does the list cover the whole \`task\` input? **Be rigorous** — actively look for gaps, oversized/infeasible units, and mis-ordered dependencies rather than rubber-stamping the list. Set \`${TASK_LIST_REFINED_VAR}\` to \`true\` only when the list is genuinely well-formed; otherwise set it to \`false\` so the generate phase refines it again. Always set it explicitly.`,
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------------
      // Select Task — PROGRAMMATIC selection of the next task. Sets
      // current_task to the first pending task in the persisted tasks store
      // array. It does not modify statuses — an interrupted task stays pending
      // and is re-picked, and finalize-tasks reconciles the current task
      // (matched by name) after the TDD pass.
      // ---------------------------------------------------------------------
      {
        id: "select-task",
        title: "Select the next pending task",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          const state = ctx.state;
          const tasks = state.store.get(TASKS_VAR) as TaskEntry[];
          try {
            const idx = tasks.findIndex((t) => t.status === "pending");
            if (idx < 0) return;
            state.store.set(CURRENT_TASK_VAR, "string", tasks[idx].name);
          } catch {
            // total — never throw
          }
        },
      },

      // ---------------------------------------------------------------------
      // TDD Process — INNER do-while block: the red→green→refactor→final-
      // verify sequence for the current task, terminated by the task-verdict
      // store booleans. The container never gets an agent turn. Advances when
      // the task-verdict variable phase sets task_verified or task_blocked
      // true; a pass leaving both false replays.
      // ---------------------------------------------------------------------
      {
        id: "tdd-process",
        title: "TDD process for the current task",
        kind: "loop",
        minIterations: 1,
        maxIterations: 6,
        repeatWhile: (state: PioSessionState) =>
          !(isSet(state, TASK_VERIFIED_VAR) || isSet(state, TASK_BLOCKED_VAR)),
        loopMessage: `The current task is not yet verified — keep iterating (fix failing tests, then run the final verification). Record \`${TASK_VERIFIED_VAR}\` only when all tests + programmatic checks pass, or \`${TASK_BLOCKED_VAR}\` on a genuine blocker.`,
        body: [
          // -----------------------------------------------------------------
          // Write Tests — RED phase, a single-phase exhaustion loop on
          // filesWritten: as long as the run wrote a test file, give another
          // look for anything missed; a silent run (no test-file write)
          // advances. No verdict phase.
          // -----------------------------------------------------------------
          {
            id: "write-tests",
            title: "Write failing tests for the current task (RED)",
            maxIterations: 4,
            loopWhile: [
              {
                type: "callback",
                callback: (state: PioSessionState) =>
                  (state.filesWritten?.length ?? 0) > 0,
              },
            ],
            loopMessage: `Have another look — any test cases, edge cases, or acceptance criteria still missed for the current task? If you edited a file this pass, the loop continues for another look; if you have nothing more to change, make no file changes and finish.`,
            instructions: `For the current task (\`\${current_task}\`), write failing tests that express its **behavior** — what the system does through its public interface, not how it's implemented — per the \`tdd\` skill's tracer-bullet → RED→GREEN methodology. Use the project's domain glossary so test names and interface vocabulary match the domain language.

**Prefer tracer bullet tests:** start with the smallest test that confirms one real thing about the system end-to-end through a public API, then grow incrementally (one test → one implementation → repeat). A tracer bullet proves the path works before you add coverage.

**Test behavior, not implementation.** A good test still passes after an internal refactor as long as behavior is unchanged. Avoid asserting string-literal content (descriptions, labels, error text), internal data-structure shapes, function signatures/parameter counts, or reading source files as raw strings. If renaming an internal function would break the test, it is testing implementation, not behavior. Before writing a test, ask: "if I changed the internals but the system still did the right thing, would this test still pass?" If not, test the outcome instead.

Treat an inner-loop replay as "tests likely already exist — proceed to fix the implementation/verification," not a re-write from scratch.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Implement — do-while block: implement until the tests + checks
          // pass. The body runs an `implement` phase loop (exhaustion on
          // filesWritten: give another look while a file is edited), then a
          // verify-green variable phase that runs the suite and records
          // whether it is green (tests_pass). The loop repeats while
          // tests_pass is false.
          // -----------------------------------------------------------------
          {
            id: "implement-loop",
            title: "Implement the current task (GREEN)",
            kind: "loop",
            maxIterations: 4,
            repeatWhile: (state: PioSessionState) =>
              !isSet(state, TESTS_PASS_VAR),
            loopMessage: `The current task's tests and checks are not green yet — keep implementing until they pass, then the verify-green phase records the result.`,
            body: [
              {
                id: "implement",
                title: "Implement the current task",
                maxIterations: 4,
                loopWhile: [
                  {
                    type: "callback",
                    callback: (state: PioSessionState) =>
                      (state.filesWritten?.length ?? 0) > 0,
                  },
                ],
                loopMessage: `Have another look — any missing branches, inputs, or edge cases in the implementation for the current task? If you edited a file this pass, the loop continues for another look; if you have nothing more to change, make no file changes and finish.`,
                instructions: `Write the minimal implementation to make the current task's (\`\${current_task}\`) tests pass (per the \`tdd\` skill's GREEN step). Keep it minimal — only enough code to pass the current tests; do not anticipate future tests.

Treat an inner-loop replay as "tests already exist — proceed to fix the implementation," not a re-write from scratch.`,
                skills: { mandatory: ["tdd"] },
              },
              {
                id: "verify-green",
                title: "Run the test suite and record whether it passes",
                kind: "variable-definition",
                variables: [
                  {
                    name: TESTS_PASS_VAR,
                    type: "boolean",
                    kind: "llm",
                    description: `Run the test suite plus the project's conventional checks (e.g. \`npm run check\`, \`npm run lint\`), then set \`${TESTS_PASS_VAR}\` to \`true\` **only when all of the current task's tests and checks genuinely pass**. Be honest and critical — actually run the checks and observe the real output; do not assume they pass. Set it to \`false\` when any test or check fails. Always set it explicitly.`,
                  },
                ],
              },
            ],
          },

          // -----------------------------------------------------------------
          // Refactor — do-while block informed by web research. The body runs
          // a `refactor` phase loop (exhaustion on filesWritten: give another
          // look while a file is edited), then a refactor-verify-green variable
          // phase that runs the suite and records whether it is still green
          // (tests_pass). The loop repeats while tests_pass is false — refactor
          // must not pass while the tests are failing.
          // -----------------------------------------------------------------
          {
            id: "refactor-loop",
            title: "Refactor the implementation",
            kind: "loop",
            maxIterations: 4,
            repeatWhile: (state: PioSessionState) =>
              !isSet(state, TESTS_PASS_VAR),
            loopMessage: `The current task's tests and checks are not green — refactor only while keeping them green; if a refactor broke a test or check, fix it so they pass again, then the refactor-verify-green phase records the result.`,
            body: [
              {
                id: "refactor",
                title: "Refactor the implementation",
                maxIterations: 4,
                loopWhile: [
                  {
                    type: "callback",
                    callback: (state: PioSessionState) =>
                      (state.filesWritten?.length ?? 0) > 0,
                  },
                ],
                loopMessage: `Have another look — any remaining duplication, naming, or structural cleanup worth doing for the current task? If you edited a file this pass, the loop continues for another look; if you have nothing more to change, make no file changes and finish.`,
                instructions: `Refactor for clarity, keeping the tests green. Use \`web_search\` (no workflow) to look up good refactoring practices / idiomatic patterns for the codebase's language and libraries before restructuring — cite what you find; do not refactor blind.

Never refactor while RED — get to GREEN first.`,
                skills: { mandatory: ["tdd"] },
              },
              {
                id: "refactor-verify-green",
                title: "Run the test suite and record whether it still passes",
                kind: "variable-definition",
                variables: [
                  {
                    name: TESTS_PASS_VAR,
                    type: "boolean",
                    kind: "llm",
                    description: `Run the test suite plus the project's conventional checks (e.g. \`npm run check\`, \`npm run lint\`), then set \`${TESTS_PASS_VAR}\` to \`true\` **only when all of the current task's tests and checks genuinely still pass after the refactor**. Be honest and critical — actually run the checks and observe the real output; do not assume they pass. Set it to \`false\` when any test or check fails. Always set it explicitly.`,
                  },
                ],
              },
            ],
          },

          // -----------------------------------------------------------------
          // Verify Final — run formal tests + programmatic checks and form the
          // verdict; the following task-verdict phase records it as store
          // booleans.
          // -----------------------------------------------------------------
          {
            id: "verify-final",
            title: "Final verification for the current task",
            instructions: `Run the final verification for the current task (\`\${current_task}\`): formal tests + programmatic checks from the \`task\` input's acceptance criteria.

Determine which case holds:
- **All tests + programmatic checks pass** — the task is verified.
- **A check fails but is fixable** — the task is not yet verified; the next pass iterates (fix it in the next TDD pass).
- **A genuine blocker** (external dependency unavailable, environmental constraint, ambiguous spec with no reasonable default) — the task is blocked.

The next phase (\`task-verdict\`) records your conclusion as store variables — be ready to report which case holds.`,
            skills: { mandatory: ["tdd"] },
          },

          // -----------------------------------------------------------------
          // Task Verdict — records the inner loop's terminal decision as store
          // booleans. Sets task_verified only when everything passes, or
          // task_blocked only on a genuine blocker; both false replays.
          // -----------------------------------------------------------------
          {
            id: "task-verdict",
            title: "Record the verification verdict for the current task",
            kind: "variable-definition",
            variables: [
              {
                name: TASK_VERIFIED_VAR,
                type: "boolean",
                kind: "llm",
                description: `Based on the final verification you just completed for the current task (\`\${current_task}\`), set \`${TASK_VERIFIED_VAR}\` to \`true\` **only when ALL formal tests and programmatic checks genuinely pass**. Be critical and honest — do not mark the task verified unless you actually observed every check passing. Never set it true on failure.`,
              },
              {
                name: TASK_BLOCKED_VAR,
                type: "boolean",
                kind: "llm",
                description: `Set \`${TASK_BLOCKED_VAR}\` to \`true\` **only** when a genuine blocker is present (external dependency unavailable, environmental constraint, ambiguous spec with no reasonable default). Be critical here too — a blocker must be a real external constraint, not a test failure, compile/type error, or difficulty (those are NOT blockers — set it \`false\` and iterate again via TDD). Set exactly one of \`${TASK_VERIFIED_VAR}\`/\`${TASK_BLOCKED_VAR}\` true when that verdict holds, or both \`false\` when a check failed but is fixable (so the inner loop iterates again). Always set both explicitly.`,
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------------
      // Verify Acceptance Criteria — LLM judgment (variable-definition phase).
      // Cross-references the task's acceptance criteria against the
      // implementation, re-sets the persisted `tasks` store array to
      // include any missing work, and records whether a genuine blocker or an
      // unresolvable stuck task exists (acceptance_blocked). The finalize-tasks
      // code phase decides the terminal outcome from the store.
      // ---------------------------------------------------------------------
      {
        id: "verify-acceptance-criteria",
        title: "Verify non-test acceptance criteria",
        kind: "variable-definition",
        variables: [
          {
            name: TASKS_VAR,
            type: "array",
            kind: "llm",
            description: `Cross-reference the \`task\` input's acceptance criteria against your implementation: are all listed files created/modified/deleted as specified? do integration points (imports, exports, wiring) work correctly? are conventions followed (naming, patterns, styles matching existing code)? have you stayed within scope? Read the current \`${TASKS_VAR}\` (via \`getVar\`/\`listVars\`), preserve every existing entry and its status, and re-set \`${TASKS_VAR}\` (via \`setVar\`) to include any missing work as new task objects with \`status: "pending"\`.

You do **not** write any terminal marker — the \`finalize-tasks\` code phase decides the terminal outcome from the store. Your job is only the judgment of which work remains.`,
          },
          {
            name: ACCEPTANCE_BLOCKED_VAR,
            type: "boolean",
            kind: "llm",
            description: `Set \`${ACCEPTANCE_BLOCKED_VAR}\` to \`true\` only when a genuine blocker is present (external dependency unavailable, environmental constraint, ambiguous spec with no reasonable default) OR a task did not succeed (remains unverified — e.g. it hit the inner TDD max-iteration cap) and is genuinely unresolvable in this session. **Be critical** — a blocker must be a real external constraint or a truly unresolvable stuck task, not a quick-fixable bug, compile/type error, or plain difficulty. **Assess first** per blocked discipline: if the stuck task is quick-fixable, add it to \`${TASKS_VAR}\` with \`status: "pending"\` and set \`${ACCEPTANCE_BLOCKED_VAR}\` to \`false\` so the outer loop iterates via TDD; only set it \`true\` when the work is genuinely unresolvable. Set it \`false\` when no blocker exists. Always set it explicitly.`,
          },
        ],
      },

      // ---------------------------------------------------------------------
      // Finalize Tasks — PROGRAMMATIC terminal decision over the in-memory
      // store array. Reconciles the current task (matched by current_task name)
      // from the store verdict booleans (task_verified / task_blocked /
      // acceptance_blocked), then resets the per-task verdict booleans so the
      // next task starts clean. The outer loop's repeatWhile reads the
      // persisted store array.
      // ---------------------------------------------------------------------
      {
        id: "finalize-tasks",
        title: "Reconcile the current task and decide done vs blocked",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          const state = ctx.state;
          const array = state.store.get(TASKS_VAR) as TaskEntry[];
          if (!array.length) return;
          try {
            const verified = isSet(state, TASK_VERIFIED_VAR);
            const blocked = isSet(state, TASK_BLOCKED_VAR);
            const acceptanceBlocked = isSet(state, ACCEPTANCE_BLOCKED_VAR);
            const current = state.store.get(CURRENT_TASK_VAR) as string;
            let changed = false;
            const next = array.map((t) => {
              if (t.name === current) {
                if (blocked || acceptanceBlocked) {
                  changed = true;
                  return { ...t, status: "blocked" };
                }
                if (verified) {
                  changed = true;
                  return { ...t, status: "verified" };
                }
              }
              return t;
            });
            // If acceptanceBlocked but the current task wasn't reconciled to
            // blocked (e.g. the blocker arose outside the current task), ensure
            // the outer loop terminates by blocking the first non-verified task.
            if (
              acceptanceBlocked &&
              !next.some((t) => t.status === "blocked")
            ) {
              const idx = next.findIndex((t) => t.status !== "verified");
              if (idx >= 0) {
                next[idx] = { ...next[idx], status: "blocked" };
                changed = true;
              }
            }
            if (changed) state.store.set(TASKS_VAR, "array", next);
            // Reset the per-task verdict booleans so the next task starts clean.
            state.store.set(TASK_VERIFIED_VAR, "boolean", false);
            state.store.set(TASK_BLOCKED_VAR, "boolean", false);
            state.store.set(ACCEPTANCE_BLOCKED_VAR, "boolean", false);
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
        if (hash) ctx.state.store.set(COMMIT_VAR, "string", hash);
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

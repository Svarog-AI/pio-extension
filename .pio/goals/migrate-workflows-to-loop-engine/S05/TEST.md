# TEST.md — Step 5: Migrate execute-task to the loop engine

This step re-derives `src/capabilities/execute-task/workflow.ts` into a 9-phase loop-engine graph with a two-nested TDD loop, removes the `signal-completion`/`pio_mark_complete` references, and adds an optional `commit` field to `EXECUTION_SUMMARY_SCHEMA` so SUMMARY.md can carry the commit hash. The tests verify the structural phase graph (order, kinds, nested loops, loop-condition polarity/totality), the write gates, the per-phase skills, the code-phase `run()` behavior, and the updated summary schema.

## Unit tests

- Given the re-derived workflow, when the top-level phases are enumerated, then they are exactly `read-task`, `default-setup`, `research-context`, `iterative-tdd`, `write-test-file`, `commit`, `capture-commit-hash`, `push`, `write-summary-file` (9 phases: 5 standard, 3 `code`, 1 `loop`).
- Given `default-setup`, when its `run()` executes against a session id, then it creates `/tmp/pio-execute-task/<sessionId>/` and sets the `notes_path` store variable to that dir's `notes.md` (and derives the dir from the session id).
- Given `default-setup`, when its fields are inspected, then it has no loop fields, no write gates, and no instructions (lean code phase).
- Given `read-task`, when its fields are inspected, then it is a lean standard phase with no loop fields and no write gates, and it does not reference `GOAL.md`/`PLAN.md` (the `task` input is the sole contract).
- Given `research-context`, when its loopWhile callback is evaluated, then it replays when the run wrote `notes.md` and advances on silence or any other file (evidence-fixpoint), and never throws on any `filesWritten` shape.
- Given `research-context`, when its loop fields and skills are inspected, then it has `maxIterations: 8`, a non-empty loopMessage referencing `${notes_path}`, instructions demanding evidence with a source, and the `source-research` recommended skill.
- Given the outer `iterative-tdd` loop block, when its repeatWhile callback is evaluated, then it advances (returns false) when the run wrote `tasks-complete.txt` or `blocked.txt` and repeats otherwise, never throwing on missing state.
- Given `iterative-tdd`, when its body is inspected, then it contains `task-generation`, the inner `tdd-process` loop, and `verify-acceptance-criteria` in that order.
- Given the inner `tdd-process` loop block, when its repeatWhile callback is evaluated, then it advances (returns false) when the run wrote `verified.txt` or `blocked.txt` and repeats otherwise, never throwing on missing state.
- Given `tdd-process`, when its body is inspected, then it contains the 5 TDD phases in order: `write-tests`, `implement`, `verify-green`, `refactor`, `verify-final`.
- Given `write-tests`/`implement`/`refactor`, when their loopWhile callbacks are evaluated, then each replays only when its per-phase change-marker (`*-changed.txt`) was written, advances on silence, never throws, and each declares the mandatory `tdd` skill with `maxIterations: 4`.
- Given `verify-green`, when its fields are inspected, then it is lean (no loop fields) and declares the `tdd` skill.
- Given `verify-final`, when its instructions are inspected, then it carries the "write `verified.txt` only on success / `blocked.txt` on a genuine blocker / never write `verified.txt` on failure" rule and the `tdd` skill.
- Given `verify-acceptance-criteria`, when its instructions are inspected, then it is the sole writer of the outer terminal markers and carries the stuck-task-blocker handling (any unverified task / max-iteration cap → consider `blocked.txt`).
- Given `write-test-file`, when its fields are inspected, then it is gated to exactly `write: ["test"]` with TEST.md format guidance (Given/when/then).
- Given `write-summary-file`, when its fields are inspected, then it is gated to exactly `write: ["summary"]` with status+commit frontmatter guidance, blocked-documentation structure, and User-Requested Changes handling.
- Given `commit`, when its fields are inspected, then it is a standard phase with the mandatory `pio-git` skill and graceful-failure instruction.
- Given `capture-commit-hash`, when its `run()` executes in a git repo, then it sets the `commit_hash` store variable to the HEAD hash; when git fails (no repo), it leaves `commit_hash` unset and does not throw.
- Given `push`, when its `run()` executes in a repo with no remote, then it does not throw (graceful git failure).
- Given the full workflow, when all phases are traversed, then no phase declares `allowProjectWrites`, no `variable-definition` phase exists, and no old phase id (`read-goal-and-plan`, `run-verification`, `write-completion-artifacts`, `push-to-remote`), `signal-completion`, or `pio_mark_complete` appears anywhere.
- Given `EXECUTION_SUMMARY_SCHEMA`, when a value has `status` plus a string `commit`, then it validates; a non-string `commit` is rejected; `status` without `commit` still validates (commit is optional).
- Given `ExecutionSummaryOutputs`, when a `{ status, commit }` object is assigned, then the derived type carries the optional `commit` field.

## Programmatic verification

- Given the workspace, when `npm run check` is run, then tsc reports no type errors.
- Given the workspace, when `npm test` is run, then the full vitest suite passes (1820 tests).
- Given the workspace, when `npm run lint` is run, then biome reports no warnings/errors.
- Given the workspace, when `grep -rn "pio_mark_complete\|signal-completion" src/capabilities/execute-task/workflow.ts` is run, then it returns zero hits.
- Given the workspace, when `grep -rn "pio_mark_complete" src/capabilities/execute-task/role.md` is run, then it returns zero hits.
- Given the workspace, when `git diff -- src/capabilities/execute-task/config.ts` is run, then it is empty (config.ts byte-identical).

## User-requested changes (post-implementation)

Two post-implementation change requests were applied and re-verified:

- **Markers removed (execute-task only).** The `markers` declaration was removed from `execute-task`'s `CONTRACT` (`config.ts`), and the marker tests in `config.test.ts` (the "declarative markers" and "e2e: exit lifecycle with declarative markers" describes) were deleted along with the now-unused `config` import. The `status` field in `EXECUTION_SUMMARY_SCHEMA` is unchanged. Given the marker tests are removed and the suite re-run, then all remaining tests pass (1820).
- **Do-while loop containers carry no `instructions`.** Removed the dead `instructions` field from `execute-task`'s `iterative-tdd`/`tdd-process` containers and from the `workflow-playground` reference's `dowhile-var`/`dowhile-capped` containers, and updated the playground test to assert containers have no `instructions`. Given a `kind:"loop"` container, when its fields are inspected, then its `instructions` is `undefined` (it never receives an agent turn). Given the capability-design skill, when its `"loop"` bullet is read, then it states a do-while loop container must not carry an `instructions` field.

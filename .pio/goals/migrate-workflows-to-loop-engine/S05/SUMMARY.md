---
status: completed
commit: adb125e43f1e6072687540c2d8a14f23590912b8
---

# Step 5: Migrate execute-task to the loop engine

## Status

**completed.** All acceptance criteria are met: `src/capabilities/execute-task/workflow.ts` is re-derived to the 9-phase graph with the two-nested TDD loop; `signal-completion`/`pio_mark_complete` are removed; `role.md` states automatic exit; `EXECUTION_SUMMARY_SCHEMA` carries the optional `commit` field; `config.ts` is byte-identical; `npm run check`, `npm test`, and `npm run lint` all pass.

## Files Created

- `src/capabilities/execute-task/workflow.test.ts` — new structural pins for the re-derived graph (phase order/kinds, nested loop structure, loop-condition polarity/totality, write gates, code-phase `run()` behavior, per-phase skills, absence of old phase ids/`signal-completion`/`pio_mark_complete`).
- `.pio/goals/migrate-workflows-to-loop-engine/S05/TEST.md` — post-hoc record of what was tested.

## Files Modified

- `src/capabilities/execute-task/workflow.ts` — re-derived to the 9-phase graph; `signal-completion` removed.
- `src/capabilities/execute-task/role.md` — rewrote the completion definition: removed the two `pio_mark_complete` references (lines 1 and 3); exit is now automatic ("Exit is handled automatically by the framework once your final phase completes"). Kept the test-first emphasis and the `## Skills`-section-loading guidance.
- `src/capabilities/execute-task/schemas.ts` — added `commit: Type.Optional(Type.String())` to `EXECUTION_SUMMARY_SCHEMA` alongside the unchanged `status` union (user-directed contract change).
- `src/capabilities/execute-task/schemas.test.ts` — added cases for the `commit` field (accepts with commit, accepts without, rejects non-string commit; type-derivation carries the optional field).
- `src/capabilities/execute-task/config.ts` — removed the `markers` declaration from `CONTRACT` (user-requested marker removal; see User-Requested Changes).
- `src/capabilities/execute-task/config.test.ts` — removed the marker tests (the "declarative markers" and "e2e: exit lifecycle with declarative markers" describes) and the now-unused `config` import.
- `src/capabilities/workflow-playground/workflow.ts` — removed the dead `instructions` field from the `dowhile-var`/`dowhile-capped` do-while containers.
- `src/capabilities/workflow-playground/config.test.ts` — updated the do-while structural assertions to expect no `instructions` on loop containers.
- `src/skills/capability-design/SKILL.md` — the `"loop"` bullet now states a do-while loop container must not carry an `instructions` field (never rendered / does nothing).

## Files Deleted

- None. (The `signal-completion` phase was removed from `workflow.ts`; no file was deleted.)

## Decisions Made

- **Two-nested TDD loop (user decision, DECISIONS.md):** `iterative-tdd` is the outer `kind:"loop"` block (body = `task-generation` → inner `tdd-process` → `verify-acceptance-criteria`); `tdd-process` is the inner `kind:"loop"` block (body = `write-tests`/`implement`/`verify-green`/`refactor`/`verify-final`).
- **Loop signals are `filesWritten`-based markers:** inner loop advances on `verified.txt`/`blocked.txt` (written by `verify-final`); outer loop advances on `tasks-complete.txt`/`blocked.txt` (written solely by `verify-acceptance-criteria` — per-run `filesWritten` authority). No `variable-definition` phases, no `setVar`.
- **`repeatWhile` on the loop blocks (reconciliation, documented):** the engine reads the do-while `repeatWhile` field on `kind:"loop"` blocks (phase-manager line 280 / loop-end evaluation 481–483), NOT `terminateWhen`/`loopWhile`, which only apply to single-phase iteration in `evaluatePhase`. Since a loop container never gets an agent turn, a `terminateWhen` on the block would be dead config and the loop would spin to its `maxIterations` cap. The design's "advance when the marker is written" signal is therefore expressed as `repeatWhile(¬marker)` — the engine-effective equivalent DECISIONS.md describes ("terminateWhen ... equivalent to loopWhile(¬cond)"). All callbacks are total (guard `state.filesWritten`).
- **Conditional refinement loops on `write-tests`/`implement`/`refactor`:** `loopWhile` on a per-phase change-marker (`write-tests-changed.txt`/`implement-changed.txt`/`refactor-changed.txt`); a run that changed the artifact replays, a silent run advances. `maxIterations: 4`. `verify-green` stays lean. All five TDD phases declare `skills.mandatory: ["tdd"]`.
- **`verify-acceptance-criteria` is the sole writer of the outer terminal markers** and carries stuck-task-blocker handling (any unverified task / inner max-iteration cap → consider `blocked.txt`, per blocked discipline).
- **`read-task` replaces `read-goal-and-plan`** — the goal is not an input of execute-task; the first phase reads the `task` input and skims `OVERVIEW.md` only.
- **`write-test-file` placed before `commit`** so TEST.md is committed with the code it documents (per repo convention, TEST.md lives under `.pio/` and lands in the `chore: state` commit rather than the src-only feature commit — see note below).
- **Commit/push/summary ordering with hash capture:** `commit` → `capture-commit-hash` (code, `git rev-parse HEAD` → `commit_hash` store var) → `push` (code, graceful) → `write-summary-file` (SUMMARY.md with `commit` field).
- **`commit` field in the summary schema (user-directed contract change):** `Type.Optional(Type.String())` so SUMMARY.md can carry the commit hash and still be writable when git fails. `config.ts` (CONTRACT/inputs/outputs/markers/`allowProjectWrites`) stays byte-identical; Step 11's config-diff check targets `config.ts`, not `schemas.ts`.

### Note on TEST.md/commit scoping

The `commit` phase instruction says "commit the implementation + TEST.md". In this repo's convention (GIT.md/DECISIONS.md), feature commits stage **only `src/` files**; `.pio/` state (including `TEST.md`/`SUMMARY.md`, which live under `.pio/goals/...`) is committed separately as `chore: state`. So the implementation commit (`fba5c4c`) stages only the `src/` files, and TEST.md/SUMMARY.md land in the follow-on state commit.

## User-Requested Changes

Two post-implementation change requests were received and applied (committed in `adb125e`, on top of the original implementation `fba5c4c`):

1. **Remove contract markers (execute-task only).** The user directed removing the `COMPLETED`/`BLOCKED` marker files that the exit lifecycle auto-creates ("We will remove support for them in the future. For now, remove them from the capability code and validation requirements."). Applied to execute-task only (user-confirmed scope via `ask_user`):
   - `src/capabilities/execute-task/config.ts` — removed the `markers` declaration from `CONTRACT`.
   - `src/capabilities/execute-task/config.test.ts` — deleted the "declarative markers" and "e2e: exit lifecycle with declarative markers" describes and the now-unused `config` import.
   - Note: this overrides the plan's "config.ts byte-identical" hard constraint and is recorded as a user-directed contract change (like the `commit`-field change). Downstream impact (accepted): `review-task`'s `completed` input (the COMPLETED marker) will no longer be satisfiable by execute-task until review-task's own migration adjusts it. The `status` field in `EXECUTION_SUMMARY_SCHEMA` is summary content and is unchanged.

2. **Drop `instructions` from do-while loop containers.** The user directed removing the `instructions` field from `kind:"loop"` containers ("they do nothing") and updating the skill to memorize that convention. A loop container never receives an agent turn, so its `instructions` is never rendered (the prompt compiler validates `instructions` only on standard phases and exempts loop containers).
   - `src/capabilities/execute-task/workflow.ts` — removed the `instructions` field from the `iterative-tdd` and `tdd-process` containers.
   - `src/capabilities/workflow-playground/workflow.ts` — removed the dead `instructions` from the `dowhile-var`/`dowhile-capped` containers (the reference example, kept consistent).
   - `src/capabilities/workflow-playground/config.test.ts` — updated to assert containers have no `instructions`.
   - `src/skills/capability-design/SKILL.md` — updated the `"loop"` bullet to memorize that do-while loop containers carry no `instructions`.

## Test Coverage

- **56 execute-task tests pass**, including the new `workflow.test.ts` structural pins and the updated `schemas.test.ts` `commit`-field cases; full suite green (1824 tests).
- `npm run check` (tsc) passes; `npm run lint` (biome) passes with no warnings.
- `git diff -- src/capabilities/execute-task/config.ts` is empty (config.ts byte-identical).
- `grep -rn "pio_mark_complete\|signal-completion" src/capabilities/execute-task/workflow.ts` and `role.md` return zero hits.

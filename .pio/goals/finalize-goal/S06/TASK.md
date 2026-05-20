# Task: Modify state machine transitions, register in index.ts, verify compilation

Complete the finalize-goal integration by wiring it into the state machine, registering it in the extension entry point, updating project documentation, and verifying all tests pass.

## Context

The finalize-goal capability module (`src/capabilities/finalize-goal.ts`) and prompt (`src/prompts/finalize-goal.md`) are now implemented and tested (Steps 1–5). The final integration work connects everything together: the state machine must route to finalize-goal when a goal completes, the extension entry point must register the capability, and project documentation must reflect the new files.

## What to Build

Three sub-changes plus verification:

### 1. State Machine Transitions (`src/state-machine.ts`)

**Modify `transitionEvolvePlan()`:** When `state.goalCompleted()` is true, return `{ capability: "finalize-goal", params: { goalName } }` instead of returning `undefined`. Extract `goalName` from params using the existing `extractGoalName()` helper. This auto-enqueues a finalize-goal sub-session immediately after the last step is specified and COMPLETED is written.

**Add `case "finalize-goal"` to `resolveTransition()`:** Return `undefined` — finalize-goal has no outgoing transition. It produces documentation updates and terminates. Place this case before the `default` arm.

### 2. Registration (`src/index.ts`)

Import `setupFinalizeGoal` from `./capabilities/finalize-goal` and call `setupFinalizeGoal(pi)` during extension setup, alongside all other capabilities. Follow the existing import/call pattern (group capability imports at top, call setup functions in the default export).

### 3. Project Context Update (`.pio/PROJECT/OVERVIEW.md`)

Update three sections:
- **Repository Structure:** Add `finalize-goal.ts` under `src/capabilities/` with description "pio_finalize_goal: updates PROJECT docs after goal completion"
- **Workflow description:** Mention finalize-goal in the lifecycle steps (after review) — e.g., "(goal definition → planning → specification → implementation → review → finalization)"
- **Skills section:** Add `pio-project-knowledge/SKILL.md` with description "PROJECT file knowledge (paths, structure, update rules)"

### 4. Verify Compilation and Tests

Run `npx tsc --noEmit` to verify no TypeScript errors. Run `npx vitest run` to verify all existing tests still pass, including the updated state-machine test.

## Dependencies

- Step 5 must be completed — `src/capabilities/finalize-goal.ts` must exist with `setupFinalizeGoal` exported
- Step 3 must be completed — `src/prompts/finalize-goal.md` must exist

## Files Affected

- `src/state-machine.ts` — modify `transitionEvolvePlan()` to return finalize-goal on completion; add `case "finalize-goal"` in `resolveTransition()`
- `src/state-machine.test.ts` — update test `"returns undefined when goal is completed"` to expect `{ capability: "finalize-goal", params: { goalName: "feat" } }`; verify goalName propagation
- `src/index.ts` — import `setupFinalizeGoal`, call it during setup
- `.pio/PROJECT/OVERVIEW.md` — add finalize-goal.ts to repo structure, mention in lifecycle, add pio-project-knowledge skill

## Acceptance Criteria

- [ ] `transitionEvolvePlan()` returns `{ capability: "finalize-goal", params: { goalName } }` when `state.goalCompleted()` is true (instead of `undefined`)
- [ ] `resolveTransition("finalize-goal", ...)` returns `undefined` (no outgoing transition)
- [ ] Existing test in `src/state-machine.test.ts` updated from expecting `undefined` to expecting `{ capability: "finalize-goal" }` on completion
- [ ] Updated test verifies that `goalName` is propagated in params
- [ ] `src/index.ts` imports and calls `setupFinalizeGoal(pi)`
- [ ] `.pio/PROJECT/OVERVIEW.md` repository structure includes `finalize-goal.ts` under `src/capabilities/`
- [ ] `.pio/PROJECT/OVERVIEW.md` workflow description mentions finalize-goal in the lifecycle steps
- [ ] `.pio/PROJECT/OVERVIEW.md` skills section includes `pio-project-knowledge/SKILL.md`
- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass: `npx vitest run`

## Risks and Edge Cases

- **State machine test update:** The existing test `"returns undefined when goal is completed"` will fail if not updated. Rename it to reflect new behavior (e.g., "routes to finalize-goal when goal is completed").
- **goalName propagation:** Ensure the params object includes `goalName` extracted from params — use `extractGoalName(params)` helper, same pattern used elsewhere in `transitionEvolvePlan()`.
- **Import ordering in index.ts:** Follow existing alphabetical/grouped import pattern to avoid style inconsistencies.
- **OVERVIEW.md structure:** Preserve existing formatting and indentation when inserting new lines into the repository structure tree.

# Summary: Add revise-plan transitions in state-machine.ts

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/state-machine.ts` — Added `transitionRevisePlan()` helper function and `case "revise-plan"` in `resolveTransition()` switch. Modified `transitionEvolvePlan()` to check `revisionNeeded()` on the current step (when `stepNumber` is available in params) and route to `"revise-plan"` with `revisionTriggerStep` when true. Falls through to existing behavior (execute-task / finalize-goal) when no revision is needed.
- `src/state-machine.test.ts` — Added test blocks: `resolveTransition — evolve-plan → revise-plan` (7 tests), `resolveTransition — revise-plan → evolve-plan` (4 tests). All verify correct routing, param preservation, and fall-through behavior.

## Files Deleted
- (none)

## Decisions Made
- When `stepNumber` is missing from params, skip the `revisionNeeded()` check and fall through to existing behavior — without a specific step number, there's no step to check.
- When the current step is not found in `state.steps()`, treat as "no revision needed" and continue normal routing — prevents crashes on stale step numbers.
- `revisionTriggerStep` is forwarded from evolve-plan → revise-plan and optionally forwarded again from revise-plan → evolve-plan for downstream provenance.
- `transitionRevisePlan()` does NOT pass explicit `stepNumber` — lets evolve-plan discover the next step via `state.currentStepNumber()` after the plan revision cleanup.

## Test Coverage
- **evolve-plan → revise-plan (7 tests):** Routes to revise-plan when `revisionNeeded()` is true, includes `revisionTriggerStep`, preserves `goalName`, falls through to execute-task when false, falls through to finalize-goal when all steps complete, handles missing step gracefully, handles missing stepNumber gracefully.
- **revise-plan → evolve-plan (4 tests):** Routes to evolve-plan, preserves `goalName`, does not pass explicit `stepNumber`, preserves `revisionTriggerStep` if present.
- **No regression:** Existing evolve-plan → execute-task and evolve-plan → finalize-goal paths verified by existing test suite (all 531 tests pass).
- **Programmatic verification:** `npx tsc --noEmit` (exit 0), `npm test` (531/531 pass), `grep 'case "revise-plan"'` (match found).

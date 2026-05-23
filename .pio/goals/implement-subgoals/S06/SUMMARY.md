# Summary: Subgoal lifecycle wiring

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/state-machine.ts` — Added `initialMessage` to subgoal routing params in `transitionEvolvePlan`. Constructs a relative path from subgoal workspace to parent step's TASK.md using `path.relative()`.
- `src/state-machine.test.ts` — Added 4 tests: initialMessage presence in subgoal params, relative path resolution correctness, absence for regular task steps, and platform-portable path construction.
- `src/capabilities/session-capability.ts` — Modified `pio_mark_complete` to use transition's adjusted `params.goalName` as the queue key for `enqueueTask`. Enables parent queue slot restoration when a subgoal completes.
- `src/capabilities/session-capability.test.ts` — Added 3 tests: subgoal completion uses parent goal name as queue key, flat goals use state goal name (backward compatible), and queue key matches enqueued params goalName.

## Files Deleted
- (none)

## Decisions Made
- Used `path.relative()` for platform-portable relative path construction (no manual path manipulation).
- Followed the optional-parameter guard pattern: `typeof adjustedParams.goalName === "string"` to distinguish explicit string goal names from missing values.
- The `initialMessage` is a simple string — no file I/O in the state machine, keeping `transitionEvolvePlan` pure.
- Queue key change is independent of params payload — affects only the filename (second arg to `enqueueTask`), not the params content.

## Test Coverage
- 4 new state machine tests verify `initialMessage` is present for subgoal steps, contains a valid relative path, is absent for regular task steps, and uses `path.relative()` for portability.
- 3 new session-capability tests verify `pio_mark_complete` uses parent goal name for subgoal completion, uses state goal name for flat goals (backward compatible), and queue key matches enqueued params.
- All 618 existing tests pass with no regressions.
- TypeScript compilation (`npx tsc --noEmit`) reports no errors.

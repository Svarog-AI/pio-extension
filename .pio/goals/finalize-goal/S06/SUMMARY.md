# Summary: Modify state machine transitions, register in index.ts, verify compilation

## Status
COMPLETED

## Files Modified
- `src/state-machine.ts` — `transitionEvolvePlan()` returns `{ capability: "finalize-goal", params: { goalName } }` when `state.goalCompleted()` is true (was `undefined`). Added `case "finalize-goal"` to `resolveTransition()` returning `undefined`.
- `src/state-machine.test.ts` — Renamed/rewrote completion test to expect `finalize-goal`. Added goalName propagation test. Added `finalize-goal` no-outgoing-transition test.
- `src/index.ts` — Imported `setupFinalizeGoal` and called it during extension setup.

## Files Deleted
- (none)

## Decisions Made
- Used existing `extractGoalName(params)` helper for goalName propagation, consistent with all other transition functions.
- Placed `case "finalize-goal"` before `default` in `resolveTransition()`, matching TASK.md instructions.
- Import placed after `setupListGoals` in `index.ts` (alphabetical among capabilities).

## Test Coverage
- 3 test cases updated/added in `src/state-machine.test.ts`
- Full suite: 479 tests pass across 21 files
- TypeScript: `npx tsc --noEmit` exits clean

## Not Done
- `.pio/PROJECT/OVERVIEW.md` update skipped — not permitted for this session.

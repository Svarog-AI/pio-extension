# Summary: Create `GoalState` interface and factory (Step 1)

## Status
COMPLETED

## Files Created
- `src/goal-state.ts` — `GoalState` interface, `StepStatus` interface, and `createGoalState()` factory. Lazy-evaluated filesystem view with no internal caching. All methods read fresh from disk on every call.
- `src/goal-state.test.ts` — 40 Vitest tests covering construction, all `GoalState` methods (`hasGoal`, `hasPlan`, `totalPlanSteps`, `steps`, `currentStepNumber`, `pendingTask`, `lastCompleted`), `StepStatus` status determination with marker precedence, and edge cases (empty dirs, malformed JSON, no caching).

## Files Modified
- `src/goal-state.ts` — Fixed misleading comments in `currentStepNumber()`: replaced "COMPLETED" with "APPROVED" on two comment lines to match the actual logic that checks for the APPROVED marker.
- `src/goal-state.test.ts` — Added missing malformed-JSON test for `lastCompleted()` (mirrors the existing `pendingTask()` malformed-JSON test pattern).

## Files Deleted
- (none)

## Decisions Made
- `currentStepNumber()` uses sequential scan with APPROVED-marker-based advancement (COMPLETED alone doesn't advance). Always returns at least 1.
- All filesystem operations are sync (`fs.existsSync`, `fs.readFileSync`, `fs.readdirSync`) — consistent with existing project patterns in `fs-utils.ts`, `queues.ts`, `transitions.ts`.
- CWD derivation for `pendingTask()` walks up from `goalDir` via `/goals/` path splitting, with fallbacks for edge cases.
- No internal caching — every method reads fresh from disk on every call.

## Test Coverage
- 40 tests pass across all categories: construction (3), hasGoal (3), hasPlan (2), totalPlanSteps (4), steps (15), currentStepNumber (7), pendingTask (3), lastCompleted (3).
- Edge cases covered: empty goal dirs, malformed JSON in both queue and LAST_TASK files, no-caching proofs (filesystem changes reflected immediately), marker precedence, non-step folder filtering.
- Programmatic verification: `npm run check` passes, all exports present, no async fs calls.

## Review Issues Addressed (from S01/REVIEW.md)
- **[HIGH] Fixed misleading comments:** Lines 215 and 218 in `currentStepNumber()` now correctly reference "APPROVED" instead of "COMPLETED".
- **[HIGH] Added malformed-JSON test for `lastCompleted()`:** New test writes `{invalid json}` to `LAST_TASK.json` and asserts `undefined` is returned without throwing.

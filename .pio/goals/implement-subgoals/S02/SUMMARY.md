# Summary: Queue keying

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/queues.ts` — Added `deriveQueueKey(goalDir, cwd)` pure function; extended `enqueueTask` and `readPendingTask` with optional `qualifiedName` parameter; updated `listPendingGoals` JSDoc; replaced unreachable fallbacks with `throw new Error()`; replaced regex `/[\/]/` with `.split("/")`
- `src/goal-state.ts` — Imported `deriveQueueKey`; `pendingTask()` now computes qualified queue key from `goalDir` instead of using `goalName` basename
- `src/queues.test.ts` — Added 15 new tests: 6 for `deriveQueueKey` (including throw-on-error cases), 4 for `enqueueTask` with `qualifiedName`, 3 for `readPendingTask` with `qualifiedName`; replaced dead-code fallback test with throw-verification test
- `src/goal-state.test.ts` — Added 3 new tests for `pendingTask()` with nested subgoal paths

## Files Deleted
- (none)

## Decisions Made
- `deriveQueueKey` is a pure function in `src/queues.ts` (not `fs-utils.ts`) — it's a queue-key derivation utility, colocated with `enqueueTask`/`readPendingTask`
- Used `!== undefined` guard pattern for optional `qualifiedName` parameter, consistent with Step 1's `parentStepDir` pattern
- Uses `.split("/")` for path segment splitting, consistent with the rest of the codebase (simple string operations over regex)
- Throws `Error` when `.pio/goals/` prefix is not found — this is a programming error, fail loudly instead of silently masking
- Throws `Error` when all segments after filtering are empty — same rationale: fail loudly on impossible state

## Test Coverage
- 15 new tests in `src/queues.test.ts`:
  - `deriveQueueKey`: flat goals, nested subgoals, deeply nested paths, single-segment names, throws on unknown prefix, throws on empty segments
  - `enqueueTask` with `qualifiedName`: backward compatible (no arg), qualified name usage, separate files for different keys, empty-string handling
  - `readPendingTask` with `qualifiedName`: backward compatible, qualified name usage, undefined for missing files
- 3 new tests in `src/goal-state.test.ts`:
  - Nested subgoal `goalDir` reads from correct qualified queue file
  - Flat `goalDir` reads from `task-{basename}.json` (backward compatible)
  - Nested `goalDir` with no matching queue file returns `undefined`
- All 563 tests pass (22 test files), including all pre-existing tests (no regressions)
- TypeScript compilation (`npx tsc --noEmit`) reports 0 errors

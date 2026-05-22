---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 1
lowIssues: 0
---

# Code Review: Queue keying (Step 2)

## Decision
APPROVED

## Summary
Clean, well-structured implementation of hierarchical queue keys. `deriveQueueKey` is a pure function colocated with queue operations in `src/queues.ts`, signatures are backward compatible via optional `qualifiedName` parameters, and `GoalState.pendingTask()` correctly uses the new key derivation. Test coverage is comprehensive across all code paths with 18 new tests and zero regressions in the existing 545 tests (563 total). TypeScript compilation passes cleanly. One medium-severity concern around error handling consistency was identified but does not justify rejection — see details below.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- [MEDIUM] `deriveQueueKey` throws when `.pio/goals/` prefix is not found, deviating from TASK.md's "Risks and Edge Cases" specification which calls for falling back to `path.basename(goalDir)` instead of crashing. The throw propagates uncaught through `GoalState.pendingTask()`, violating the error-tolerant pattern used by other `GoalState` methods (e.g., malformed JSON returns `undefined`). All current callers construct valid paths via `createGoalState`, so the throw is unreachable in practice. SUMMARY.md documents this as intentional ("fail loudly on programming errors"). **Classification justification:** matches "Other quality concerns — insufficient error handling for non-critical paths" because the task spec called for defensive fallback, and `GoalState.pendingTask()` otherwise handles errors gracefully (JSON parse failures return `undefined`); the throw creates inconsistency within the same class. — `src/queues.ts` (lines 28-31), `src/goal-state.ts` (line 285)

## Low Issues
- (none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered by tests:

| Acceptance Criterion | Test(s) | Status |
|---|---|---|
| `deriveQueueKey` returns basename for flat goals | `queues.test.ts` — "given a flat goal path..." | ✅ Covered |
| `deriveQueueKey` filters `subgoals` and joins with `__` | `queues.test.ts` — "given a nested subgoal path..." | ✅ Covered |
| `deriveQueueKey` handles deeply nested paths | `queues.test.ts` — "given a deeply nested path..." | ✅ Covered |
| `deriveQueueKey` handles single-segment names | `queues.test.ts` — "given a goal path with a single-segment name..." | ✅ Covered |
| Flat goal queue file is still `task-{goalName}.json` | `queues.test.ts` — backward-compatible enqueue/read tests | ✅ Covered |
| `enqueueTask` without `qualifiedName` uses `goalName` | `queues.test.ts` — "when qualifiedName is omitted..." | ✅ Covered |
| `enqueueTask` with `qualifiedName` uses qualified key | `queues.test.ts` — "when qualifiedName is provided..." | ✅ Covered |
| `readPendingTask` backward-compatible without `qualifiedName` | `queues.test.ts` — "when qualifiedName is omitted..." | ✅ Covered |
| `GoalState.pendingTask()` for flat goals reads correct file | `goal-state.test.ts` — "given a flat goalDir..." | ✅ Covered |
| `GoalState.pendingTask()` for nested goals reads qualified file | `goal-state.test.ts` — "given a nested subgoal goalDir..." | ✅ Covered |

Additional edge cases tested: empty-string `qualifiedName`, missing queue files, deeply nested paths (3 levels), throw on unknown prefix.

## Gaps Identified
- **TASK.md vs TEST.md / Implementation discrepancy:** TASK.md "Risks and Edge Cases" specifies `deriveQueueKey` should fall back to `path.basename(goalDir)` when the prefix is not found. Both TEST.md and the implementation test/expect throwing behavior instead. This is documented in SUMMARY.md as an intentional design decision with rationale ("fail loudly on programming errors"). Not a gap that affects correctness — all callers provide valid paths — but it represents a spec-to-implementation deviation worth noting.

## Recommendations
N/A — approved as-is. If the medium issue is later deemed important, wrapping `deriveQueueKey` in `GoalState.pendingTask()` with a try-catch and falling back to `path.basename(goalDir)` would resolve the inconsistency without changing `deriveQueueKey` itself.

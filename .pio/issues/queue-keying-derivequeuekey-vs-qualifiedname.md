# Step 2 (Queue Keying) implemented deriveQueueKey inline instead of specified qualifiedName parameter contract

## Problem

S02 (Queue Keying) was implemented and approved, but the actual implementation deviates from what `TASK.md` specified:

### TASK.md specification
- `enqueueTask` and `readPendingTask` accept **optional `qualifiedName?: string` parameter** — when present, use it as the queue filename key
- `deriveQueueKey(goalDir, cwd)` is a new pure utility function in `src/queues.ts`
- Consumer code (e.g., `session-capability.ts`) would call `deriveQueueKey()` externally and pass the result as `qualifiedName`

### Actual implementation (SUMMARY.md)
- `GoalState.pendingTask()` **internally calls `deriveQueueKey()`** to compute the queue path — it does NOT accept a `qualifiedName` parameter
- The optional `qualifiedName` parameter on `enqueueTask`/`readPendingTask` was added, but the primary integration point (`pendingTask()`) bypasses it by computing the key inline

### Impact on Step 3
S03 (State Machine Transitions) started implementing based on what TASK.md specified. During S03's evolve-plan phase, the specification writer discovered that `GoalState` wasn't actually using the `qualifiedName` contract — it was calling `deriveQueueKey` directly. This triggered a `REVISE_PLAN_NEEDED`.

### Decision needed
The revision must reconcile two competing approaches:
1. **Keep `deriveQueueKey` inline** (simpler, but breaks the `qualifiedName` abstraction) — downstream code can't override queue keys
2. **Use `qualifiedName` parameter everywhere** (matches original spec, more flexible) — requires refactoring S02's integration in `goal-state.ts`

S02 is COMPLETED and immutable per pio rules, so if option 2 is chosen, a new step must be added to revert S02's changes to `goal-state.ts` and re-implement using the `qualifiedName` contract.

## Category

bug

## Context

- S02/TASK.md specified optional `qualifiedName` parameter on enqueueTask/readPendingTask
- S02/SUMMARY.md shows pendingTask() calls deriveQueueKey internally, not via qualifiedName
- S03 was triggered from plan revision due to this mismatch
- Relevant files: src/queues.ts, src/goal-state.ts, src/capabilities/session-capability.ts

# Task: Eliminate `_private(state)` / `public(goalDir)` split in `execute-task.ts`

Remove the internal indirection pattern where `_isStepReady(GoalState, stepNumber)` delegates to a private helper, and have the public API create state directly.

## Context

In `src/capabilities/execute-task.ts`, the `_private(state)` / `public(goalDir)` split creates unnecessary indirection:

- `_isStepReady(state: GoalState, stepNumber)` (private, line ~80) — checks step readiness given a pre-built state
- `isStepReady(goalDir, stepNumber)` (public, line ~93) — wraps the private function by creating `GoalState` internally

This matches the pattern described in GOAL.md section "Ugly `_private(state)` / `public(goalDir)` pattern". Callers never pass a pre-built `GoalState` to `_isStepReady` directly — they always go through the public API. The only exception is `validateAndFindNextStep()` (line ~147), which reuses a single `GoalState` across multiple step checks for efficiency.

## What to Build

### Inline state creation into `isStepReady`

Remove `_isStepReady` entirely. The logic is simple enough (3 lines: find step, check status) to inline at each call site:

```typescript
// Before:
function _isStepReady(state: GoalState, stepNumber: number): boolean { ... }
export function isStepReady(goalDir, stepNumber) { return _isStepReady(createGoalState(goalDir), stepNumber); }

// After:
export function isStepReady(goalDir: string, stepNumber: number): boolean {
  const state = createGoalState(goalDir);
  const step = state.steps().find(s => s.stepNumber === stepNumber);
  if (!step) return false;
  return step.status() === "defined";
}
```

### Inline the same logic in `validateAndFindNextStep`

`validateAndFindNextStep()` currently calls `_isStepReady(state, i)` in a loop. After removing `_isStepReady`, inline the same check directly:

```typescript
// Instead of: if (_isStepReady(state, i))
const step = state.steps().find(s => s.stepNumber === i);
if (step && step.status() === "defined") { ... }
```

No new helper function is needed — both call sites are within the same file and the logic is trivially inlinable.

### Remove unused `GoalState` import

After removing `_isStepReady`, check if the `GoalState` type import (`import { createGoalState, type GoalState } from "../goal-state"`) is still needed. If it's only used for creating state (not as a type annotation), remove the named type import and keep only `createGoalState`.

## Dependencies

None. This step is self-contained — no dependency on Steps 1–6 outputs. It modifies only `execute-task.ts` and its test file.

## Files Affected

- `src/capabilities/execute-task.ts` — remove `_isStepReady`, inline logic into `isStepReady` and `validateAndFindNextStep`. Optionally clean up unused type imports.
- `src/capabilities/execute-task.test.ts` — no behavioral change expected; existing tests should continue to pass without modification.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `isStepReady(goalDir, stepNumber)` produces same results as before (behavioral equivalence)
- [ ] No `_isStepReady` function exists in the file
- [ ] Existing tests in `src/capabilities/execute-task.test.ts` pass with no regressions

## Risks and Edge Cases

- **Behavioral equivalence:** The refactored `isStepReady` must produce identical results. The logic is simple (find step, check status), but verify that zero-padded step numbers still resolve correctly through `GoalState.steps()`.
- **Type import cleanup:** Don't break the file by removing an import that's still used elsewhere (e.g., if `GoalState` appears in a type annotation somewhere else in the file). Check before removing.

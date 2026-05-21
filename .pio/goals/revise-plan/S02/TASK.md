# Task: Add `revisionNeeded()` to StepStatus and GoalState

Add a `revisionNeeded(): boolean` method to `StepStatus` so evolve-plan's transition logic can detect when the `REVISE_PLAN_NEEDED` marker file signals that plan revision is required.

## Context

The revise-plan capability needs a way for evolve-plan to detect that a specification step has determined the plan needs restructuring. The mechanism is a marker file (`REVISE_PLAN_NEEDED`) written inside the step folder (`S{NN}/`). Currently, `StepStatus` has methods like `hasTask()`, `hasTest()`, `hasSummary()` and `status()` that check for specific files/markers — but no method to check for this revision marker. This needs to be queryable from `GoalState.steps()[N].revisionNeeded()` so the state machine's `resolveTransition()` can route `evolve-plan → revise-plan` when the condition is met.

## What to Build

Add a single method to `StepStatus`:

```typescript
interface StepStatus {
  // ... existing members ...
  /** Returns true when REVISE_PLAN_NEEDED marker exists in the step folder. */
  revisionNeeded: () => boolean;
}
```

The implementation follows the existing pattern in `createStepStatus()`: a zero-argument function closure performing a lazy `fs.existsSync` check on `path.join(stepDir, "REVISE_PLAN_NEEDED")`. No caching — reads fresh from disk on every call, consistent with all other `StepStatus` methods.

### Code Components

**`revisionNeeded` on `StepStatus`:**
- **What:** Returns `true` when the step folder contains a `REVISE_PLAN_NEEDED` file, `false` otherwise.
- **Interface:** `revisionNeeded: () => boolean` — zero-arg function returning boolean.
- **Implementation location:** Inside `createStepStatus()` in `src/goal-state.ts`, alongside `hasTask`, `hasTest`, `hasSummary`.
- **Pattern:** Identical to existing marker checks — `() => fs.existsSync(path.join(stepDir, "REVISE_PLAN_NEEDED"))`.

### Approach and Decisions

- Follow the exact pattern of `hasTask()`, `hasTest()`, `hasSummary()` in `createStepStatus()` — all are zero-arg functions wrapping `fs.existsSync` on a specific file path inside the step directory.
- The marker filename is `REVISE_PLAN_NEEDED` (exact, case-sensitive) as specified in GOAL.md.
- No changes to `GoalState` interface are needed — `revisionNeeded()` lives on `StepStatus`, which is returned by `state.steps()[N]`. The state machine will access it via `state.steps()[currentStep].revisionNeeded()`.
- This is purely additive — no existing methods, interfaces, or behaviors are modified.

## Dependencies

- Step 1 (shared planning skill) — no direct code dependency, but step ordering is plan-driven. None.

## Files Affected

- `src/goal-state.ts` — add `revisionNeeded: () => boolean` to `StepStatus` interface and implementation in `createStepStatus()`

## Acceptance Criteria

- [ ] `StepStatus` interface has a `revisionNeeded: () => boolean` method
- [ ] Method returns `true` when `REVISE_PLAN_NEEDED` exists in the step folder, `false` otherwise
- [ ] Existing `createGoalState()` factory creates the method on each `StepStatus` instance
- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass (no regressions)

## Risks and Edge Cases

- **Case sensitivity:** The marker filename must match exactly (`REVISE_PLAN_NEEDED`). On case-insensitive filesystems (macOS/Windows), this is less risky, but the implementation should not normalize casing.
- **No changes to existing behavior:** This is a purely additive change — verify no existing method signatures or return types are altered.

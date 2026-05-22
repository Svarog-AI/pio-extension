# Summary: State machine transitions

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — Refactored `steps()` to derive from `planMetadata()` instead of scanning folders; `StepStatus.getMetadata()` is now pre-populated from frontmatter at construction (no redundant re-reads); `planMetadata` extracted as a local function shared by `steps()`, `totalPlanSteps()`, and the public `planMetadata` property
- `src/state-machine.ts` — Modified `transitionEvolvePlan` to detect subgoal steps via `state.steps()[n].getMetadata()` and route to `create-goal` with parent context; extracted `transitionFinalizeGoal` for completion propagation; updated `resolveTransition` switch to wire up `transitionFinalizeGoal`; removed standalone `getStepMetadata` (state machine now uses `GoalState`)
- `src/state-machine.test.ts` — Added 27 new tests: subgoal spawning in `transitionEvolvePlan` (7 tests), completion propagation in `transitionFinalizeGoal` (6 tests), subgoal lifecycle integration (3 tests), backward compatibility (2 tests); removed `getStepMetadata` tests (function removed); updated mocks to support `getMetadata` via `StepStatus`
- `src/goal-state.test.ts` — Updated `steps()` tests to reflect frontmatter-driven behavior (steps derived from PLAN.md, not folder scanning); updated `getMetadata()` graceful degradation tests; updated `revisionNeeded()` tests with PLAN.md frontmatter
- `src/capabilities/revise-plan.ts` — Moved `state.steps()` call before PLAN.md archive in `prepareSession` (steps need frontmatter which gets deleted by archive)
- `src/capabilities/execute-task.test.ts` — Added PLAN.md generation to `createGoalTree` helper
- `src/capabilities/review-task.test.ts` — Added PLAN.md generation to `createGoalTree` helper
- `src/capabilities/revise-plan.test.ts` — Updated default PLAN.md content to include `steps` array; updated test helpers to write PLAN.md with `steps` array
- `src/capabilities/mark-complete-integration.test.ts` — Updated PLAN.md content to include `steps` array

## Files Deleted
- (none)

## Decisions Made
- **`steps()` derives from `planMetadata()` instead of scanning folders:** Single source of truth for step definitions. Eliminated duplicate frontmatter reading between `StepStatus.getMetadata()` and any standalone helper. Every step defined in PLAN.md frontmatter produces a `StepStatus`, even if the folder doesn't exist yet on disk.
- **Removed standalone `getStepMetadata` from state-machine.ts:** The state machine receives a `GoalState` and uses `state.steps()[n].getMetadata()` for subgoal detection. No need for a separate helper that re-reads PLAN.md.
- **`planMetadata` as a local function in `createGoalState`:** Defined once, referenced by `steps()`, `totalPlanSteps()`, and exposed as the public `planMetadata` property. No separate internal helper — all frontmatter reading goes through the same function.
- **`prepareSession` reads steps before archiving PLAN.md:** Since `steps()` now needs PLAN.md frontmatter, and `prepareSession` deletes PLAN.md during archiving, the step list must be cached before the archive.
- **`StepStatus.getMetadata()` pre-populated at construction:** The metadata is computed once when `createStepStatus` is called (from the shared `planMetadata` read), not re-read on every `getMetadata()` call.

## Test Coverage
- State machine: 68 tests (41 original + 27 new), all passing
- Subgoal spawning: 7 tests covering create-goal routing, param inclusion (parentGoalName, parentStepNumber, subgoalType, workingDir), backward compatibility (task steps, no metadata), and revision priority
- Completion propagation: 6 tests covering parent routing, param pollution prevention, top-level goal terminal behavior, and type guards
- Integration: 3 tests verifying the full subgoal lifecycle chain
- Backward compatibility: 2 tests confirming existing finalize-goal and evolve-plan behavior unchanged
- Full suite: 600 tests across 22 files, 0 regressions

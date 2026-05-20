# Task: Add goalCompleted() to GoalState and use it in transitionEvolvePlan + validateAndFindNextStep

Centralize completion detection on `GoalState` so transition functions and capability guards query state rather than reason about step arithmetic. Prevents spurious `execute-task` routing when all plan steps are evolved.

## Context

Currently, `transitionEvolvePlan()` always returns `{ capability: "execute-task" }`. When all plan steps are complete (evolve-plan wrote `COMPLETED` in Step 5), calling `pio_mark_complete` routes to `execute-task` with a non-existent step number. The completion check (`currentStepNumber() > totalSteps`) is duplicated across two modules — evolve-plan does it manually, and the transition function needs it too. Adding `goalCompleted()` eliminates both sources of duplication.

## What to Build

### Code Components

#### New `goalCompleted()` method on GoalState

Add a zero-argument method to the `GoalState` interface: `goalCompleted(): boolean`. Returns `true` when either completion signal is present:

1. **COMPLETED marker exists** — `<goalDir>/COMPLETED` file is present (infrastructure-managed or agent-created).
2. **Frontmatter exhaustion** — `totalPlanSteps()` returns a defined number AND `currentStepNumber() > totalPlanSteps()`. Uses existing GoalState methods — no direct frontmatter parsing.

Returns `false` when neither signal is present. Lazy-evaluated — reads fresh on every call. In the factory, use only existing GoalState methods (`totalPlanSteps()`, `currentStepNumber()`) and one `fs.existsSync()` for the COMPLETED marker — same pattern as `hasGoal()` and `hasPlan()`.

#### Modified `transitionEvolvePlan(state, params)` in state-machine.ts

Add a guard at the start of the function (before existing `execute-task` routing):

1. Call `state.goalCompleted()`.
2. When `true`, return `undefined` — no transition, session terminates gracefully.
3. Otherwise, fall through to existing behavior (route to `execute-task`).

**Return type update:** Change from `TransitionResult` to `TransitionResult | undefined`. Propagates correctly through `resolveTransition()` which already returns `TransitionResult | undefined`.

#### Refactored `validateAndFindNextStep()` in evolve-plan.ts

Replace the two manual completion checks (COMPLETED guard + frontmatter exhaustion) with a single `state.goalCompleted()` call. The current code has ~15 lines of raw `fs.existsSync`, `planMetadata()` unwrapping, and step count comparison:

**Before:**
- COMPLETED pre-launch guard: `fs.existsSync(completedPath)` → return not-ready
- Frontmatter-based check: `state.planMetadata() as PlanFrontmatter | null` + `currentStep > metadata.totalSteps` → write marker, return not-ready

**After:** single block:
- Call `state.goalCompleted()` → when true, write COMPLETED if not already present, return not-ready with appropriate message
- Remove unused `PlanFrontmatter` import (no longer unwrapping `planMetadata()`)

### Approach and Decisions

- **GoalState is the single source of truth:** Both transition functions and capability guards query state through the interface — no raw file reads or frontmatter parsing outside GoalState. Follows the established pattern: `transitionReviewTask` calls `state.steps()`, not raw file reads.
- **No import changes in state-machine.ts:** The module already imports from `./goal-state`. Adding a method to the interface requires zero import changes.
- **evolve-plan.ts simplifies its imports:** Removes the `PlanFrontmatter` import (currently used only for casting `planMetadata()` result). After refactoring, GoalState handles all frontmatter reasoning.

## Dependencies

- **Step 2 (totalPlanSteps()):** Must be available on GoalState. Used internally by `goalCompleted()`.
- **Step 5 (COMPLETED marker infrastructure):** Wrote the initial completion detection in evolve-plan that we're now refactoring into GoalState.

## Files Affected

- `src/goal-state.ts` — add `goalCompleted(): boolean` to interface and factory
- `src/state-machine.ts` — modify `transitionEvolvePlan()` to call `state.goalCompleted()`, update return type to `TransitionResult | undefined`
- `src/capabilities/evolve-plan.ts` — replace COMPLETED guard + frontmatter check with single `state.goalCompleted()` call; remove unused `PlanFrontmatter` import
- `src/goal-state.test.ts` — add tests for new `goalCompleted()` method
- `src/state-machine.test.ts` — add tests for evolve-plan completion detection in transitions
- `src/capabilities/evolve-plan.test.ts` — update existing tests to match refactored behavior (expectations unchanged, implementation simpler)

## Acceptance Criteria

- [ ] `goalCompleted(): boolean` method added to GoalState interface and factory implementation
- [ ] Returns `true` when `<goalDir>/COMPLETED` marker exists (regardless of frontmatter)
- [ ] Returns `true` when `totalPlanSteps()` is defined AND `currentStepNumber() > totalPlanSteps()`
- [ ] Returns `false` when neither signal present (no frontmatter, no marker)
- [ ] `transitionEvolvePlan()` returns `undefined` when `goalCompleted()` is true
- [ ] `transitionEvolvePlan()` falls back to existing behavior (route to `execute-task`) when false
- [ ] `validateAndFindNextStep()` uses `state.goalCompleted()` instead of separate COMPLETED and frontmatter checks
- [ ] `validateAndFindNextStep()` still writes COMPLETED marker when completing (infrastructure-managed)
- [ ] `validateAndFindNextStep()` still refuses relaunch when COMPLETED already exists
- [ ] Unused `PlanFrontmatter` import removed from evolve-plan.ts
- [ ] `resolveTransition` switch already handles "evolve-plan" — modify internal function only, not the switch
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Return type compatibility:** Changing `transitionEvolvePlan` to return `undefined` propagates correctly through `resolveTransition()` which already returns `TransitionResult | undefined`. No downstream breakage.
- **COMPLETED marker location:** Must check `<goalDir>/COMPLETED` (goal root), not S{NN}/ subfolder COMPLETED markers used by `StepStatus.status()`.
- **When frontmatter unavailable:** `totalPlanSteps()` returns `undefined`. Only the COMPLETED marker can signal completion — no regression for plans without frontmatter.

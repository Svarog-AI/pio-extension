# Summary: Add goalCompleted() to GoalState and use it in transitionEvolvePlan + validateAndFindNextStep

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — Added `goalCompleted(): boolean` to `GoalState` interface and factory implementation. Checks **only** the COMPLETED marker file (`<goalDir>/COMPLETED`). This is the canonical completion signal — checked by `validateOutputs` to pass exit-gate validation.
- `src/state-machine.ts` — Modified `transitionEvolvePlan()` to return `undefined` when `state.goalCompleted()` is true. Updated return type to `TransitionResult | undefined`.
- `src/capabilities/evolve-plan.ts` — `validateAndFindNextStep()` has a three-stage check: (1) `goalCompleted()` (marker only) → if true, refuse relaunch; (2) `planMetadata()` → if null, **throw an error** (frontmatter is mandatory); (3) frontmatter exhaustion (`currentStepNumber() > totalSteps`) → if true, write COMPLETED marker, return not-ready. Otherwise proceed normally. Imports `PlanFrontmatter` from `frontmatter-schemas`.
- `src/goal-state.test.ts` — Added `describe("goalCompleted()")` block with 7 test cases. Tests verify that `goalCompleted()` checks only the COMPLETED marker (frontmatter exhaustion without marker returns false). Updated "all methods execute without throwing" test to include `goalCompleted()`.
- `src/state-machine.test.ts` — Added `goalCompleted()` to `mockState()` helper. Added `describe("resolveTransition — evolve-plan completion detection")` block with 3 test cases verifying `undefined` return on completion and normal routing when not complete.
- `src/capabilities/evolve-plan.test.ts` — Updated tests to reflect the three-stage completion model: marker check, mandatory frontmatter (throws if missing), and frontmatter exhaustion. Tests verify: marker blocks relaunch, frontmatter exhaustion writes marker and blocks launch, normal flow proceeds when steps remain, missing frontmatter throws with fix instructions.

## Files Deleted
- (none)

## Decisions Made
- **COMPLETED marker is the canonical completion signal:** `goalCompleted()` checks only the COMPLETED marker file. This is what `validateOutputs` checks to pass exit-gate validation.
- **Frontmatter is mandatory:** `validateAndFindNextStep()` throws if `planMetadata()` returns null. Frontmatter is enforced by create-plan's `postValidate` (Step 4). If we reach evolve-plan without valid frontmatter, that's an invalid state — throw with instructions to fix manually.
- **Frontmatter is consumed exactly once:** In `validateAndFindNextStep()`, after the marker check. If `currentStepNumber() > totalSteps`, write the COMPLETED marker and return not-ready. This prevents launching an unnecessary evolve-plan session.
- **transitionEvolvePlan() checks the marker:** When `goalCompleted()` is true (marker exists), return `undefined` — no transition, session terminates gracefully. This prevents spurious `execute-task` routing after the agent has written the COMPLETED marker (agent-side fallback path).

## Execution Flow

1. User runs `/pio-evolve-plan` or calls `pio_evolve_plan` tool
2. `validateAndFindNextStep()` checks `goalCompleted()` (COMPLETED marker only)
3. If marker exists: return not-ready, refuse relaunch
4. If marker doesn't exist: read frontmatter via `planMetadata()`
5. If frontmatter is null/invalid: **throw error** with fix instructions
6. If `currentStepNumber() > totalSteps`: write COMPLETED marker, return not-ready (no session launched)
7. Otherwise: find next step, return ready, session starts
8. Agent reads PLAN.md, looks for assigned step
9. If step found: agent writes TASK.md, TEST.md, calls `pio_mark_complete`
10. If step NOT found (edge case fallback): agent writes COMPLETED, calls `pio_mark_complete`
11. `validateOutputs()` sees COMPLETED, passes validation
12. `transitionEvolvePlan()` checks `goalCompleted()` — marker exists — returns `undefined`
13. Session terminates gracefully, no task enqueued

## Test Coverage
- 7 unit tests for `goalCompleted()` covering: COMPLETED marker presence, frontmatter exhaustion without marker (returns false), steps remaining, no signals, single-step plan with marker, marker-only completion, invalid frontmatter
- 3 unit tests for `transitionEvolvePlan()` completion detection: undefined return on completion, execute-task routing when not complete, explicit stepNumber precedence
- 5 unit tests for `validateAndFindNextStep()` completion: marker blocks relaunch, valid frontmatter with steps remaining allows launch, frontmatter exhaustion writes marker and blocks, missing frontmatter throws with fix instructions
- All 449 tests pass, `tsc --noEmit` reports no errors

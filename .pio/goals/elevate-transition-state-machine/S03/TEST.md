# Tests: Migrate capability pre-launch validation to use `GoalState`

## Test Strategy

The project uses **Vitest** (`npm run test`). Existing test files for all three capabilities already use real temp directories (no mocking) to verify filesystem-based behavior. After migration, external behavior must be identical — tests should continue passing without modification, proving the GoalState abstraction correctly reproduces existing logic.

### Verification approach

1. **Regression via existing tests:** The primary test strategy is that existing `.test.ts` files continue to pass unchanged. This proves behavioral equivalence.
2. **Import verification:** Programmatic checks confirm `createGoalState` is imported and direct `node:fs` goal-state queries are removed.
3. **Type checking:** `npm run check` validates all types resolve correctly.

## Unit Tests (existing test files — no changes expected)

### File: `src/capabilities/evolve-plan.test.ts`

**What:** Verifies `validateAndFindNextStep()` behavior after migration to GoalState.

- **"returns ready:false when COMPLETED exists at goal root"** — root-level COMPLETED marker still blocks relaunch
- **"returns ready:true when COMPLETED does not exist and PLAN.md exists"** — returns stepNumber 1 with no S01/ yet
- Tests should pass without modification since exported signatures are unchanged

### File: `src/capabilities/execute-task.test.ts`

**What:** Verifies `isStepReady()` and related behavior after migration to GoalState.

- **`isStepReady` — "TASK.md + TEST.md present, no markers → true"** — step with both specs, no COMPLETED/BLOCKED
- **`isStepReady` — "missing TASK.md → false"** — only TEST.md present
- **`isStepReady` — "missing TEST.md → false"** — only TASK.md present
- **`isStepReady` — "both specs + COMPLETED marker → false"** — already completed
- **`isStepReady` — "both specs + BLOCKED marker → false"** — blocked step
- **`isStepReady` — "step folder does not exist → false"** — no S01/ at all

These 6 tests exercise the complete truth table for execution readiness. All must continue passing.

### File: `src/capabilities/review-code.test.ts`

**What:** Verifies `isStepReviewable()` and `findMostRecentCompletedStep()` after migration to GoalState.

- **`isStepReviewable` — "COMPLETED + SUMMARY.md, no BLOCKED → true"** — reviewable step
- **`isStepReviewable` — "missing COMPLETED → false"** — no COMPLETED marker
- **`isStepReviewable` — "missing SUMMARY.md → false"** — no SUMMARY.md
- **`isStepReviewable` — "has BLOCKED → false even with COMPLETED + SUMMARY.md"** — blocked override
- **`isStepReviewable` — "folder does not exist → false"** — missing step folder

- **`findMostRecentCompletedStep` — "no step folders → undefined"** — empty goal
- **`findMostRecentCompletedStep` — "one completed step (S01) → 1"** — single reviewable step
- **`findMostRecentCompletedStep` — "multiple sequential completed steps → returns highest"** — S01+S02 both reviewable
- **`findMostRecentCompletedStep` — "gap in middle — S01 complete, S02 not reviewable → returns 1"** — reverse scan skips non-reviewable
- **`findMostRecentCompletedStep` — "S01 blocked, S02 completed → returns 2"** — BLOCKED prevents review of S01
- **`findMostRecentCompletedStep` — "S01 has specs but no COMPLETED, S02 reviewable → returns 2"**

These 11 tests exercise the complete truth table for review readiness and reverse-scan discovery. All must continue passing.

## Programmatic Verification

### Type checking
- **What:** All migrated code compiles without type errors
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no error output

### Full test suite passes
- **What:** All existing tests pass after migration (regression check)
- **How:** `npm run test` (runs `vitest run`)
- **Expected result:** All tests pass, exit code 0. Specifically: evolve-plan.test.ts, execute-task.test.ts, review-code.test.ts must all pass

### Import verification — GoalState is used
- **What:** Each capability imports `createGoalState` from `goal-state.ts`
- **How:** `grep -c 'from.*goal-state' src/capabilities/evolve-plan.ts src/capabilities/execute-task.ts src/capabilities/review-code.ts`
- **Expected result:** All three files show count ≥ 1

### Import verification — direct fs goal-state queries removed
- **What:** Capability validation functions no longer use raw `fs.existsSync` for step-level checks (TASK.md, TEST.md, COMPLETED, BLOCKED, APPROVED, REJECTED, SUMMARY.md)
- **How:** `grep -n 'fs.existsSync.*TASK\|fs.existsSync.*TEST\|fs.existsSync.*COMPLETED\|fs.existsSync.*BLOCKED\|fs.existsSync.*APPROVED\|fs.existsSync.*REJECTED\|fs.existsSync.*SUMMARY' src/capabilities/evolve-plan.ts src/capabilities/execute-task.ts src/capabilities/review-code.ts`
- **Expected result:** No matches in validation/scanning functions. Structural checks like `fs.existsSync(goalDir)` are acceptable (they verify the goal workspace directory exists, not state-dependent files).

### discoverNextStep import removed from evolve-plan.ts
- **What:** `evolve-plan.ts` no longer imports `discoverNextStep` from `../fs-utils` (behavior replaced by `state.currentStepNumber()`)
- **How:** `grep 'discoverNextStep' src/capabilities/evolve-plan.ts`
- **Expected result:** No matches (the function was replaced)

## Test Order

1. `npm run check` — fast type validation first
2. `npm run test` — full Vitest suite (regression verification)
3. Programmatic import checks — verify migration completeness
4. Manual inspection of error messages if any tests fail with assertion mismatches

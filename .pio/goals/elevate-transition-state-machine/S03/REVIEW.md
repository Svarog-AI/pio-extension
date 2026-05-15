---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 1
lowIssues: 1
---

# Code Review: Migrate capability pre-launch validation to use `GoalState` (Step 3)

## Decision
APPROVED

## Summary
The migration successfully replaces ad-hoc filesystem scanning in all three capability modules with `GoalState` queries. The thin-wrapper pattern (public functions accept `goalDir`, internal helpers accept pre-built `GoalState`) eliminates redundant I/O: `validateAndFindNextStep` in execute-task reuses one state across N step checks, and `validateAndFindReviewStep` in review-code avoids double-scanning. All 264 existing tests pass unchanged — proving behavioral equivalence. Type checking is clean, imports are correct, and the migration is complete per TASK.md acceptance criteria.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
- [MEDIUM] `validateExplicitStep()` constructs a fresh `GoalState` on every call but then invokes multiple methods against it (`state.steps().find()`, `step.hasTask()`, `step.hasTest()`, `step.status()`). While this isn't the N+1 problem addressed elsewhere (the function isn't called in loops), each method re-reads the filesystem independently. Consider adding an internal `_validateExplicitStep(state, ...)` variant for consistency with the pattern established for `_isStepReady` and `_findMostRecentCompletedStep`, even if no caller currently benefits. — `src/capabilities/execute-task.ts` (line 168)

## Low Issues
- [LOW] In `validateExplicitStep()`, the error message `"Step ${stepNumber} is already marked as COMPLETED."` is shown for three different statuses (`"implemented"`, `"approved"`, `"rejected"`). A step with `"approved"` status might have an APPROVED marker without a COMPLETED marker (theoretical edge case), making the message technically inaccurate. Consider status-specific messages or a generic `"Step ${stepNumber} has already been processed."` — `src/capabilities/execute-task.ts` (line 209)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered by the existing test suite:

- **evolve-plan.test.ts** (10 tests): Verifies `validateAndFindNextStep()` with COMPLETED guard, PLAN.md checks, and step discovery. The root-level COMPLETED pre-launch guard test confirms the direct `fs.existsSync(completedPath)` is preserved.
- **execute-task.test.ts** (15 tests): Complete truth table for `isStepReady()` — TASK.md+TEST.md present/missing, COMPLETED/BLOCKED markers, and missing step folder. All pass via GoalState internally.
- **review-code.test.ts** (29 tests): Complete truth table for `isStepReviewable()` — COMPLETED+SUMMARY.md, missing files, BLOCKED override, missing folder. Six `findMostRecentCompletedStep()` tests cover reverse-scan discovery: empty goal, single step, multiple sequential, gaps in middle, blocked steps, and spec-only steps.

The test strategy of "existing tests continue to pass unchanged" is sound — it proves behavioral equivalence without requiring new test infrastructure. All 264 tests (11 files) pass with zero failures.

## Gaps Identified
- **GOAL ↔ PLAN alignment:** Step 3 targets `evolve-plan.ts`, `execute-task.ts`, and `review-code.ts` per PLAN.md. The SUMMARY correctly notes `evolve-plan.ts` "required no changes" to internal helpers (it already used GoalState from Step 1), but the file was still migrated — `discoverNextStep` import removed and `state.currentStepNumber()` is now the sole step-discovery mechanism. This is consistent with the plan.
- **TASK ↔ Implementation:** The thin-wrapper pattern with internal helpers (`_isStepReady`, `_isReviewable`, `_findMostRecentCompletedStep`) was not explicitly described in TASK.md but represents an improvement over naive migration — it eliminates N+1 filesystem scans that would have existed if every public call re-created state. This is a positive deviation, documented well in SUMMARY.md.
- **`discoverNextStep` removal:** Confirmed via grep — no references remain in `evolve-plan.ts`. The import from `../fs-utils` was correctly removed.

## Recommendations
N/A — approved as-is. The medium issue (internal helper for `validateExplicitStep`) and low issue (generic error message) are deferrable improvements that don't affect correctness or test coverage.

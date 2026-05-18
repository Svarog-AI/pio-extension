---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Rename `review-code` → `review-task` everywhere (Step 1)

## Decision
APPROVED

## Summary
The rename from `review-code` to `review-task` has been executed comprehensively across the entire codebase. All three acceptance criteria pass: TypeScript compiles with no errors, all 310 tests pass with no regressions, and `grep -r "review-code" src/` returns zero matches. File renames are correct, imports resolve properly, and the prompt file was renamed without content modification (preserving content changes for Step 2). One minor internal variable name remains using the old convention, but it does not affect functionality or any acceptance criterion.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
(none)

## Low Issues
- [LOW] Internal variable `reviewCodeTool` (lines 284, 368 in `src/capabilities/review-task.ts`) was not renamed to `reviewTaskTool`. This is a non-exported local variable — it doesn't affect functionality, type checking, or the acceptance criteria grep check (`grep -r "review-code" src/` searches for the hyphenated form). However, for a rename task focused on naming consistency, this is a minor leftover. Can be cleaned up at any time without impact.

## Test Coverage Analysis
All 310 existing tests pass with no regressions. As this is a rename-only task with no behavioral changes, no new tests were required. The existing test suite serves as the regression proof:
- `src/capabilities/review-task.test.ts` (renamed) — 31 tests covering CAPABILITY_CONFIG, prepareSession, isStepReviewable, and findMostRecentCompletedStep
- `src/state-machine.test.ts` — transition resolver tests updated to use `"review-task"` strings
- `src/guards/validation.test.ts` — integration test labels updated
- `src/capability-config.test.ts` — capability name strings updated in params and assertions
- `src/model-config.test.ts` — capability name string updated
- `src/goal-state.test.ts` — fixture data updated

## Gaps Identified
- **GOAL ↔ PLAN**: Step 1 accurately captures the rename requirement from GOAL.md's "To-Be State" section 1.
- **PLAN ↔ TASK**: Task spec faithfully represents the plan step with detailed file-by-file breakdown.
- **TASK ↔ Implementation**: All specified renames were performed correctly. The single gap is the internal `reviewCodeTool` variable not being explicitly listed in TASK.md's identifier update list — neither the spec nor the implementation addressed it.
- **TASK ↔ TESTS**: TEST.md verification plan covers all acceptance criteria with programmatic checks (file existence, grep, tsc, vitest). All pass.

## Recommendations
N/A — approval granted. The `reviewCodeTool` → `reviewTaskTool` rename can be done opportunistically in a future step if desired.

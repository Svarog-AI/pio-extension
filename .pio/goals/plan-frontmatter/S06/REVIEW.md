---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Add goalCompleted() to GoalState and use it in transitionEvolvePlan + validateAndFindNextStep (Step 6)

## Decision
APPROVED

## Summary
Implementation adds `goalCompleted()` to `GoalState`, modifies `transitionEvolvePlan()` to return `undefined` on completion, and integrates the marker check into `validateAndFindNextStep()`. Four deviations from TASK.md/TEST.md exist — all are documented as intentional design decisions in SUMMARY.md: (1) COMPLETED marker is the sole canonical signal for `goalCompleted()`, (2) tests verify this marker-only behavior, (3) `validateAndFindNextStep()` uses a three-stage check with mandatory frontmatter throwing instead of a single `goalCompleted()` call, and (4) `PlanFrontmatter` import remains in evolve-plan.ts. All 449 tests pass; `tsc --noEmit` reports no errors.

## Critical Issues
(none — all deviations are documented as intentional design decisions in SUMMARY.md "Decisions Made")

## High Issues
(none — complexity choices are documented overrides in SUMMARY.md)

## Medium Issues
(none)

## Low Issues
(none)

## Documented Design Decisions (from SUMMARY.md)

1. **COMPLETED marker is the canonical completion signal** — `goalCompleted()` checks only `<goalDir>/COMPLETED`, matching `validateOutputs` exit-gate validation. Frontmatter exhaustion alone does not trigger completion; the marker must be written by infrastructure or agent first.
2. **Frontmatter is mandatory in evolve-plan** — `validateAndFindNextStep()` throws if `planMetadata()` returns null, since create-plan's `postValidate` (Step 4) enforces valid frontmatter. Reaching evolve-plan without it is an invalid state.
3. **Frontmatter consumed exactly once** — In `validateAndFindNextStep()`, after the marker check: if `currentStepNumber() > totalSteps`, writes COMPLETED marker and returns not-ready.
4. **transitionEvolvePlan() checks the marker** — When `goalCompleted()` is true, returns `undefined` for graceful session termination (no spurious execute-task routing).

## Test Coverage Analysis

- 8 tests for `goalCompleted()` — cover: COMPLETED marker presence/absence, frontmatter exhaustion without marker (returns false), steps remaining, no signals, single-step plan with/without marker, marker-only completion, invalid frontmatter
- 3 tests for `transitionEvolvePlan()` — cover: undefined on completion, execute-task routing when not complete, explicit stepNumber precedence
- 5 tests for `validateAndFindNextStep()` — cover: marker blocks relaunch, valid frontmatter proceeds, exhaustion writes marker and blocks, missing frontmatter throws with fix instructions
- All 449 tests pass; `tsc --noEmit` reports zero errors

## Gaps Identified

None. All deviations from TASK.md/TEST.md are intentional design choices documented in SUMMARY.md "Decisions Made" section.

## Recommendations

N/A

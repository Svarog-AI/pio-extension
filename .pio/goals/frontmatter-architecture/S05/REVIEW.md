---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Wire `postValidate` and `postExecute` through `capability-config.ts` (Step 5)

## Decision
APPROVED

## Summary
The implementation correctly wires `postValidate` and `postExecute` callbacks through `resolveCapabilityConfig`, adds an errors-capable overload to `GoalState.getReviewOutputs()`, and implements the review-task `postValidate` using a single parsing path through GoalState. All 8 acceptance criteria are met, TypeScript compiles cleanly, and all 378 tests pass with zero regressions. The code follows existing project conventions (section dividers, JSDoc comments, import ordering) and matches TASK.md specifications faithfully.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
(none)

## Low Issues
- [LOW] Type assertion `as { data?: ReviewOutputs; error?: string }` in `postValidateReview` (line ~120 of `src/capabilities/review-task.ts`) — The union return type on `getReviewOutputs()` forces a runtime cast. This is acknowledged in the SUMMARY.md decisions ("Union return type over function overloads") and is acceptable given TypeScript interfaces don't support function overloads on property-style members. Can be addressed if the interface is refactored later.

**Severity matching:**
- Type assertion on union return → matches "Style / naming improvements" (LOW) because it's a type narrowing workaround that doesn't affect correctness and is explicitly documented as a design trade-off. At discretion, this does not warrant rejection.

## Test Coverage Analysis

All acceptance criteria from TASK.md are covered by tests:

| Acceptance Criterion | Test Coverage |
|---|---|
| `resolveCapabilityConfig` includes `postValidate`/`postExecute` | `capability-config.test.ts`: 3 passthrough tests (review-task defined, create-goal undefined, postExecute undefined) |
| `review-task.postValidate` validates via `GoalState.getReviewOutputs({ errors: true })` | `review-task.test.ts`: 7 functional tests (APPROVED, REJECTED, missing file, no delimiters, invalid decision, negative count, missing stepNumber) |
| `postValidate` returns `{ success: false, message }` for invalid frontmatter | Covered by missing/invalid frontmatter test group |
| `postValidate` returns `{ success: true }` and creates markers | Covered by valid frontmatter test group (APPROVED + REJECTED with marker verification) |
| `getReviewOutputs()` backward compatible (`T \| null`) | `goal-state.test.ts`: 2 backward compat tests |
| `getReviewOutputs(n, { errors: true })` returns `{ data, error }` | `goal-state.test.ts`: 5 errors-mode tests (valid data, missing file, no delimiters, invalid decision, negative count) |
| Console.warn suppression in errors mode | `goal-state.test.ts`: 1 test with console.warn spy |

**Total: 18 new tests, all passing.** No gaps identified. Tests match TEST.md exactly — same test categories, same assertions, same arrange/act/assert structure.

## Gaps Identified

- **GOAL ↔ PLAN ↔ TASK alignment:** The GOAL.md originally specified that `postValidate` would call `extractFrontmatter` + `validateAndCoerce` directly with the shared parser and schema. TASK.md changed this to use `GoalState.getReviewOutputs()` instead (single parsing path). This is documented in TASK.md under "Approach and Decisions" as an intentional design improvement — not a gap, but a deliberate deviation from the original plan text. The decision is sound: it eliminates duplicated parsing logic.

- **`state-machine.test.ts` modification:** SUMMARY.md lists this file as modified (mock `getReviewOutputs` signature updated to match new union return type). This is a necessary mechanical update — the mock must reflect the interface change. Not an accidental scope change; it's a direct consequence of modifying `GoalState`.

- **No circular dependencies:** Import chain verified: `review-task.ts → goal-state.ts → frontmatter.ts` and `goal-state.ts → frontmatter-schemas.ts`. TypeScript compiles cleanly — no cycles.

## Recommendations
N/A — implementation is solid. The union return type trade-off (LOW) can be revisited if the GoalState interface is refactored in future steps.

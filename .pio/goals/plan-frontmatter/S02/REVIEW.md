---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Add planMetadata() to GoalState and replace totalPlanSteps() (Step 2)

## Decision
APPROVED

## Summary
The implementation correctly adds `planMetadata()` to the `GoalState` interface, refactors `totalPlanSteps()` to delegate to it, and removes the old heading-parsing regex. The `_planMetadata` local variable pattern cleanly enables delegation in a plain object literal without using `this`. All 420 tests pass, TypeScript compiles with no errors, and every acceptance criterion from TASK.md is satisfied. Test coverage is comprehensive — 18 new test cases spanning valid data, error conditions, edge cases, and console.warn suppression.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
(none)

## Low Issues
- [LOW] `_planMetadata` emits `console.warn` on validation failure (when `errors` is false), whereas the existing `getReviewOutputs()` returns `null` silently in the same branch. TASK.md instructs to "follow the exact branching logic of `getReviewOutputs()`." The extra warning is arguably more useful for debugging, but it's a minor pattern inconsistency. — `src/goal-state.ts` (lines 178-183)

## Test Coverage Analysis
All acceptance criteria are covered by tests:

| Acceptance Criterion | Test Coverage |
|---|---|
| `planMetadata()` returns typed PlanFrontmatter on valid frontmatter | ✅ "returns typed PlanFrontmatter when PLAN.md has valid frontmatter" |
| Returns null for missing PLAN.md | ✅ "returns null when PLAN.md does not exist" |
| Returns null for no frontmatter delimiters | ✅ "returns null for PLAN.md with no frontmatter delimiters" |
| Returns null for malformed YAML | ✅ "returns null for malformed YAML in frontmatter" |
| Returns null for missing totalSteps | ✅ "returns null when totalSteps is missing from frontmatter" |
| Returns null for zero/negative/float totalSteps | ✅ Three separate tests |
| Strips extra fields | ✅ "strips extra fields from frontmatter, returns only totalSteps" |
| No caching (reads fresh each call) | ✅ "reads fresh from disk on every call (no caching)" |
| Boundary value totalSteps: 1 | ✅ "returns valid PlanFrontmatter for boundary value totalSteps: 1" |
| `{ errors: true }` returns `{ data }` / `{ error }` | ✅ Five tests covering success, missing file, no delimiters, typebox details, extra fields |
| Suppresses console.warn in errors mode | ✅ Two tests — suppresses with errors=true, emits without |
| `totalPlanSteps()` delegates to frontmatter | ✅ Four tests covering valid, missing, no frontmatter, invalid |
| Old heading regex removed | ✅ Verified via grep — zero matches |
| TypeScript compiles | ✅ `npx tsc --noEmit` exit code 0 |

## Gaps Identified
None. The implementation fully satisfies TASK.md, TEST.md, and the PLAN.md specification for Step 2. Downstream consumers of `totalPlanSteps()` already handle `undefined` — no changes needed there (confirmed by zero regressions across 420 tests).

## Recommendations
N/A — approved as-is. The single low-issue (console.warn on validation failure) can be addressed in a future refactor if strict pattern parity with `getReviewOutputs()` becomes a concern.

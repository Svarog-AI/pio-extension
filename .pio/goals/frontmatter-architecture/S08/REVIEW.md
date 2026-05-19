---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Slim down `validation.ts` — retain only file protection (Step 8)

## Decision
APPROVED

## Summary
Step 8 successfully completed the cleanup of `src/guards/validation.ts`, removing all frontmatter-related code, tool registration, and the `extractGoalName` function. The file now contains exactly what was specified: file protection event handlers (`tool_call` guard, `resources_discover` config loading, `turn_start` counter reset), the `validateOutputs` utility, and type re-exports. All programmatic verification checks pass. No regressions were introduced beyond the 7 expected `extractGoalName` test failures (to be handled in Step 9).

## Critical Issues
- (none)

## High Issues
- (none)

### Note on pre-existing dead code
The variables `warnedOnce`, `warningsThisSession`, and `MAX_WARNINGS` are set but never read in active code — their only consumer was the commented-out `session_before_switch` handler, which predates this step. Additionally, the entire `session_before_switch` block (lines 100–119) is commented out. This dead code existed before Step 8 and falls outside its scope. TASK.md explicitly instructs "be conservative with removals" and defers remaining cleanup to Step 9.

## Medium Issues
- (none)

## Low Issues
- [LOW] Pre-existing dead code: `warnedOnce`, `warningsThisSession`, `MAX_WARNINGS` are assigned but never read in active code (`src/guards/validation.ts`, lines 26, 29, 32). The commented-out `session_before_switch` block (lines 100–119) references them. This predates Step 8; consider cleaning up in a future step. — `src/guards/validation.ts` (lines 26, 29, 32, 100–119)

## Test Coverage Analysis
Step 8 is a cleanup step — no new tests are required. Verification relies on:
- **Programmatic checks** (grep): All 5 checks pass — no frontmatter functions, no `js-yaml`, no tool registration, no `extractGoalName`, no production imports of removed function.
- **Export verification**: File exports exactly `ValidationRule` (re-export), `ValidationResult`, `validateOutputs`, `setupValidation`. Matches requirements (`ValidationResult` is retained as the return type of `validateOutputs`).
- **TypeScript compilation**: Only error is `extractGoalName` in test file — expected, handled by Step 9.
- **Existing tests**: 391 passed, 7 failed (all `extractGoalName`, exactly as predicted). No regressions in any other test file.
- **File protection tests**: `validateOutputs` (6/6 pass) and `setupValidation` (1/1 pass) confirm file protection functionality is intact.

## Gaps Identified
No gaps between TASK ↔ Implementation. The implementation faithfully executed the cleanup:
- Frontmatter functions removed ✓
- `js-yaml` import removed ✓
- Tool registration removed ✓
- `extractGoalName` removed ✓
- Unused module-level variables (`validationRules`, `baseDir`, `capabilityName`) removed ✓
- File protection handlers preserved unchanged ✓
- `validateOutputs` and `ValidationResult` retained (used by `session-capability.ts`) ✓

## Recommendations
N/A — implementation meets all acceptance criteria. Step 9 should proceed with test migration (removing `extractGoalName` tests from `validation.test.ts`).

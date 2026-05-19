# Summary: Slim down `validation.ts` — retain only file protection

## Status
COMPLETED

## Files Modified
- `src/guards/validation.ts` — Removed `extractGoalName` function, removed unused module-level variables (`validationRules`, `baseDir`, `capabilityName`) and their assignments in `resources_discover`. File now contains only: file protection event handlers (`tool_call` guard, `resources_discover` config loading, `turn_start` counter reset), `validateOutputs` utility, and `ValidationRule` type re-export.

## Files Created
- (none)

## Files Deleted
- (none)

## Decisions Made
- `ValidationResult` interface retained as it is the return type of `validateOutputs` (still exported and used by `session-capability.ts`).
- Unused module-level variables `validationRules`, `baseDir`, and `capabilityName` removed — they were only used by the commented-out `session_before_switch` handler and the removed `extractGoalName`/mark-complete tool.
- `extractGoalName` removed from `validation.ts` — no production code imports it (only the test file, which Step 9 will migrate). `state-machine.ts` has its own local `extractGoalName` and is unaffected.

## Test Coverage
- All programmatic verification checks pass:
  - No frontmatter functions (`parseReviewFrontmatter`, etc.) in file
  - No `js-yaml` import
  - No `defineTool`/`markCompleteTool`/`registerTool` calls
  - `extractGoalName` removed
  - No production code imports `extractGoalName` from validation.ts
  - Exports are correct: `ValidationRule`, `ValidationResult`, `validateOutputs`, `setupValidation`
- `validateOutputs` tests: 6/6 pass
- `setupValidation` tests: 1/1 pass
- `extractGoalName` tests: 7/7 fail (expected — function removed, tests to be migrated in Step 9)
- Full test suite: 391 passed, 7 failed (all extractGoalName, no other regressions)

# Summary: Complex merges — collocate multi-source and cross-cutting tests

## Status
COMPLETED

## Files Created
- `src/capability-config.test.ts` — merged from `__tests__/capability-config.test.ts`, `__tests__/types.test.ts`, `__tests__/session-capability.test.ts` (34 tests across 11 describe blocks)
- `src/fs-utils.test.ts` — merged from `__tests__/fs-utils.test.ts`, `__tests__/smoke.test.ts` (34 tests across 8 describe blocks, smoke block at bottom)
- `src/capabilities/execute-task.test.ts` — merged from `__tests__/execute-task-initial-message.test.ts` + isStepReady/stepFolderName from `__tests__/step-discovery.test.ts` (15 tests across 3 describe blocks)
- `src/capabilities/review-code.test.ts` — merged from `__tests__/review-code-config.test.ts` + isStepReviewable/findMostRecentCompletedStep from `__tests__/step-discovery.test.ts` (23 tests across 4 describe blocks)
- `src/capabilities/evolve-plan.test.ts` — relocated from `__tests__/evolve-plan.test.ts` with updated import paths (7 tests across 3 describe blocks)

## Files Modified
- `vitest.config.ts` — added `"src/**/*.test.ts"` to include patterns so vitest discovers collocated tests alongside the legacy `__tests__/` directory

## Files Deleted
- (none — original `__tests__/` files remain until Step 3)

## Decisions Made
- **Unified `createGoalTree` helpers:** Merged divergent `createGoalTree` signatures into a single options-based helper in both execute-task.test.ts and review-code.test.ts. The helper accepts `{ steps?: { number, files }[]; stepNumber?: number; rejected?: boolean }` to support both multi-step creation (from step-discovery) and single-step with rejected flag (from execute-task-initial-message).
- **Return type for `createGoalTree`:** Changed from returning `string` (goalDir only) to returning `{ goalDir, stepDir }`. Tests that don't need `stepDir` simply destructure and ignore it. This satisfies all callers uniformly.
- **Smoke tests placement:** Placed the smoke describe block at the bottom of fs-utils.test.ts as specified in TASK.md.
- **Vitest config update (early):** Added `"src/**/*.test.ts"` to vitest include patterns now rather than waiting for Step 3, because vitest v4 strictly enforces include patterns and individual file invocation (`vitest run <path>`) does not bypass them. This enables testing during the migration transition.
- **Import path correction:** TASK.md specified `../../fs-utils` and `../../guards/validation` from `src/capabilities/`, but the correct paths are `../fs-utils` and `../guards/validation` (one level up reaches `src/`). Fixed accordingly.

## Test Coverage
All 113 tests across 5 new files pass:
- `vitest run src/capability-config.test.ts` — 34 passed
- `vitest run src/fs-utils.test.ts` — 34 passed (includes smoke tests)
- `vitest run src/capabilities/execute-task.test.ts` — 15 passed
- `vitest run src/capabilities/review-code.test.ts` — 23 passed
- `vitest run src/capabilities/evolve-plan.test.ts` — 7 passed

Full suite (including original 14 `__tests__/` files): 19 files, 331 tests passed.
Type check: `npm run check` reports 0 errors.

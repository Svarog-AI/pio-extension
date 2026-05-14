# Summary: Delete old files + remove re-exports from `src/utils.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `__tests__/transition.test.ts` — redirected `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/smoke.test.ts` — redirected `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/execute-task-initial-message.test.ts` — redirected `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/review-code-config.test.ts` — redirected `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/evolve-plan.test.ts` — redirected `resolveCapabilityConfig` import from `../src/utils` → `../src/capability-config`, and `validateOutputs` import from `../src/capabilities/validation` → `../src/guards/validation`

## Files Deleted
- `src/utils.ts` — re-export shim no longer needed after all consumers migrated
- `src/capabilities/validation.ts` — stale copy; active version at `src/guards/validation.ts` (moved in Step 5)
- `src/capabilities/turn-guard.ts` — stale copy; active version at `src/guards/turn-guard.ts` (moved in Step 5)

## Decisions Made
- `stepFolderName` was redirected to `../src/fs-utils` (actual location), not `../src/transitions` as originally planned. The plan specified transitions, but the actual implementation placed `stepFolderName` in `fs-utils.ts`.
- `evolve-plan.test.ts`'s `validateOutputs` import (from `../src/capabilities/validation`) was also updated to `../src/guards/validation`, since deleting the old file would otherwise cause TypeScript errors. This overlaps with what Step 9 planned but is necessary for `npm run check` to pass.

## Test Coverage
- All programmatic verification checks from TEST.md pass:
  - File deletion checks: all 3 files confirmed deleted
  - Stale import grep: zero matches in `src/` and `__tests__/`
  - Test import verification: all 5 test files correctly import from new modules
  - TypeScript compilation (`npm run check`): zero errors
  - Full test suite: 14 test files, 218 tests — all pass

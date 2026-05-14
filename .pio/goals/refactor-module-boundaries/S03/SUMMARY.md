# Summary: Extract `src/fs-utils.ts` + update dependent tests

## Status
COMPLETED

## Files Created
- `src/fs-utils.ts` — new module containing filesystem path helpers, issue utilities, step folder naming (`stepFolderName`), step discovery, and session naming (8 exported functions)
- `__tests__/fs-utils.test.ts` — dedicated test file for fs-utils module (imports from `../src/fs-utils`), following the established pattern: `queues.test.ts` → `src/queues`, `transition.test.ts` → `src/transitions`

## Files Modified
- `src/transitions.ts` — changed `import { stepFolderName } from "./utils"` to `from "./fs-utils"` (dependency chain: `transitions.ts` → `fs-utils.ts`)
- `src/utils.ts` — removed original definitions of 8 functions, added re-exports from `./fs-utils`, added local imports for `resolveGoalDir` and `deriveSessionName` (used by `resolveCapabilityConfig`)
- `__tests__/step-discovery.test.ts` — changed `stepFolderName` import from `../src/utils` to `../src/fs-utils`

## Files Deleted
- `__tests__/utils.test.ts` — deleted (contents moved to `fs-utils.test.ts`, matching the convention that each extracted module has its own test file)

## Decisions Made
- `stepFolderName` lives in `fs-utils.ts` (not `transitions.ts` as PLAN.md originally stated). This means `transitions.ts` imports from `./fs-utils`, reversing the dependency direction described in PLAN.md. This was decided in Step 1 and confirmed by TASK.md.
- `utils.ts` keeps a local import of `resolveGoalDir` and `deriveSessionName` alongside the re-export, because `resolveCapabilityConfig` (still in utils.ts until Step 4) calls them directly — bare re-exports don't create local bindings in ESM.
- Created dedicated `fs-utils.test.ts` instead of leaving tests in `utils.test.ts`, following the established pattern (`queues.test.ts` → `src/queues`, `transition.test.ts` → `src/transitions`). Added 3 new tests for `issuesDir()` that were previously missing.

## Test Coverage
- All 32 tests in `fs-utils.test.ts` pass: resolveGoalDir (4), goalExists (3), issuesDir (3), findIssuePath (5), readIssue (3), deriveSessionName (5), stepFolderName (3), discoverNextStep (6)
- All 19 tests in `step-discovery.test.ts` pass (isStepReady: 6, isStepReviewable: 5, findMostRecentCompletedStep: 6, stepFolderName: 2)
- Full suite: 219 tests pass across 14 files — zero regressions
- `npm run check` reports zero TypeScript errors

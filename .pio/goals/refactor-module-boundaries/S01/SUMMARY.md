# Summary: Extract `src/transitions.ts` + update dependent tests

## Status
COMPLETED

## Files Created
- `src/transitions.ts` — New module containing the transition system extracted from `src/utils.ts`:
  - Types: `TransitionContext`, `TransitionResult`, `CapabilityTransitionResolver`
  - Data: `CAPABILITY_TRANSITIONS` (workflow state machine map)
  - Function: `resolveNextCapability()` (resolves next capability from transition map)
  - Temporary import: `stepFolderName` from `./utils` (will be updated to `./fs-utils` in Step 3)

## Files Modified
- `src/utils.ts` — Removed transition system definitions (types + `CAPABILITY_TRANSITIONS` + `resolveNextCapability`). Added re-exports from `./transitions` for backward compatibility during migration. `stepFolderName()` remains defined in-place until Step 3.
- `__tests__/transition.test.ts` — Split import: transition symbols (`CAPABILITY_TRANSITIONS`, `resolveNextCapability`, `TransitionContext`) now imported from `../src/transitions`; `stepFolderName` stays imported from `../src/utils` (used by `createGoalTree` helper).

## Files Deleted
- (none)

## Decisions Made
- **Exact copy extraction:** Transition logic copied verbatim from `src/utils.ts` — no behavioral changes, purely structural.
- **Temporary import from utils:** `transitions.ts` imports `stepFolderName` from `./utils` because the `review-code` resolver inside `CAPABILITY_TRANSITIONS` needs it. This creates a known dependency that Step 3 resolves when `stepFolderName` moves to `fs-utils.ts`.
- **Re-export pattern:** Used `export { } from "./transitions"` (not separate import + export) to avoid duplicating bindings in `utils.ts`.
- **Test import split:** `transition.test.ts` now imports from two modules — proves the cross-module dependency works correctly.

## Test Coverage
- All 25 transition tests pass (`npm test __tests__/transition.test.ts`)
- All 2 smoke tests pass (`npm test __tests__/smoke.test.ts`)
- All 19 execute-task/review-code tests pass (unchanged imports)
- Full suite: 216 tests across 13 files pass — zero regressions
- `npm run check` (TypeScript type check): zero errors

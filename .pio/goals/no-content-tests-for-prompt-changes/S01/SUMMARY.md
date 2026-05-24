# Summary: Remove content-based tests from all affected files

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/create-goal.test.ts` — Removed 2 `describe` blocks: `CAPABILITY_CONFIG.defaultInitialMessage` (5 tests) and `prompts/create-goal.md` (5 tests + 2 helper functions). Cleaned up unused imports: `CAPABILITY_CONFIG`, `fileURLToPath`, `__filename`, `__dirname`.
- `src/capabilities/evolve-plan.test.ts` — Removed 1 `describe` block: `defaultInitialMessage` (1 test). Cleaned up unused import: `CAPABILITY_CONFIG`.
- `src/capabilities/execute-task.test.ts` — Removed 1 `describe` block: `defaultInitialMessage — rejection feedback channel` (8 tests). Cleaned up unused import: `import { CAPABILITY_CONFIG } from "./execute-task"`.
- `src/capabilities/finalize-goal.test.ts` — Removed 1 `describe` block: `CAPABILITY_CONFIG.defaultInitialMessage` (7 tests). No import cleanup needed (CAPABILITY_CONFIG still used by structure tests).
- `src/capabilities/project-context.test.ts` — Removed 1 `describe` block: `CAPABILITY_CONFIG.defaultInitialMessage` (3 tests). No import cleanup needed (CAPABILITY_CONFIG still used by writeAllowlist tests).

## Files Deleted
- (none)

## Decisions Made
- Rewrote `create-goal.test.ts` entirely rather than using multiple edits, since two large blocks at the top and bottom needed removal along with import cleanup. This produced a cleaner file.
- Used targeted `edit` calls for the other 4 files since the blocks to remove were self-contained in the middle of each file.

## Test Coverage
- 29 content-based tests removed across 5 files (696 → 667 remaining tests).
- All 667 remaining behavioral tests pass: `npx vitest run` exits cleanly.
- TypeScript compilation passes: `npx tsc --noEmit` reports no errors.
- All behavioral `describe` blocks verified intact: prepareGoal, goalExists, resolveGoalDir, validateOutputs, resolveEvolveWriteAllowlist, validateAndFindNextStep, isStepReady, stepFolderName, resolveExecuteReadOnlyFiles, CAPABILITY_CONFIG structure, writeAllowlist, setupFinalizeGoal, validateFinalizeGoal, finalizeGoalTool.execute, handleFinalizeGoal, setupProjectContext.

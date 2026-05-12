# Summary: Test workflow transitions (`transition.test.ts`)

## Status
COMPLETED

## Files Created
- `__tests__/transition.test.ts` — 22 tests covering all six capability transitions, param propagation, conditional approval/rejection branching, and TransitionResult shape consistency

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Used real temp directories (`fs.mkdtempSync`) for filesystem-dependent review-code approval/rejection tests, following the established pattern from `step-discovery.test.ts` and TDD guidelines (prefer real implementations over mocks).
- Organized tests into logical `describe` blocks matching each of the six transitions plus unknown-capability fallback and shape consistency checks.
- Followed Arrange-Act-Assert pattern throughout for readability as specification.
- Added immutability check to verify `resolveNextCapability` does not mutate original `ctx.params` during stepNumber increment.

## Test Coverage
- **CAPABILITY_TRANSITIONS structure** (5 tests): Verified all six capabilities are mapped correctly — two string transitions (create-goal, create-plan) and three callback transitions (evolve-plan, execute-task, review-code).
- **create-goal → create-plan** (2 tests): Deterministic string transition with params preserved, including undefined params edge case.
- **create-plan → evolve-plan** (1 test): Deterministic string transition with params preserved.
- **evolve-plan → execute-task** (3 tests): Callback transition with stepNumber present (TransitionResult), missing stepNumber (plain wrap), and no params at all.
- **execute-task → review-code** (2 tests): Callback transition with stepNumber present and missing.
- **review-code approval path** (2 tests): APPROVED file on disk → evolve-plan with incremented stepNumber; goalName preserved correctly.
- **review-code rejection path** (2 tests): No APPROVED file → execute-task with same stepNumber; no stepNumber → plain string fallback.
- **Unknown capabilities** (2 tests): Returns undefined for nonexistent and empty-string capability names.
- **TransitionResult shape consistency** (3 tests): String transitions wrap in `{capability, params}`, callback results pass through unchanged, and original params are not mutated.

## Verification Results
- `npm test __tests__/transition.test.ts`: 22/22 passed ✅
- `npm test` (full suite): 122/122 passed (6 files) ✅
- `npm run check`: No type errors ✅

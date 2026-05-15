# Summary: Update evolve-plan capability config for DECISIONS.md

## Status
COMPLETED

## Files Created
- (none — no new files created)

## Files Modified
- `src/capabilities/evolve-plan.ts` — Added `DECISIONS_FILE = "DECISIONS.md"` constant; updated `resolveEvolveValidation` to conditionally include `S{NN}/DECISIONS.md` for step > 1; updated `resolveEvolveWriteAllowlist` to conditionally include `S{NN}/DECISIONS.md` for step > 1
- `src/capabilities/evolve-plan.test.ts` — Added 5 new tests (2 describe blocks) verifying DECISIONS.md is excluded for stepNumber=1 and included for stepNumber>=2 in both validation files and write allowlist

## Files Deleted
- (none)

## Decisions Made
- Used optional chaining (`result?.validation?.files`, `result?.writeAllowlist`) in test assertions to satisfy TypeScript's strict null checks on the optional `CapabilityConfig` properties, rather than non-null assertions
- Followed the existing conditional branching pattern in both callbacks: append DECISIONS.md at the end of the array when `stepNumber > 1`, keeping it additive and preserving file order for error messages

## Test Coverage
- **resolveEvolveValidation with DECISIONS_FILE** (3 tests): Verifies step 1 produces only `[TASK.md, TEST.md]`, while steps 2+ produce `[TASK.md, TEST.md, DECISIONS.md]`
- **resolveEvolveWriteAllowlist with DECISIONS_FILE** (2 tests): Verifies step 1 exclude DECISIONS.md, while step 2 includes all 4 entries (`COMPLETED`, `TASK.md`, `TEST.md`, `DECISIONS.md`)
- All 269 tests pass (264 existing + 5 new), zero regressions
- `npm run check` (tsc --noEmit) reports no TypeScript errors

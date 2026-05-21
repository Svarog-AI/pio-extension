# Summary: Integrate evolve-plan marker writing

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/evolve-plan.ts` — exported `REVISE_PLAN_MARKER` constant (was `const`, now `export const`) to enable cross-module verification in tests
- `src/capabilities/revise-plan.ts` — exported `REVISE_PLAN_MARKER` constant (was `const`, now `export const`) to enable cross-module verification in tests
- `src/capabilities/evolve-plan.test.ts` — fixed two review issues:
  - **CRITICAL fix:** Replaced overbroad `.includes("S1/REVISE")` negative assertion with precise `.not.toContain("S1/REVISE_PLAN_NEEDED")` in the zero-padding test. The old assertion matched paths like `"S12/..."`, `"S10/..."` etc., creating a logically contradictory test for step 12.
  - **HIGH fix:** Replaced unused `CAPABILITY_CONFIG` import with actual `REVISE_PLAN_MARKER` import from `./revise-plan`. The test now cross-checks the basename against the imported constant value instead of repeating a hardcoded string comparison.

## Files Deleted
- (none)

## Decisions Made
- Exported `REVISE_PLAN_MARKER` from both `evolve-plan.ts` and `revise-plan.ts` to enable real cross-module consistency verification. This addresses the reviewer's recommendation to make consistency verifiable by importing actual values rather than relying on hardcoded strings.

## Test Coverage
- All 19 tests in `evolve-plan.test.ts` pass, including:
  - `includes S01/REVISE_PLAN_NEEDED in write allowlist for stepNumber=1` — verifies marker for step 1
  - `includes S03/REVISE_PLAN_NEEDED in write allowlist for stepNumber=3` — verifies marker for step 3
  - `marker path uses correct step folder naming (zero-padded)` — verifies correct zero-padding with precise negative assertion (fixed)
  - `marker filename in evolve-plan writeAllowlist matches revise-plan constant` — cross-checks against imported `REVISE_PLAN_MARKER` from revise-plan (fixed)
  - DECISIONS.md inclusion/exclusion tests — correctly account for REVISE_PLAN_NEEDED in allowlist length
- TypeScript compilation (`npx tsc --noEmit`) passes with no errors
- All programmatic verification checks from TEST.md pass

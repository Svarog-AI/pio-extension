# Task: Update remaining test file imports + verify with `evolve-plan.test.ts`

Verify that `evolve-plan.test.ts` imports point to the correct new module locations after the Step 8 refactor (file deletions + test import cleanup). Confirm type checking passes.

## Context

Step 8 deleted `src/utils.ts`, `src/capabilities/validation.ts`, and `src/capabilities/turn-guard.ts`. As part of that deletion, test file imports were redirected to new module locations. Step 9 isolates the `evolve-plan.test.ts` verification as a focused gate: this is the only remaining test file that imports from both a guard module (`validateOutputs`) and a decomposed utility module (`resolveCapabilityConfig`), making it a meaningful integration-level smoke check for the refactored import graph.

## What to Build

No new code. This step verifies that:

1. `evolve-plan.test.ts` imports are correctly pointing to new module locations
2. The file compiles with zero TypeScript errors

### Verification Targets

- `validateOutputs` imported from `../src/guards/validation` (was `../src/capabilities/validation`)
- `resolveCapabilityConfig` imported from `../src/capability-config` (was `../src/utils`)
- No remaining imports reference deleted paths (`../src/utils`, `../src/capabilities/validation`)

### Approach and Decisions

- Read `evolve-plan.test.ts` to confirm import paths
- Run `npm run check` to validate zero TypeScript errors
- If any import is incorrect, update it; otherwise the step is complete

## Dependencies

- Step 8 must be completed (old files deleted, test imports redirected)

## Files Affected

- `__tests__/evolve-plan.test.ts` — verified: imports point to correct new locations

## Acceptance Criteria

- [ ] `evolve-plan.test.ts` imports `validateOutputs` from `../src/guards/validation` (was `../src/capabilities/validation`)
- [ ] `evolve-plan.test.ts` imports `resolveCapabilityConfig` from `../src/capability-config` (was `../src/utils`)
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Already completed during Step 8:** The actual import changes may have been done as part of Step 8's broader test-file cleanup. In this case, Step 9 is purely verification — confirm the state is correct and type-check passes.
- **No behavioral changes expected:** Any runtime behavior change would indicate a missing import migration in earlier steps.

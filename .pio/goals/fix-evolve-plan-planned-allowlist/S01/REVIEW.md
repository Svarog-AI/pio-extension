# Code Review: Fix evolve-plan COMPLETED marker — detection, validation, allowlist, and prompt (Step 1)

## Decision
APPROVED

## Summary
The implementation correctly addresses all four changes specified in TASK.md: the pre-launch guard prevents relaunching when COMPLETED exists, the write allowlist always includes "COMPLETED", validation short-circuits on COMPLETED at baseDir, and PLANNED has been renamed to COMPLETED in the prompt. All 129 tests pass (including 7 new ones), TypeScript compilation is clean, and no regressions were introduced. The implementation takes a simpler approach than PLAN.md originally specified — relying on control-flow guards rather than threading an `allStepsComplete` flag through callbacks — which is sound because the guard ensures callbacks are never called in the problematic scenario.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- **Callback error handling when stepNumber is null.** `resolveEvolveValidation`, `resolveEvolveWriteAllowlist`, and `defaultInitialMessage` all throw if `stepNumber` is absent (`evolve-plan.ts`, lines 23, 30, 40). SUMMARY.md claims these were "updated to handle the all-steps-complete case gracefully" and "return COMPLETED-only config instead of throwing", but they still throw. In practice this is unreachable — `validateAndFindNextStep` guards against it by returning `{ ready: false }` when COMPLETED exists, so `resolveCapabilityConfig` is never called without stepNumber. However, the callbacks lack defensive handling for an edge case that could surface if someone calls them directly or modifies the guard logic later. Consider adding a null check that returns sensible defaults rather than throwing.

## Low Issues
- **SUMMARY.md accuracy.** SUMMARY.md states: "updated `resolveEvolveValidation` to return `{ files: ["COMPLETED"] }` when no stepNumber is provided" and "updated `defaultInitialMessage` to handle the all-steps-complete case gracefully". The actual implementation still throws in these cases. The decision works correctly due to control-flow guards, but the summary doesn't accurately reflect what was done vs. what was planned.

## Test Coverage Analysis
All 7 acceptance criteria from TASK.md are covered:

| Acceptance Criterion | Covered By |
|---|---|
| `npm run check` reports no TypeScript errors | Programmatic verification — passes cleanly |
| `npm test` passes all existing tests | Vitest runs 129 tests across 7 files — all pass |
| COMPLETED pre-launch guard shows error, doesn't launch | Test: "returns ready:false when COMPLETED exists at goal root" |
| Write allowlist always includes "COMPLETED" | Test: "always includes COMPLETED alongside step-folder paths"; grep verification |
| Validation short-circuits on COMPLETED at baseDir | 4 tests covering pass/fail/edge-case scenarios |
| Normal flow unaffected (valid step exists) | Test: "returns ready:true when COMPLETED does not exist" — validates normal path proceeds with stepNumber=1 |
| No PLANNED references remain in prompt | grep verification — exit code 1 (no matches) |

Test coverage is comprehensive. The tests follow project conventions (Vitest, `fs.mkdtempSync`, DAMP descriptions). Edge cases like subfolder COMPLETED not triggering the short-circuit are explicitly tested.

## Gaps Identified
- **PLAN.md vs. actual approach:** PLAN.md described host-side PLAN.md parsing and threading an `allStepsComplete` flag through params to make callbacks conditional. TASK.md simplified this to "no host-side PLAN.md parsing" with control-flow guards. The implementation follows TASK.md correctly, but the gap between PLAN and implementation is worth noting — the simpler approach is valid but represents a scope change from the original plan.

## Recommendations
N/A — approved as-is. If revisiting in a future refactor, consider making the callback functions defensive against missing stepNumber for robustness.

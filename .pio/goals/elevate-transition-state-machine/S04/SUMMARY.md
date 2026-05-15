# Summary: Decouple `validation.ts` from `session-capability.ts`

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/guards/validation.ts` — Removed dependency on `session-capability.ts`:
  - Deleted import of `getSessionParams, getStepNumber` from `../capabilities/session-capability`
  - Replaced `getSessionParams()` with `config.sessionParams || {}` (direct use of completing session's params)
  - Replaced `getStepNumber()` in review-code automation with local derivation: `config.sessionParams?.stepNumber` or `createGoalState(dir).currentStepNumber()`
  - Replaced `getStepNumber()` in mark-complete flow with local derivation: `sessionParams.stepNumber` or `state.currentStepNumber()`

## Files Deleted
- (none)

## Decisions Made
- **No new exports or module-level state added.** The task is purely dependency removal — validation.ts now derives all values locally from `config.sessionParams` and `createGoalState(dir)`.
- **`config.sessionParams` is authoritative.** It contains the params passed when the capability sub-session was created — identical to what `enrichedSessionParams` in session-capability derives from.
- **Fallback to `state.currentStepNumber()` is safe.** Matches original `getStepNumber()` fallback behavior (auto-discovery via filesystem scan).
- **Reused existing `createGoalState(dir)` call** for the mark-complete flow instead of creating a second instance.

## Test Coverage
- All 264 existing tests pass unchanged across 11 test files (regression coverage)
- `src/guards/validation.test.ts` exercises: `validateOutputs`, `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`, and the full review-code markComplete automation flow
- Behavioral equivalence proven by unchanged test results

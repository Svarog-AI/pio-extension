# Summary: Update tests to verify transition params and initial message

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/state-machine.test.ts` — Added integration test "review→evolve→finalize chain" verifying the full two-step transition: review-task approval → evolve-plan → finalize-goal with correct params (`goalName`, `goalDir`, `workingDir`)
- `src/capabilities/finalize-goal.test.ts` — Enhanced "gracefully handles missing goalName" test to assert fallback phrasing contains `"goal workspace"`
- `src/capability-config.test.ts` — Added two integration tests: (1) auto-transition params resolve `workingDir` to project root, (2) auto-transition params produce initial message containing goal name

## Files Deleted
- (none)

## Decisions Made
- **No behavioral code changes required:** Steps 1–3 already implemented all fixes. Step 4 verified existing test coverage and filled gaps.
- **Integration tests use real implementations:** Per TDD skill guidelines, the new `capability-config.test.ts` integration tests call the real `resolveCapabilityConfig()` with simulated state machine output params — no mocks.
- **Chain test verifies two transitions:** The new `state-machine.test.ts` test exercises both `resolveTransition("review-task", ...)` and `resolveTransition("evolve-plan", ...)` in sequence to prove the review→evolve→finalize flow is wired correctly.

## Test Coverage
- **Total tests:** 492 (up from 489, +3 new tests)
- **state-machine.test.ts:** 39 tests (up from 38, +1 chain integration test)
  - New: "review-task approval leads to evolve-plan which routes to finalize-goal when complete"
  - Existing: 6 completion detection tests asserting `goalName`, `goalDir`, `workingDir`
- **finalize-goal.test.ts:** 30 tests (unchanged count, +1 assertion in existing test)
  - Enhanced: "gracefully handles missing goalName" now asserts `"goal workspace"` fallback
  - Existing: 4 `defaultInitialMessage` tests including goal name inclusion
- **capability-config.test.ts:** 58 tests (up from 56, +2 integration tests)
  - New: "finalize-goal auto-transition params resolve workingDir to project root"
  - New: "finalize-goal initial message includes goal name via auto-transition params"
  - Existing: 4 explicit `workingDir` override tests (precedence, fallback, empty string)
- **Programmatic verification:** All grep counts exceed thresholds (`goalDir/workingDir`: 15≥4, `goalName`: 10≥2, `workingDir`: 31≥4)
- **Type checking:** `npm run check` passes with no errors

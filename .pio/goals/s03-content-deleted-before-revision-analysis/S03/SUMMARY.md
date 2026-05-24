# Summary: Integration verification — full revise-plan lifecycle

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/revise-plan.test.ts` — Added 3 new tests in `CAPABILITY_CONFIG wiring consistency` describe block:
  - `all lifecycle hooks point to the correct exported functions` — verifies `prepareSession` and `postExecute` reference the correct exported functions
  - `readOnlyFiles is a function callback` — verifies `readOnlyFiles` is a function
  - `writeAllowlist resolves to include PLAN.md` — verifies `writeAllowlist` resolves to a list containing `PLAN.md`

## Files Deleted
- (none)

## Decisions Made
- Added new `describe("CAPABILITY_CONFIG wiring consistency")` block to consolidate config wiring assertions into a focused integration test group.
- Used type-safe handling for `writeAllowlist` (can be function or static array per `StaticCapabilityConfig` type).
- Omitted tests asserting on string content of `defaultInitialMessage` output per project conventions.

## Test Coverage
- **Existing end-to-end lifecycle test** (`end-to-end lifecycle: prepareSession then cleanupIncompleteSteps`) — passes, covers full split workflow with mixed approved/non-approved steps and trigger step marker.
- **New CAPABILITY_CONFIG wiring tests** — verify `postExecute` is `cleanupIncompleteSteps`, `prepareSession` is the exported function, `readOnlyFiles` is a callback, and `writeAllowlist` includes `PLAN.md`.
- **Full test suite** — 696 tests pass across 23 files (added 3 new).
- **TypeScript compilation** — `npx tsc --noEmit` exits with code 0.
- **Prompt file verification** — Step 3 mentions preserved incomplete step folders with `TASK.md`, `DECISIONS.md`, `REVISE_PLAN_NEEDED` references. Step 4 includes trigger step folder research instruction.

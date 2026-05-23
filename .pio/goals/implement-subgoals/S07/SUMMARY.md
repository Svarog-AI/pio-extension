# Summary: Create-plan validation and list-goals recursion

## Status
COMPLETED

## Files Created
- `src/capabilities/list-goals.test.ts` — Unit tests for `findSubgoals`, `inferPhase`, and `readLastTask` (12 tests)

## Files Modified
- `src/capabilities/create-plan.ts` — Added Step 6 in `postValidateCreatePlan`: validates that subgoal entries (`complexity: "subgoal"`) have unique `name` values. Returns descriptive error listing duplicate names.
- `src/capabilities/create-plan.test.ts` — Added test suite for unique subgoal name validation (5 tests). Removed 4 meaningless `STEP_HEADING_RE` tests that defined local regex copies instead of testing the real constant (addressed critical review issue).
- `src/capabilities/list-goals.ts` — Exported `inferPhase` and `readLastTask` for testability. Added `findSubgoals()` recursive helper. Updated `handleListGoals` to discover and display nested subgoals with hierarchical names.

## Files Deleted
- (none)

## Decisions Made
- **Duplicate detection algorithm:** Linear scan with `Set` deduplication — sufficient for small step counts (< 20). Collects all duplicates (not just the first) for the error message.
- **Cross-type duplicates allowed:** A subgoal and a regular task can share the same name — only subgoal-to-subgoal duplicates are rejected, since only subgoals create disk directories.
- **`findSubgoals` signature:** Takes `(goalDir, parentDisplayName)` and returns `Array<{ dir, displayName }>`. Recursive — each level appends `/S{NN}/<name>` to the display name prefix.
- **Error handling in `findSubgoals`:** Silently skips unreadable directories (empty `subgoals/` dirs, permission errors) — matches the existing `handleListGoals` pattern of not crashing on filesystem edge cases.
- **`STEP_HEADING_RE` unchanged:** Verified by inspection — regex remains `/^## Step \d+:/gm`. Removed meaningless tests that defined local copies (per review feedback).

## Test Coverage
- **17 new tests** (net from previous implementation):
  - 5 tests for unique subgoal name validation in `create-plan.test.ts`
  - 6 tests for `findSubgoals` recursive discovery in `list-goals.test.ts`
  - 4 tests for `inferPhase` in `list-goals.test.ts`
  - 2 tests for `readLastTask` in `list-goals.test.ts`
- **4 tests removed:** Meaningless `STEP_HEADING_RE` tests that tested local regex copies against themselves (critical review issue)
- All 635 tests pass with no regressions
- `npx tsc --noEmit` reports no errors

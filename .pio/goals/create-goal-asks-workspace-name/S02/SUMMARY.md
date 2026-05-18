# Summary: Update create-goal prompt to remove "ask for workspace name" instructions

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/create-goal.test.ts` — Removed unused `extractSection()` helper function (dead code). This was the HIGH issue identified in the review: the function was defined but never called, having been superseded by `extractSetupSection()` and `extractStep1Section()`.

## Files Deleted
- (none)

## Decisions Made
- Removed the generic `extractSection()` function entirely rather than attempting to find a use for it. The two specific helpers (`extractSetupSection`, `extractStep1Section`) are more readable and follow the DAMP (Descriptive And Meaningful Phrases) principle for tests.

## Test Coverage
- All 327 tests pass (no regressions)
- 5 prompt content verification tests pass:
  - `does not instruct to always confirm the goal name` — `/always\s*confirm/i` does not match
  - `does not instruct to ask about workspace name` — no affirmative ask/confirm patterns found
  - `Setup section states goal name is provided` — `/goal.?name.*provided/i` matches
  - `Setup section instructs not to ask for goal name` — `/do\s+not.*ask.*goal|do\s+not.*ask.*workspace/i` matches
  - `Step 1 still asks about purpose, scope, requirements` — `/problem|opportunity|purpose|requirement/i` matches
- `npm run check` (tsc --noEmit) passes with no errors
- Programmatic verification: `grep -ic "always.confirm"` returns 0, Setup section count is 1, all 5 Step headings present, GOAL.md template sections present

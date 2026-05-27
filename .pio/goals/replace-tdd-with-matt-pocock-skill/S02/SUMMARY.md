# Summary: Refactor execute-task prompt for WHAT/HOW split

## Status
COMPLETED

## Files Created
- `.pio/goals/replace-tdd-with-matt-pocock-skill/S02/TEST.md` — test specification with programmatic verification cases

## Files Modified
- `src/prompts/execute-task.md` — refactored Step 5 bullet 3: removed specific TDD pattern names (RED → GREEN → REFACTOR cycle, Arrange-Act-Assert, DAMP over DRY, one assertion per concept), replaced with a reference to the mandatory `tdd` skill as the source of methodology guidance

## Files Deleted
- (none)

## Decisions Made
- Replaced HOW-level pattern prescription with a single sentence delegating to the `tdd` skill: "Follow the mandatory `tdd` skill for test structure guidance — it covers test-first workflows, behavior verification, and the patterns you should use."
- Preserved bullet 4 ("Verify tests fail initially") as it describes WHAT (a verification step), not HOW.
- Modified only bullet 3 of Step 5 — all other bullets and sections left untouched.

## User-Requested Changes
- (none)

## Test Coverage
- All acceptance criteria verified programmatically:
  - `grep -c "Arrange-Act-Assert" execute-task.md` → 0
  - `grep -c "DAMP" execute-task.md` → 0
  - `grep -cE "RED.*GREEN|RED→GREEN" execute-task.md` → 0
  - `grep -c "one assertion per concept" execute-task.md` → 0
  - `grep "tdd.*skill" execute-task.md` → confirms skill reference present
  - Bullets 1, 2, 4 of Step 5 verified preserved
  - `npm run check` (`tsc --noEmit`) → exits 0
  - `npx vitest run` → 746 tests pass

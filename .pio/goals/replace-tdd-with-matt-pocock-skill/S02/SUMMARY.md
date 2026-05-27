# Summary: Restructure execute-task and review-task prompts for iterative TDD with post-hoc TEST.md

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-task.md` — Tightened Step 4 and Guidelines section to reference the `tdd` skill tersely without restating its incremental loop rules (addressed LOW review issue). Step 4 now reads: "Apply the `tdd` skill for the iterative development cycle (tracer bullet → incremental RED→GREEN → refactor). The skill contains all methodology details." Guidelines now reads: "Follow the `tdd` skill for methodology. Use its iterative workflow — no upfront test planning."

## Files Deleted
- (none)

## Decisions Made
- Step 4 and Guidelines in `execute-task.md` were tightened to avoid duplicating `tdd` skill HOW details (tracer bullet mechanics, incremental loop rules). The prompt now references the skill tersely and focuses on WHAT to do (follow the skill, create TEST.md post-hoc).

## User-Requested Changes
- (none)

## Test Coverage
- 750 tests pass with exit code 0
- `npm run check` (tsc --noEmit) reports no errors
- All acceptance criteria from TASK.md verified:
  - `execute-task.md` contains no Step 4 about creating TEST.md upfront
  - Step 4 references `tdd` skill for methodology without restating HOW details
  - TEST.md creation instructed as post-hoc summary record
  - Step numbering is sequential 1–8 with no gaps
  - All internal step references updated
  - `defaultInitialMessage` is a simple task directive
  - `review-task.md` references TEST.md as test record

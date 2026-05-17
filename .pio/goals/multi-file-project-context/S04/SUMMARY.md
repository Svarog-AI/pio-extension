# Summary: Update other prompt references to the new paths

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/create-plan.md` — Changed `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md` (1 occurrence, line 28). Planning agents now reference the correct overview file.
- `src/prompts/execute-task.md` — Changed `.pio/PROJECT.md` to `.pio/PROJECT/DEVELOPMENT.md` (3 occurrences, lines 61, 62, 68). Execution agents now reference DEVELOPMENT.md for test directory conventions and test runner info.
- `src/prompts/evolve-plan.md` — Changed `.pio/PROJECT.md` to `.pio/PROJECT/DEVELOPMENT.md` (2 occurrences, lines 147, 148). Specification agents now reference DEVELOPMENT.md for test directory conventions.

## Files Deleted
- (none)

## Decisions Made
- Minimal surgical edits: replaced only the path string, preserving all surrounding formatting, bold text, backtick code spans, and sentence structure.
- Followed the Prompt Reference Mapping from DECISIONS.md: planning agents → OVERVIEW.md, execution/specification agents → DEVELOPMENT.md for test conventions.

## Test Coverage
- Programmatic verification via `grep`:
  - `create-plan.md` has exactly 1 reference to `.pio/PROJECT/OVERVIEW.md` ✓
  - `execute-task.md` has exactly 3 references to `.pio/PROJECT/DEVELOPMENT.md` ✓
  - `evolve-plan.md` has exactly 2 references to `.pio/PROJECT/DEVELOPMENT.md` ✓
  - 0 stale references to `.pio/PROJECT.md` remain in `src/prompts/` ✓
  - `project-context.md` was not accidentally modified ✓
- TypeScript compilation (`npm run check`) passes with exit code 0 ✓
- Manual inspection confirms all replaced paths read naturally in context ✓

# Summary: Rewrite project-context.md prompt for 7-file output

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/project-context.md` — Complete rewrite for multi-file output. Replaced single `.pio/PROJECT.md` target with 7 specialized files under `.pio/PROJECT/`. Restructured Phase 2 (Summarization) to map questions to output files. Rewrote Phase 4 (Write) with templates for each of the 7 files. Added cross-service dependency and domain terminology discovery to Phase 1. Preserved Phase 1 (Analysis), Phase 3 (Clarification), and Phase 5 (Signal Completion) structure.

## Files Deleted
- (none)

## Decisions Made
- Preserved the 5-phase flow and guideline style from the original prompt for familiarity
- Each output file section in Phase 4 includes a markdown template with expected headings
- Added explicit guidance: skip `GIT.md` for non-git repos, `GLOSSARY.md` may be minimal, write "No significant findings" rather than empty files
- Token limit of ~2000 tokens (~1500 words) per file mentioned in Phase 4 intro and Guidelines
- Removed all references to the old single-file `.pio/PROJECT.md` path

## Test Coverage
- All 7 output file paths present in prompt (3 occurrences each) — verified via `grep`
- Old single-file path `.pio/PROJECT.md` absent from prompt — verified via `grep` (0 matches)
- 5 phase headings present (Analysis, Summarization, Clarification, Write Output Files, Signal Completion) — verified via `grep`
- Token limit guidance included (~2000 tokens mentioned 3 times) — verified via `grep`
- Skip/minimize guidance included (3 matches for skip/non-git/minimal) — verified via `grep`
- Filename unchanged at `src/prompts/project-context.md` — verified via `test -f`
- TypeScript compilation clean (`npm run check` / `tsc --noEmit`) — exit code 0

# Summary: Update execute-task prompt to prioritize TASK.md skill recommendations

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-task.md` — added a paragraph after the `test-driven-development` reference instructing the executor to check `TASK.md`'s `## Skills` section as a primary signal when loading skills

## Files Deleted
- (none)

## Decisions Made
- Placed the new paragraph immediately after the existing `test-driven-development` reference (before `## Setup`) to keep skill-loading context together in the introductory section
- Used "complements, rather than replaces" language to clarify the relationship with `_skill-loading.md`
- Added explicit handling for the "No additional skills recommended beyond the mandatory pio skill" fallback phrase so the agent doesn't error on it
- No unit tests written per the `test-driven-development` skill guidance — content-based tests for prompt files are not recommended

## User-Requested Changes
- (none)

## Test Coverage
- This is a prompt-only change (markdown file). Per the `test-driven-development` skill, content-based tests for prompt files break on rewording without indicating behavioral regression. All acceptance criteria verified programmatically:
  - `grep` confirms `## Skills` reference exists in the file
  - `grep` confirms existing `test-driven-development` references are preserved
  - `grep` confirms existing `pio-git` references are preserved
  - `grep` confirms "complements, rather than replaces" language is present
  - `npm run check` (tsc --noEmit) passes with exit code 0
  - `npm test` passes (633/633 tests in non-session-guard files; 4 pre-existing failures in session-guard.test.ts are unrelated)

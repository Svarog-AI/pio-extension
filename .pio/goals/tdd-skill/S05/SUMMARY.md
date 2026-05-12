# Summary: Update `evolve-plan.md` with TDD skill reference

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/evolve-plan.md` — Added a brief "**TDD skill guidance:**" paragraph inside Step 6 (Write TEST.md), referencing the `test-driven-development` skill and its key principles for test specification writing

## Files Deleted
- (none)

## Decisions Made
- Placed the reference inside Step 6 (after the introductory sentence, before the "Structure:" label) so it's visible exactly when agents are about to write TEST.md
- Used a bold "**TDD skill guidance:**" lead-in to match the callout style of other sections in the prompt
- Kept the reference to a single paragraph (~4 sentences) — lighter than the execute-task.md reference since evolve-plan generates specs, not code
- Referenced four principles most relevant to test specification: Arrange-Act-Assert, DAMP over DRY, one assertion per concept, test pyramid sizing

## Test Coverage
- `grep -c 'test-driven-development' src/prompts/evolve-plan.md` → returns `1` (exactly one reference)
- Skill reference at line 126 is within the Step 6 section (line 122) — proximity confirmed
- All four TDD principles (Arrange-Act-Assert, DAMP, one assertion per concept, test pyramid) are present in the text
- Diff shows 6 added lines, 0 deletions of substantive content
- `npm run check` (`tsc --noEmit`) passes with no errors

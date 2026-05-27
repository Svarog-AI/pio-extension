# Summary: Rename all references to the new skill name

## Status
COMPLETED

## Files Created
- `.pio/goals/replace-tdd-with-matt-pocock-skill/S01/TEST.md` — test specification
- `.pio/goals/replace-tdd-with-matt-pocock-skill/S01/COMPLETED` — completion marker

## Files Modified
- `src/capabilities/execute-task.ts` — `"test-driven-development"` → `"tdd"` in `skills.mandatory`
- `src/capabilities/review-task.ts` — `"test-driven-development"` → `"tdd"` in `skills.mandatory`
- `src/capabilities/execute-plan.ts` — `"test-driven-development"` → `"tdd"` in `skills.mandatory`
- `src/capabilities/test-skills-cap.ts` — `"test-driven-development"` → `"tdd"` in `skills.mandatory`
- `src/prompts/evolve-plan.md` — renamed skill name in 2 example occurrences (description + frontmatter template)
- `src/prompts/execute-task.md` — renamed skill name reference only (line 92), surrounding TDD content untouched
- `src/index.test.ts` — discovery assertion: `toContain("tdd")`
- `src/frontmatter-schemas.test.ts` — test data frontmatter and assertion strings (2 occurrences)
- `src/types.test.ts` — test data and assertion strings (4 occurrences across 2 tests)
- `src/capability-config.test.ts` — expected skill name assertion
- `src/fs-utils.test.ts` — base capability skills array and assertion (2 occurrences)

## Files Deleted
- (none)

## Decisions Made
- Pure string replacement — no logic changes, no refactoring beyond the skill name string itself
- Left `src/skills/test-driven-development/` directory intact (deletion is Step 3)
- Left surrounding TDD methodology content in `execute-task.md` untouched (refactoring is Step 2)

## User-Requested Changes
- (none)

## Test Coverage
- All 746 existing tests pass after fixture data updates
- `npm run check` (tsc --noEmit) reports no errors
- `grep -rn "test-driven-development" src/` returns only the old skill directory itself

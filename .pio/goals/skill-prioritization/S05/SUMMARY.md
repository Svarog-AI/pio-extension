# Summary: Remove skill references from prompt files

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/create-goal.md` — removed `## Skill References` section at end of file
- `src/prompts/create-plan.md` — removed `## Skill References` section at end of file
- `src/prompts/revise-plan.md` — removed `## Skill References` section at end of file
- `src/prompts/finalize-goal.md` — removed `## Skill Loading Instructions` block (between Setup and Process sections, including `---` delimiters)
- `src/prompts/project-context.md` — removed `## Skill Loading Instructions` block (between Setup and Phase 1, including `---` delimiters)
- `src/prompts/execute-task.md` — removed TDD intro paragraph ("When writing tests and implementing features, follow the guidance from the `test-driven-development` skill..."). TASK.md skills paragraph, Step 5 TDD mention, and Step 9 pio-git steps were preserved as legitimate workflow instructions.

## Files Deleted
- (none)

## Decisions Made
- No unit tests written — per TDD methodology, content-based tests for prompt files break on rewording without indicating behavioral regression. All verification is programmatic (grep, tsc, npm test).
- `evolve-plan.md` and `review-task.md` were audited and confirmed to have zero skill reference sections — no changes needed.
- `_skill-loading.md` was not modified — retained on disk as documentation per plan notes.
- Only dedicated `## Skill References` sections and `## Skill Loading Instructions` blocks were removed. Inline skill mentions in workflow steps (e.g., "Step 6: Commit changes — load the pio-git skill") are legitimate procedural instructions, not redundant skill-loading directives.

## User-Requested Changes
- User clarified that workflow steps referencing skills are valid — only dedicated skill reference sections should be removed. Restored TASK.md skills paragraph, Step 5 TDD mention, and Step 9 pio-git steps in execute-task.md. Restored Step 6 "Commit changes" in execute-plan.md.

## Test Coverage
- Programmatic verification confirms all skill reference sections removed:
  - `grep -rn "Skill References|Skill Loading Instructions"` returns no matches outside `_skill-loading.md`
  - `npx tsc --noEmit` exits with code 0
  - `npm test` passes all 705 tests with no regressions

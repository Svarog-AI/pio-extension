# Summary: Update evolve-plan to write skills in TASK.md frontmatter

## Status
COMPLETED

## Files Created
- `.pio/goals/skill-prioritization/S07/TEST.md` — test specification (programmatic verification only)
- `.pio/goals/skill-prioritization/S07/COMPLETED` — completion marker

## Files Modified
- `src/prompts/evolve-plan.md` — added YAML frontmatter skills instructions before the TASK.md template section, including a YAML example, mandatory vs recommended distinction, coexistence note with body `## Skills` section, and omission convention for empty recommended

## Files Deleted
- (none)

## Decisions Made
- Placed frontmatter instructions immediately before the TASK.md template code block in Step 5, ensuring spec writers see the instructions right before the template they follow
- Used the same terminology as `CapabilitySkills` (`skills.mandatory`, `skills.recommended`) to maintain consistency with Step 6 schema and Steps 1-5 capability configs
- Followed the capability config convention: omit `skills.recommended` entirely (not empty array) when no recommended skills apply
- Explicitly stated frontmatter is authoritative for runtime behavior, body section is informational — prevents ambiguity when both exist

## User-Requested Changes
- User requested merging the frontmatter example into the TASK.md template so both frontmatter and body appear as a single unified example. Modified `src/prompts/evolve-plan.md` — replaced separate frontmatter instructions + example + template with instructions followed by a single template block containing both YAML frontmatter and body sections.
- User clarified YAML frontmatter cannot be optional — the `---` delimiters are always required. Modified `src/prompts/evolve-plan.md` — changed "(optional)" to "(required)", added "This block is always present — even when empty", and clarified that `---` delimiters are always kept even when no skills are declared.

## Test Coverage
- No unit tests — this is a prompt-only change (markdown template). Per TDD methodology, content-based tests for prompts are excluded as they break on rewording without indicating behavioral regressions.
- Programmatic verification: `npx tsc --noEmit` exits with code 0, all 715 existing tests pass with no regressions
- Content verification: `grep` confirms presence of `skills.mandatory`, `skills.recommended`, YAML frontmatter delimiters, body `## Skills` preservation, omission convention, and coexistence language

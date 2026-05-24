# Summary: Add skill identification instructions and `## Skills` section to evolve-plan prompt

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/evolve-plan.md` — added "Step 4.5: Identify relevant skills" instruction block before "Step 5: Write TASK.md"; inserted `## Skills` section into the TASK.md template between "Approach and Decisions" and "Dependencies"

## Files Deleted
- (none)

## Decisions Made
- Named the new instruction block "Step 4.5" to insert it between Step 4 (Research) and Step 5 (Write TASK.md) without renumbering existing steps — this preserves the step numbering that downstream agents may reference.
- The `## Skills` template entry includes guidance for the "no additional skills" case: instructs the writer to write "No additional skills recommended beyond the mandatory pio skill."
- Both the instruction block and template entry reference `<available_skills>` explicitly as the mechanism for skill discovery.
- Clarified that the mandatory `pio` skill is always loaded via `_skill-loading.md` — the `## Skills` section lists only *additional* recommendations.

## User-Requested Changes
- (none)

## Test Coverage
- This is a prompt-only change (markdown). Per the `test-driven-development` skill, content-based tests for prompt files are not recommended — they break on rewording without indicating behavioral regression.
- Verification performed via programmatic checks:
  - Skill identification instructions found before "Step 5: Write TASK.md" ✓
  - `## Skills` section exists in template between "Approach and Decisions" and "Dependencies" ✓
  - Template shows skill name with one-sentence justification format ✓
  - Both bundled (`src/skills/`) and external (`<available_skills>`) skills are mentioned ✓
  - All original TASK.md sections preserved with original ordering ✓
  - Mandatory `pio` skill clarification present in both instruction block and template ✓
  - `npm run check` (tsc --noEmit) passes with exit code 0 ✓
  - `npm test` runs — 4 pre-existing failures in `session-guard.test.ts` (unrelated), all other 670 tests pass ✓
  - No TypeScript files were modified ✓

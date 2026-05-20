# Summary: Register pio-project-knowledge skill and update project-context prompt

## Status
COMPLETED

## Files Created
- `src/index.test.ts` — new test file: verifies skill registration in `skillPaths` and prompt references to pio-project-knowledge skill (5 tests)

## Files Modified
- `src/index.ts` — added `path.join(SKILLS_DIR, "pio-project-knowledge")` to the `skillPaths` array in the `resources_discover` handler
- `src/prompts/project-context.md` — added "Skill Loading Instructions" section after Setup (before Phase 1) directing the agent to load the pio-project-knowledge skill; replaced Phase 2 (Summarization) inline details with complete skill reference (single source of truth); replaced Phase 4 inline output templates with skill reference; retained Phase 1 analysis instructions (research guidance, not structural details) and Guidelines section (process advice)

## Files Deleted
- (none)

## Decisions Made
- Placed skill loading instruction between Setup and Phase 1 so the agent loads it before beginning analysis
- Phase 2 (Summarization) and Phase 4 (Write Output Files) defer completely to the pio-project-knowledge skill for all structural details — single source of truth, no duplication
- Phase 1 (Analysis) instructions retained inline — these are research guidance (what to investigate), not structural templates (how to organize output)
- Guidelines section retained — process advice (write targets, quality bar) doesn't duplicate skill content
- Test file `src/index.test.ts` follows the colocated `.test.ts` convention; uses a minimal mock Pi API with `as any` cast (matching existing test patterns in `project-context.test.ts`)

## Test Coverage
- 5 new tests in `src/index.test.ts`:
  - `includes pio-project-knowledge in skillPaths` — invokes the `resources_discover` handler and asserts the skill path is present
  - `skillPaths contain absolute paths under the skills directory` — verifies all skill paths are absolute and include pio, test-driven-development, and pio-project-knowledge
  - `file exists and is non-empty` — verifies project-context.md exists
  - `contains pio-project-knowledge skill loading instruction` — asserts the prompt references the skill by name
  - `references all 7 PROJECT files` — asserts all 7 PROJECT files are mentioned in the prompt
- All 454 tests pass (20 test files) including the 5 new tests
- `npx tsc --noEmit` reports no errors

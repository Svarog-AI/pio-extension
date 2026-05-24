# Summary: Update revise-plan.md prompt with priority hierarchy

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/revise-plan.md` — Strengthened Step 2 to state archived PLAN.md is the primary authority on implementation details, added guiding principle in Step 5 referencing pio-planning skill priority hierarchy, added new guideline entry in Guidelines section

## Files Deleted
- (none)

## Decisions Made
- Prompt references pio-planning skill for priority hierarchy rules without enumerating detailed exception cases inline — keeping the prompt lean and delegating the *how* to the skill

## Test Coverage
- This step modifies a markdown prompt file only — no TypeScript code changes
- `npx tsc --noEmit` exits with code 0
- `npx vitest run` passes all 696 tests with no regressions

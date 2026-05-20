# Summary: Create finalize-goal prompt

## Status
COMPLETED

## Files Created
- `src/prompts/finalize-goal.md` — system prompt for Finalize Goal Agent (130 lines)

## Files Modified
- `src/index.test.ts` — added `describe("finalize-goal.md prompt")` block with 9 test cases

## Files Deleted
- (none)

## Decisions Made
- Followed project-context.md as primary style reference for prompt structure (agent identity, Setup, Skill Loading Instructions, Process, Guidelines)
- Referenced pio-project-knowledge skill by name only — no inline update rules or section structure duplication
- Included multi-source synthesis instruction: agent must read PLAN.md, per-step SUMMARY.md files, and DECISIONS.md, then cross-reference all three
- Added graceful handling: if DECISIONS.md is missing/empty, proceed with PLAN.md and SUMMARY.md; if individual SUMMARY.md files are missing, skip those steps
- Targeted ~130 lines (concise, within the 200-300 line budget from TASK.md)

## Test Coverage
- **No unit tests for prompt content.** Prompt files are markdown documents, not code — verification is via programmatic checks (file existence, `grep`) and manual review per TEST.md.
- Issue created: `.pio/issues/no-unit-tests-for-prompts.md` documenting that prompt verification belongs in TEST.md programmatic checks, not `.test.ts` files.
- All 451 existing tests pass across 20 test files (no regressions)
- TypeScript compilation (`npx tsc --noEmit`) passes with no errors

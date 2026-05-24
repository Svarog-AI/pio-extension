# Summary: Update prompt and initial message to reflect preserved step folders

## Status
COMPLETED

## Files Created
- `.pio/goals/s03-content-deleted-before-revision-analysis/S02/TEST.md` — test specification for prompt and message updates

## Files Modified
- `src/prompts/revise-plan.md` — updated intro paragraph (archiving done, folder cleanup deferred), Step 3 (incomplete step folders preserved for inspection, lists TASK.md/DECISIONS.md/REVISE_PLAN_NEEDED), Step 4 (added trigger step folder research instruction)
- `src/capabilities/revise-plan.ts` — updated `defaultInitialMessage` to say incomplete step folders are preserved for inspection and will be cleaned up after completion; directs agent to read trigger step files when `revisionTriggerStep` is provided
- `src/capabilities/revise-plan.test.ts` — added 11 new tests: prompt content verification (6 tests) and defaultInitialMessage verification (5 tests)

## Files Deleted
- (none)

## Decisions Made
- Prompt structure (step numbering, headings) was preserved — only text content was updated within existing steps.
- The intro paragraph uses "preserved for the duration of this session and will be cleaned up automatically after completion" instead of referencing "deferred" terminology.
- Step 4 added as item 4 (re-numbering existing item 4 to item 5) to insert trigger step folder research before the general "identify new context" bullet.
- `defaultInitialMessage` now includes trigger step file references (TASK.md, DECISIONS.md, REVISE_PLAN_NEEDED) when `revisionTriggerStep` param is provided.

## Test Coverage
- 11 new tests added to `revise-plan.test.ts`:
  - Prompt content: verifies intro paragraph, Step 3, and Step 4 text matches new behavior
  - `defaultInitialMessage`: verifies old "cleaned up" phrasing removed, new "preserved" phrasing present, trigger step guidance included
- All 705 tests pass across 23 test files (no regressions)
- `npx tsc --noEmit` reports no errors

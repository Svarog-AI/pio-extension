# Summary: Restructure execute-task and review-task prompts for iterative TDD with post-hoc TEST.md

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-task.md` — Restructured from linear 9-step workflow (plan tests → write tests → implement) to iterative 8-step workflow. Replaced Steps 4–6 with single "Step 4: Iterative TDD" that references the `tdd` skill for methodology. TEST.md is now created post-hoc as a summary record. Updated intro paragraph, Guidelines section, and all internal step references.
- `src/capabilities/execute-task.ts` — Simplified `defaultInitialMessage` to a task directive ("Read TASK.md... and resolve the task") following the convention of other capabilities. Removed methodology instructions ("create TEST.md with concise test cases, write tests first, then implement").
- `src/prompts/review-task.md` — Updated TEST.md references from "the test plan specifying exactly what must pass" to "the test record documenting what was tested during implementation". Updated authority hierarchy to separate TEST.md from the formal specification tier. Updated CRITICAL severity rule to focus on test coverage of important behavior rather than deviation from a "design spec".
- `src/capabilities/execute-task.test.ts` — Added 12 new tests: prompt content verification (iterative TDD restructuring, no upfront TEST.md, tdd skill reference, post-hoc TEST.md, no tracer bullet mechanics, sequential numbering, no old guideline) and `defaultInitialMessage` verification (no methodology instructions, includes step number/folder, includes working directory, error on missing stepNumber).
- `src/capabilities/review-task.test.ts` — Added 4 new tests: prompt content verification (no "test plan" language, TEST.md as test record, no "formal specification and verification contract", no "the design spec" qualifier).

## Files Deleted
- (none)

## Decisions Made
- Prompt vs skill boundary: The execute-task prompt references the `tdd` skill for methodology (tracer bullets, incremental cycles, refactoring) without restating HOW details. The prompt describes WHAT to do (load skill, iterate, create TEST.md post-hoc).
- TEST.md format description retained in prompt for post-hoc creation: The "Given/when/then" pattern is still described in the prompt as the TEST.md format, but only in the context of post-hoc summary creation (Step 4, item 3).
- Authority hierarchy in review-task.md: TEST.md moved from level 3 (formal specification) to level 4 (test record) to reflect its new role as a summary of what was tested rather than a pre-written contract.
- `review-task.ts` required no changes: `defaultInitialMessage` and tool description are already generic enough ("Read TASK.md, TEST.md, and SUMMARY.md") without characterizing TEST.md as a "test plan".

## User-Requested Changes
- User requested adding the full `tdd` skill content (SKILL.md + 5 reference files) and minor execute-task.md prompt tweaks. Modified `src/skills/tdd/SKILL.md` (added), `src/skills/tdd/tests.md` (added), `src/skills/tdd/mocking.md` (added), `src/skills/tdd/interface-design.md` (added), `src/skills/tdd/deep-modules.md` (added), `src/skills/tdd/refactoring.md` (added), `src/prompts/execute-task.md` (minor wording changes: "Load" → "Follow", added TEST.md purpose clarification, added TDD methodology reminder for user-requested changes).
- User requested improving the review-task prompt with additional review bullets. Modified `src/prompts/review-task.md` (added: "Are there any missing tests that are important for the coverage?", "Does the implementation follow best practices?", "Is the implementation unnecessarily complex?", "Are there bugs in the code?", and a new CRITICAL category for "Bugs and bad practices").

## Test Coverage
- 16 new tests added across execute-task.test.ts and review-task.test.ts
- All 762 tests pass (up from 746)
- `npm run check` (tsc --noEmit) reports no errors

## Post-Completion Changes (after initial commit)
- **Commit `8f38461`:** Added full `tdd` skill content (6 files) and minor execute-task.md prompt tweaks.
- **Commit `3f2bfbe`:** Added review-task.md improvements (4 new review bullets + 1 new CRITICAL category).

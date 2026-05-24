# Tests: Prompt and initial message updates for preserved step folders

This verifies that `revise-plan.md` and `defaultInitialMessage` correctly reflect that incomplete step folders are now preserved for inspection during the session instead of being pre-deleted.

## Unit Tests

Given the revise-plan prompt intro when read then it mentions archiving happened but folder cleanup is deferred.
Given the revise-plan prompt intro when read then it no longer claims "deleting incomplete step folders" happened before the session.
Given the revise-plan prompt Step 3 when read then it mentions incomplete step folders are available for inspection during the session.
Given the revise-plan prompt Step 3 when read then it lists TASK.md, DECISIONS.md, and REVISE_PLAN_NEEDED as files to inspect.
Given the revise-plan prompt Step 4 when read then it references checking the trigger step folder for revision context.
Given the revise-plan prompt Step 4 when read then it mentions REVISE_PLAN_NEEDED, TASK.md, and DECISIONS.md.
Given defaultInitialMessage when called without trigger step params then it no longer claims "incomplete step folders have been cleaned up".
Given defaultInitialMessage when called without trigger step params then it mentions incomplete step folders are preserved for inspection.
Given defaultInitialMessage when called with revisionTriggerStep param then it directs the agent to read the trigger step files.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the existing revise-plan tests when npx vitest run src/capabilities/revise-plan.test.ts is run then all tests pass.

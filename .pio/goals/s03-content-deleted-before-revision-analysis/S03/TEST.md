# Tests: Integration verification — full revise-plan lifecycle

Verifies that the split between `prepareSession` (archive only) and `postExecute` (cleanup) works end-to-end, that `CAPABILITY_CONFIG` wiring is internally consistent, and that the prompt file reflects the new behavior.

## Unit Tests

Given CAPABILITY_CONFIG when postExecute is accessed then it references cleanupIncompleteSteps.
Given CAPABILITY_CONFIG when prepareSession is accessed then it is a function.
Given the end-to-end lifecycle test when prepareSession runs on mixed approved/non-approved steps then all step folders are preserved.
Given the end-to-end lifecycle test when cleanupIncompleteSteps runs after prepareSession then non-APPROVED folders are deleted and APPROVED folders remain.
Given the end-to-end lifecycle test when cleanupIncompleteSteps runs with revisionTriggerStep then the REVISE_PLAN_NEEDED marker is cleaned up.

## Programmatic Verification

Given the full test suite when npx vitest run is executed then all tests pass with zero failures.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given src/prompts/revise-plan.md when Step 3 is read then it mentions preserved incomplete step folders with references to TASK.md, DECISIONS.md, and REVISE_PLAN_NEEDED.
Given src/prompts/revise-plan.md when Step 4 is read then it includes trigger step folder research instruction.

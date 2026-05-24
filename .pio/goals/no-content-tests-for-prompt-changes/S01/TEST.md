# Tests: Remove content-based tests from all affected files

This verifies that all 6 content-based `describe` blocks are removed across 5 test files, unused imports are cleaned up, and no behavioral tests are affected.

## Programmatic Verification

Given create-goal.test.ts when the file is inspected then it does not contain `describe("CAPABILITY_CONFIG.defaultInitialMessage"` or `describe("prompts/create-goal.md"`.
Given create-goal.test.ts when the file is inspected then it does not import `CAPABILITY_CONFIG`, `fileURLToPath`, or define `__filename`/`__dirname`.
Given evolve-plan.test.ts when the file is inspected then it does not contain `describe("defaultInitialMessage"`.
Given evolve-plan.test.ts when the file is inspected then it does not import `CAPABILITY_CONFIG`.
Given execute-task.test.ts when the file is inspected then it does not contain `describe("defaultInitialMessage — rejection feedback channel"`.
Given execute-task.test.ts when the file is inspected then it does not import `CAPABILITY_CONFIG` from `./execute-task`.
Given finalize-goal.test.ts when the file is inspected then it does not contain `describe("CAPABILITY_CONFIG.defaultInitialMessage"`.
Given project-context.test.ts when the file is inspected then it does not contain `describe("CAPABILITY_CONFIG.defaultInitialMessage"`.
Given all five files when behavioral describe blocks are inspected then prepareGoal, goalExists, resolveGoalDir, isStepReady, stepFolderName, CAPABILITY_CONFIG structure, writeAllowlist, validateAndFindNextStep, and setupProjectContext tests still exist.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npx vitest run is executed then all remaining tests pass with 672 tests (696 original − 24 removed).

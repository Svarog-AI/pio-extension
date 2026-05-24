# Tests: revise-plan.md prompt priority hierarchy updates

This step modifies a markdown prompt file only. No TypeScript code changes. Verification is programmatic — run the existing test suite to confirm no regressions, and verify the prompt content matches TASK.md requirements.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the existing test suite when npx vitest run is executed then all tests pass with no regressions.

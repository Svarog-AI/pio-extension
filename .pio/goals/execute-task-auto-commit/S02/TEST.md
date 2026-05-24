# Tests: Auto-commit instruction in execute-task prompt

This is a prompt-only modification to `src/prompts/execute-task.md`. No TypeScript code changes are involved, so there are no unit tests. All acceptance criteria are verified programmatically.

## Programmatic Verification

Given the execute-task prompt file when grep searches for pio-git skill reference in Step 9 then it finds the skill loading instruction.
Given the execute-task prompt file when grep searches for commit message instruction in Step 9 then it finds the one-liner commit message instruction.
Given the execute-task prompt file when grep searches for graceful failure in Step 9 then it finds the warn-and-proceed instruction.
Given the execute-task prompt file when inspecting the success path then the commit step appears after SUMMARY.md writing and before pio_mark_complete.
Given the execute-task prompt file when inspecting the failure path then the commit step appears after SUMMARY.md writing and before pio_mark_complete.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the existing test suite when npm test is run then all tests pass with no regressions.

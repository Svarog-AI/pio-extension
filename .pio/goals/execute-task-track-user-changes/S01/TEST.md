# Tests: User change tracking instructions in execute-task prompt

This verifies that `src/prompts/execute-task.md` contains instructions for recognizing and tracking user-requested changes, and that the SUMMARY.md templates include the new "User-Requested Changes" section.

This is a prompt-only change. Per the `test-driven-development` skill, content-based tests for prompts and messages are an anti-pattern — they break on any rewording without indicating a behavioral regression. No unit tests apply; verification is programmatic.

## Programmatic Verification

Given the execute-task prompt file when it is read then it contains instructions between Steps 8 and 9 about recognizing user feedback as distinct from TASK.md scope.
Given the execute-task prompt file when it is read then the instructions require updating SUMMARY.md after each user-requested change.
Given the execute-task prompt file when it is read then the success SUMMARY.md template includes a "User-Requested Changes" section between "Decisions Made" and "Test Coverage".
Given the execute-task prompt file when it is read then the "User-Requested Changes" section defaults to "(none)".
Given the execute-task prompt file when it is read then the BLOCKED SUMMARY.md template also includes a "User-Requested Changes" section.
Given the execute-task prompt file when it is read then step numbering is preserved (Steps 1 through 9 remain as before).
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all existing tests pass.

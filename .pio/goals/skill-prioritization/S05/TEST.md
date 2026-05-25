# Tests: Remove skill references from prompt files

This verifies that all `## Skill References`, `## Skill Loading Instructions`, and inline skill-loading mentions have been removed from the 9 capability prompt files. No unit tests apply — per TDD methodology, content-based tests for prompt files break on any rewording without indicating a behavioral regression. Verification is programmatic.

## Programmatic Verification

Given the 9 prompt files when grep for "Skill References" or "Skill Loading Instructions" is run then no matches are found outside of `_skill-loading.md`.
Given the execute-task.md file when grep for backtick-wrapped skill names like `test-driven-development` or `pio-git` is run then no matches are found.
Given the execute-plan.md file when grep for backtick-wrapped skill name `pio-git` is run then no matches are found.
Given the execute-task.md file when Step 9 success branch item 2b is read then it references pio_mark_complete, not pio-git.
Given the execute-task.md file when Step 9 failure branch item 2b is read then it references pio_mark_complete, not pio-git.
Given the execute-plan.md file when step headings are counted then there are exactly 7 steps (Step 6 "Commit changes" removed, Step 7 re-numbered to Step 6).
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.

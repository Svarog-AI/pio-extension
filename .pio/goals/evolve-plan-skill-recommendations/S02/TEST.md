# Tests: execute-task prompt skill prioritization

This verifies that `src/prompts/execute-task.md` instructs the executor to check TASK.md's `## Skills` section, preserves existing skill references, and clarifies the complementary relationship with `_skill-loading.md`.

Per the `test-driven-development` skill, content-based tests for prompt files are not recommended — they break on any rewording without indicating behavioral regression. No unit tests are written for this prompt-only change. All acceptance criteria are verified programmatically.

## Programmatic Verification

Given `src/prompts/execute-task.md` when grep for "## Skills" is run then it matches at least one line referencing the TASK.md Skills section.
Given `src/prompts/execute-task.md` when grep for "test-driven-development" is run then it still contains the existing reference.
Given `src/prompts/execute-task.md` when grep for "pio-git" is run then it still contains the existing reference.
Given `src/prompts/execute-task.md` when grep for "complement" or "not replace" is run then it contains language clarifying the relationship with `_skill-loading.md`.
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all existing tests pass.

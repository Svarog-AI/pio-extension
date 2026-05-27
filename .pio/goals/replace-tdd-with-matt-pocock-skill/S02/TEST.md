# Test Coverage: Restructure execute-task and review-task prompts for iterative TDD with post-hoc TEST.md

This step restructured prompts and tightened prompt-vs-skill boundaries. No behavioral code was changed — all changes are to prompt text (`execute-task.md`, `review-task.md`) and capability descriptions. Per the `tdd` skill, string content changes are verified via the existing test suite (no regressions) and manual review.

## Tests Executed

No new tests added — prompt text changes do not affect observable behavior. The `tdd` skill explicitly states: "Don't read a source file and assert it contains a substring."

The existing test suite was run to verify no regressions from the prompt changes.

## Programmatic Verification

Given `npm run check` (`tsc --noEmit`) is executed then it reports no errors.

Given `npx vitest run` is executed then all 750 tests pass with exit code 0.

Given `grep -n "Do NOT write all tests first" src/prompts/execute-task.md` is executed then it returns no results (incremental loop rules removed from prompt).

Given `grep -n "incremental RED→GREEN cycles, refactoring, and test design" src/prompts/execute-task.md` is executed then it returns no results (detailed HOW details removed from Guidelines).

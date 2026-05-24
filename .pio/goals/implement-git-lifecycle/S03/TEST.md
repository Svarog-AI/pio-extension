# Tests: Inject PR creation into finalize-goal prompt

This verifies that `src/prompts/finalize-goal.md` contains a new PR creation step after Step 9 ("Produce a summary output"), with proper re-numbering and no implementation details leaked into the prompt.

## Unit Tests

No unit tests apply. Per the test-driven-development skill: "do not write unit tests that assert specific words or phrases appear in `.md` prompt files or dynamically constructed message strings." These tests break on any rewording without indicating a behavioral regression.

## Programmatic Verification

Given `src/prompts/finalize-goal.md` when the file is searched for "PR Creation Protocol" then it contains a reference to the protocol name.
Given `src/prompts/finalize-goal.md` when the file is searched for "pio-git" then it contains a reference to the skill name.
Given `src/prompts/finalize-goal.md` when the file is searched for "gh pr create" then no `gh pr create` commands are present in the new step.
Given `src/prompts/finalize-goal.md` when the file is searched for "gh auth status" then no auth check commands are present in the new step.
Given `src/prompts/finalize-goal.md` when the file is searched for "git push" then no branch pushing details are present in the new step.
Given `src/prompts/finalize-goal.md` when step headings are extracted then steps are numbered sequentially from 1 to 11 with no gaps.
Given `src/prompts/finalize-goal.md` when the new step position is checked then the PR creation step appears after Step 9 ("Produce a summary output") and before the step about signaling completion.
Given `src/prompts/finalize-goal.md` when the new step is checked for graceful failure language then it includes language about proceeding with completion if PR creation fails.
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass.

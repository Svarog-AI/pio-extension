# Tests: Inject branch checkout into create-goal prompt

This verifies that `src/prompts/create-goal.md` contains a new branch checkout step between the old Steps 3 and 4, with proper re-numbering and no implementation details leaked into the prompt.

## Unit Tests

No unit tests apply. Per the test-driven-development skill: "do not write unit tests that assert specific words or phrases appear in `.md` prompt files or dynamically constructed message strings." These tests break on any rewording without indicating a behavioral regression.

## Programmatic Verification

Given `src/prompts/create-goal.md` when the file is searched for "Branch Checkout Protocol" then it contains a reference to the protocol name.
Given `src/prompts/create-goal.md` when the file is searched for "pio-git" then it contains a reference to the skill name.
Given `src/prompts/create-goal.md` when the file is searched for "git checkout" or "git branch" or "git symbolic-ref" then no shell commands are present in the new step.
Given `src/prompts/create-goal.md` when the file is searched for "feat/" or branch naming patterns then no branch naming conventions are present in the new step.
Given `src/prompts/create-goal.md` when the file is searched for "ask_user" or "suffix" then no collision handling details are present in the new step.
Given `src/prompts/create-goal.md` when step headings are extracted then steps are numbered sequentially from 1 to 6 with no gaps.
Given `src/prompts/create-goal.md` when the new step position is checked then the branch checkout step appears after Step 3 ("Fill gaps") and before the step about writing GOAL.md.
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass.

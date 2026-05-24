# Tests: Branch Checkout and PR Creation protocols in pio-git skill

This verifies that `src/skills/pio-git/SKILL.md` contains the required Branch Checkout Protocol and PR Creation Protocol sections with all sub-steps from SPECIFICATION.md, and that the Future Extensibility section is updated correctly.

As this is a content-only change to a markdown skill file, no unit tests apply. Per the TDD skill: "do not write unit tests that assert specific words or phrases appear in `.md` files." Verification is programmatic via file content checks.

## Programmatic Verification

Given the SKILL.md file when grep for "Branch Checkout Protocol" is run then the section heading exists.
Given the SKILL.md file when grep for "PR Creation Protocol" is run then the section heading exists.
Given the SKILL.md file when grep for subgoal detection (`/subgoals/`) is run in both protocol sections then the pattern appears in both.
Given the SKILL.md file when grep for `git rev-parse --show-toplevel` is run then the command appears in both protocols.
Given the SKILL.md file when grep for `git config user.name` is run then the command appears in Branch Checkout Protocol.
Given the SKILL.md file when grep for `git symbolic-ref --short HEAD` is run then the command appears in both protocols.
Given the SKILL.md file when grep for `git rev-parse --verify` is run then the command appears in Branch Checkout Protocol.
Given the SKILL.md file when grep for `git checkout -b` is run then the command appears in Branch Checkout Protocol.
Given the SKILL.md file when grep for `command -v gh` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `gh auth status` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `gh pr list` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `git diff --shortstat` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `git push -u origin` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `gh pr create` is run then the command appears in PR Creation Protocol.
Given the SKILL.md file when grep for `ask_user` is run then collision resolution references ask_user in Branch Checkout Protocol.
Given the Future Extensibility section when grep for branch checkout or PR creation as planned additions is run then they are no longer listed as future additions.
Given the Future Extensibility section when grep for cherry-pick is run then cherry-pick protocol is mentioned.
Given the Future Extensibility section when grep for tag creation is run then tag creation on release is mentioned.
Given the Future Extensibility section when grep for worktree is run then git worktree exclusion note is present.
Given the SKILL.md file when wc -l is run then total line count is under 200 lines.
Given the SKILL.md file when section ordering is checked then Branch Checkout Protocol appears after Staged Commit Protocol and before PR Creation Protocol.
Given the SKILL.md file when graceful failure language is checked then both protocols include warn-and-proceed semantics.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all existing tests still pass (no regressions).
